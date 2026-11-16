import type { App, TFile } from 'obsidian';
import type { PlaceNoteHost } from 'places-shared/map';
import { httpsUrl } from './WikipediaClient';

export interface WikipediaNoteArticle {
  title: string;
  latitude: number;
  longitude: number;
  url: string;
  description?: string;
  wiki?: string;
  pageId?: number;
}

// Only this plugin interprets article URLs. The host receives an ordinary
// place-note request, like a geocoding result, with its source as Website.
export class WikipediaNotes {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly app: App, private readonly getHost: () => PlaceNoteHost | undefined) {}

  get available(): boolean { return this.getHost() !== undefined; }

  findExisting(article: WikipediaNoteArticle): TFile | undefined {
    const keys = new Set<string>();
    const key = articleUrlKey(article.url);

    if (key) keys.add(key);

    if (article.wiki && Number.isInteger(article.pageId) && article.pageId! > 0) {
      const idKey = articleUrlKey(`${article.wiki}/?curid=${article.pageId}`);

      if (idKey) keys.add(idKey);
    }

    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

      if (!frontmatter) continue;

      for (const [name, value] of Object.entries(frontmatter)) {
        if (!['website', 'wikipedia'].includes(name.toLowerCase())) continue;
        const urls = Array.isArray(value) ? value as unknown[] : [value as unknown];

        if (urls.some(url => {
          const key = typeof url === 'string' ? articleUrlKey(url) : undefined;

          return key !== undefined && keys.has(key);
        })) return file;
      }
    }

    return undefined;
  }

  async createOrOpen(article: WikipediaNoteArticle, sourcePath?: string, includeSummary = true): Promise<void> {
    const key = articleUrlKey(article.url);

    if (!key) throw new Error('A valid Wikipedia article URL is required.');
    const pending = this.pending.get(key);

    if (pending) return pending;
    const operation = this.perform(article, sourcePath, includeSummary);

    this.pending.set(key, operation);

    try {
 await operation; 
}
    finally {
 if (this.pending.get(key) === operation) this.pending.delete(key); 
}
  }

  private async perform(article: WikipediaNoteArticle, sourcePath: string | undefined, includeSummary: boolean): Promise<void> {
    // Recheck at click time: another popup may have saved it since rendering.
    const existing = this.findExisting(article);

    if (existing) {
      await this.app.workspace.getLeaf('tab').openFile(existing);

      return;
    }

    const host = this.getHost();

    if (!host) throw new Error('Enable Places to create a place note.');
    const summary = includeSummary && article.description?.trim();

    await host.createNote({
      kind: 'place', name: article.title, lat: article.latitude, lng: article.longitude,
      website: article.url, sourcePath,
      // Escape article text so it cannot introduce Markdown fences or links.
      body: summary ? `## Summary\n\n${escapeMarkdownText(summary)}\n\n[Source: Wikipedia](<${article.url}>)` : undefined,
    });
  }
}

function escapeMarkdownText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([`*_{}[\]<>!#|])/g, '\\$1');
}

export function articleUrlKey(value: string): string | undefined {
  const safe = httpsUrl(value);

  if (!safe) return;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase().replace(/\.m\.wikipedia\.org$/, '.wikipedia.org');

  if (!/^[a-z][a-z0-9-]{0,30}\.wikipedia\.org$/.test(host)) return;
  const id = url.searchParams.get('curid');

  if (id && /^\d+$/.test(id)) return `${host}/?curid=${Number(id)}`;
  const title = url.pathname.startsWith('/wiki/') ? url.pathname.slice(6)
    : url.pathname === '/w/index.php' ? url.searchParams.get('title') : undefined;

  if (!title) return;

  try {
 return `${host}/wiki/${decodeURIComponent(title).replace(/ /g, '_')}`; 
}
  catch {
 return; 
}
}
