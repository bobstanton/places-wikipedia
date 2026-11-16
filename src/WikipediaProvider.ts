import type { VaultQueryTableProvider } from 'vaultquery/provider-types';
import { DEFINITION_LANGUAGE, DEFAULT_CACHE_MAX_AGE_MS, parseDefinition, type WikipediaSearch } from './Definition';
import { DEFAULT_SETTINGS } from 'places-shared/settings';
import type { UnitsSystem } from 'places-shared/units';
import type { WikipediaClient } from './WikipediaClient';
import { WIKIPEDIA_COMPLETIONS } from './CodeBlockDefinitions';

export const PROVIDER_ID = 'places-wikipedia';
export const TABLE_NAME = 'wiki_places';

export function createWikipediaProvider(client: WikipediaClient, getUnits: () => UnitsSystem = () => DEFAULT_SETTINGS.units): VaultQueryTableProvider {
  return {
    id: PROVIDER_ID,
    displayName: 'Wikipedia',
    tables: [{
      name: TABLE_NAME,
      description: 'Nearby Wikipedia articles',
      primaryKey: ['search_id', 'wiki', 'page_id'],
      defaultStaleAfterMs: DEFAULT_CACHE_MAX_AGE_MS,
      columns: [
        { name: 'search_id', type: 'TEXT', nullable: false, description: "Matches the definition block's id" },
        { name: 'wiki', type: 'TEXT', nullable: false, description: 'Base URL of the Wikipedia edition' },
        { name: 'page_id', type: 'INTEGER', nullable: false, description: 'Unique within one wiki' },
        { name: 'title', type: 'TEXT', nullable: false, description: 'Marker label' },
        { name: 'location', type: 'TEXT', nullable: false, description: 'Latitude, longitude for Places' },
        { name: 'url', type: 'TEXT', nullable: false },
        { name: 'latitude', type: 'REAL', nullable: false, description: 'Decimal degrees' },
        { name: 'longitude', type: 'REAL', nullable: false, description: 'Decimal degrees' },
        { name: 'distance_m', type: 'REAL', nullable: false, description: 'From the search center' },
        { name: 'type', type: 'TEXT', nullable: true, description: 'GeoData classification, e.g. landmark' },
        { name: 'country', type: 'TEXT', nullable: true },
        { name: 'region', type: 'TEXT', nullable: true },
        { name: 'description', type: 'TEXT', nullable: true, description: 'Plain text introduction' },
        { name: 'thumbnail_url', type: 'TEXT', nullable: true, description: 'Marker or popup image' },
        { name: 'thumbnail_page_url', type: 'TEXT', nullable: true, description: 'Image credits' },
      ],
    }],
    definitionBlock: {
      language: DEFINITION_LANGUAGE,
      parse(source) {
        const search = parseDefinition(source, getUnits());

        return { id: search.id, displayName: search.id, requestedTables: [TABLE_NAME], request: { ...search } };
      },
      completions: WIKIPEDIA_COMPLETIONS,
    },
    async refresh({ definitionId, request, signal }) {
      if (!request || request.id !== definitionId) throw new Error('Missing Wikipedia search definition.');
      const result = await client.search(request as unknown as WikipediaSearch, signal);

      return {
        tables: {
          [TABLE_NAME]: {
            replaceWhere: { search_id: definitionId },
            rows: result.articles.map(article => ({ search_id: definitionId, ...article })),
            asOf: result.asOf,
            expiresAt: result.expiresAt,
          },
        },
      };
    },
  };
}
