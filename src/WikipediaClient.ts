import { isRecord, DEFAULT_CACHE_MAX_AGE_MS, type WikipediaSearch } from './Definition';
import { cachePolicyRetention, isCacheEntryStale, providerExpiresAt } from 'places-shared/settings';

export interface WikipediaArticle {
  wiki: string;
  page_id: number;
  title: string;
  location: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  type: string | null;
  country: string | null;
  region: string | null;
  url: string;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_page_url: string | null;
}

export interface WikipediaResult {
  articles: WikipediaArticle[];
  asOf: number;
  expiresAt?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  json: unknown;
}

export type WikipediaTransport = (url: string) => Promise<HttpResponse>;

interface PendingSearch {
  promise: Promise<WikipediaResult>;
  controller: AbortController;
  readers: number;
}

// The transport is supplied by the Obsidian host; this class also runs in tests.
export class WikipediaClient {
  private readonly cached = new Map<string, { result: WikipediaResult; retention?: 'forever' }>();
  private readonly pending = new Map<string, PendingSearch>();
  private readonly blockedUntil = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(private readonly transport: WikipediaTransport, private readonly now = Date.now) {}

  async search(search: WikipediaSearch, signal?: AbortSignal): Promise<WikipediaResult> {
    signal?.throwIfAborted();
    this.checkActive();
    const { id: _id, ...parameters } = search;
    const key = JSON.stringify(parameters);
    const cached = this.cached.get(key);

    if (search.cachePolicy.enabled && cached && !isCacheEntryStale(search.cachePolicy, cached.result.asOf, DEFAULT_CACHE_MAX_AGE_MS, this.now())) return cached.result;
    let pending = this.pending.get(key);

    if (!pending) {
      // Serialize requests across searches, as recommended by Wikimedia.
      const controller = new AbortController();
      const promise = this.queue.then(() => this.loadArticles(search, controller.signal)).then(result => {
        controller.signal.throwIfAborted();

        if (search.cachePolicy.enabled) {
          this.cached.delete(key);
          this.cached.set(key, { result, retention: cachePolicyRetention(search.cachePolicy) });
          const ordinary = [...this.cached].filter(([, entry]) => entry.retention !== 'forever');

          for (const [oldest] of ordinary.slice(0, Math.max(0, ordinary.length - 50))) this.cached.delete(oldest);
        }

        return result;
      });

      pending = { promise, controller, readers: 0 };
      this.pending.set(key, pending);
      const operation = pending;

      this.queue = promise.catch(() => undefined).finally(() => {
        if (this.pending.get(key) === operation) this.pending.delete(key);
      });
    }

    pending.readers++;

    try {
      const result = await abortable(pending.promise, signal);

      signal?.throwIfAborted();
      this.checkActive();

      return result;
    } finally {
      if (--pending.readers === 0) {
        pending.controller.abort();
        if (this.pending.get(key) === pending) this.pending.delete(key);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const pending of this.pending.values()) pending.controller.abort();
    this.pending.clear();
    this.cached.clear();
  }

  private checkActive(): void {
    if (this.disposed) throw new Error('Wikipedia provider has unloaded.');
  }

  private async loadArticles(search: WikipediaSearch, signal: AbortSignal): Promise<WikipediaResult> {
    const wiki = `https://${search.language}.wikipedia.org`;
    const nearby = await this.query(wiki, {
      list: 'geosearch', gscoord: `${search.latitude}|${search.longitude}`,
      gsradius: String(Math.round(search.radius)), gslimit: String(search.limit),
      gsprimary: 'primary', gsnamespace: '0', gsglobe: 'earth',
      gsprop: 'type|country|region',
    }, signal);
    const query = isRecord(nearby.query) ? nearby.query : {};

    if (!Array.isArray(query.geosearch)) throw new Error('Wikipedia returned no geosearch result array.');
    const articles = query.geosearch.map(value => parseArticle(value, wiki));

    // TextExtracts supports at most 20 extracts per request. Query explicit IDs
    // rather than repeating the geographic search for each metadata batch.
    for (let start = 0; start < articles.length; start += 20) {
      const batch = articles.slice(start, start + 20);
      const parameters = {
        pageids: batch.map(article => article.page_id).join('|'),
        prop: 'info|extracts|pageimages', inprop: 'url',
        exintro: '1', explaintext: '1', exsentences: '2', exlimit: 'max',
        piprop: 'thumbnail|name', pithumbsize: '400',
      };
      const seen = new Set<string>();
      let continuation: Record<string, string> = {};

      do {
        const result = await this.query(wiki, { ...parameters, ...continuation }, signal);
        const details = isRecord(result.query) ? result.query : {};

        if (!Array.isArray(details.pages)) throw new Error('Wikipedia returned no article details array.');

        for (const page of details.pages) {
          if (!isRecord(page)) throw new Error('Wikipedia returned invalid article details.');
          const article = batch.find(candidate => candidate.page_id === page.pageid);

          if (article) enrichArticle(article, page, wiki);
        }

        continuation = {};

        if (isRecord(result.continue)) {
          for (const [key, value] of Object.entries(result.continue)) {
            if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid Wikipedia continuation.');
            continuation[key] = String(value);
          }

          const token = JSON.stringify(continuation);

          if (seen.has(token) || seen.size >= 100) throw new Error('Wikipedia repeated its continuation.');
          seen.add(token);
        }
      } while (Object.keys(continuation).length);
    }

    this.checkActive();
    const asOf = this.now();

    return { articles, asOf, expiresAt: providerExpiresAt(search.cachePolicy, asOf, DEFAULT_CACHE_MAX_AGE_MS) };
  }

  private async query(wiki: string, parameters: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown>> {
    this.checkActive();
    signal.throwIfAborted();
    const until = this.blockedUntil.get(wiki) ?? 0;

    if (until > this.now()) throw new Error(`Wikipedia requests paused until ${new Date(until).toISOString()}.`);
    const url = new URL('/w/api.php', wiki);

    url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', maxlag: '5', ...parameters }).toString();
    const response = await this.transport(url.href);

    this.checkActive();
    signal.throwIfAborted();
    const data = response.json;
    const apiError = isRecord(data) && isRecord(data.error) ? data.error : undefined;

    if (response.status === 429 || response.status === 503 || apiError?.code === 'maxlag' || apiError?.code === 'ratelimited') {
      const header = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'retry-after')?.[1];
      const retryMs = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - this.now() : 60_000;

      this.blockedUntil.set(wiki, this.now() + (Number.isFinite(retryMs) ? Math.max(1000, retryMs) : 60_000));
    }

    if (response.status < 200 || response.status >= 300) throw new Error(`Wikipedia request returned HTTP ${response.status}.`);
    if (!isRecord(data)) throw new Error('Wikipedia returned an invalid API response.');
    if (apiError) throw new Error(`Wikipedia: ${text(apiError.info) ?? text(apiError.code) ?? 'API request failed'}`);

    return data;
  }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('Wikipedia search canceled.'));

    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function parseArticle(value: unknown, wiki: string): WikipediaArticle {
  if (!isRecord(value) || typeof value.pageid !== 'number' || !Number.isInteger(value.pageid) || value.pageid <= 0
    || typeof value.title !== 'string' || !finite(value.lat) || Math.abs(value.lat) > 90
    || !finite(value.lon) || Math.abs(value.lon) > 180 || !finite(value.dist) || value.dist < 0) {
    throw new Error('Wikipedia returned an invalid geographic result.');
  }

  return {
    wiki, page_id: value.pageid, title: value.title,
    latitude: value.lat, longitude: value.lon, location: `${value.lat}, ${value.lon}`, distance_m: value.dist,
    type: text(value.type), country: text(value.country), region: text(value.region),
    url: `${wiki}/?curid=${value.pageid}`, description: null, thumbnail_url: null, thumbnail_page_url: null,
  };
}

function enrichArticle(article: WikipediaArticle, page: Record<string, unknown>, wiki: string): void {
  if (typeof page.fullurl === 'string') article.url = httpsUrl(page.fullurl) ?? article.url;
  if (typeof page.extract === 'string') article.description = text(page.extract);
  if (isRecord(page.thumbnail)) article.thumbnail_url = httpsUrl(page.thumbnail.source);

  if (typeof page.pageimage === 'string' && page.pageimage) {
    article.thumbnail_page_url = `${wiki}/wiki/File:${encodeURIComponent(page.pageimage.replace(/ /g, '_'))}`;
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);

    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
