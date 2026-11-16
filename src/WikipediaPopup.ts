import type { PopupDomRenderer } from 'places-shared/map';
import { Notice } from 'obsidian';
import { isRecord } from './Definition';
import { httpsUrl } from './WikipediaClient';
import { POPUP_RENDERER_ID } from './CodeBlockDefinitions';
import { articleUrlKey, type WikipediaNoteArticle, type WikipediaNotes } from './WikipediaNotes';

export function createWikipediaPopupRenderer(notes?: WikipediaNotes): PopupDomRenderer {
  return {
    id: POPUP_RENDERER_ID,
    description: 'Wikipedia thumbnail, introduction, distance, article link and place note action',
    kind: 'dom',
    render({ container, context, options, target, markdownSourcePath, onDispose }) {
      const row = isRecord(context.row) ? { ...context, ...context.row } : context;
      const url = httpsUrl(row.url);

      if (!url) throw new Error('wikipedia.summary requires an HTTPS article URL.');
      const root = container.createDiv({ cls: 'places-wikipedia-popup' });
      const thumbnail = httpsUrl(row.thumbnail_url);

      if (thumbnail) {
        const frame = root.createEl('a');

        frame.href = httpsUrl(row.thumbnail_page_url) ?? url;
        frame.target = '_blank';
        frame.rel = 'noopener noreferrer';
        frame.title = 'View image and credits';
        const image = frame.createEl('img');

        image.src = thumbnail;
        image.alt = typeof row.title === 'string' ? row.title : 'Wikipedia image';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => frame.remove(), { once: true });
      }

      if (typeof row.description === 'string' && row.description.trim()) {
        const summary = root.createEl('p');

        summary.textContent = row.description;
      }

      if (typeof row.distance_m === 'number' && Number.isFinite(row.distance_m) && row.distance_m >= 0) {
        const distance = root.createEl('p');

        distance.className = 'places-wikipedia-distance';
        distance.textContent = `${formatDistance(row.distance_m, options?.units === 'imperial')} from search center`;
      }

      const link = root.createEl('a');

      link.href = url;
      link.textContent = 'Read on Wikipedia';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'external-link';
      const place = target?.kind === 'place' ? target.place : undefined;
      const latitude = typeof row.latitude === 'number' ? row.latitude : place?.latitude;
      const longitude = typeof row.longitude === 'number' ? row.longitude : place?.longitude;
      const title = typeof row.title === 'string' ? row.title.trim() : place?.name.trim();

      if (notes?.available && title && articleUrlKey(url)
        && typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
        && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
        const article: WikipediaNoteArticle = { title, latitude, longitude, url,
          description: typeof row.description === 'string' ? row.description : undefined,
          wiki: typeof row.wiki === 'string' ? row.wiki : undefined,
          pageId: typeof row.page_id === 'number' ? row.page_id : undefined };
        const button = root.createEl('button');

        button.type = 'button';
        button.className = 'places-wikipedia-note-button';

        const updateLabel = () => {
          button.textContent = notes.findExisting(article) ? 'Open existing note' : 'Create place note';
        };

        updateLabel();
        let disposed = false;

        onDispose?.(() => { disposed = true; });
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (button.disabled || disposed) return;
          button.disabled = true;
          const sourcePath = markdownSourcePath ?? target?.markdownSourcePath;

          void notes.createOrOpen(article, sourcePath, options?.includeSummary !== false).catch(error => {
            new Notice(`Could not create or open the place note: ${error instanceof Error ? error.message : String(error)}`);
          }).finally(() => {
            if (!disposed) { button.disabled = false; updateLabel(); }
          });
        });
      }
    },
  };
}

function formatDistance(meters: number, imperial: boolean): string {
  if (imperial) return meters < 1609.344 ? `${Math.round(meters / 0.3048)} ft` : `${(meters / 1609.344).toFixed(1)} mi`;

  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
