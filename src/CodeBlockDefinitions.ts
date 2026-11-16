import type { CodeBlockDefinition, CodeBlockHighlightConfig } from "places-shared/obsidian/services";
import type { ProviderDefinitionCompletionConfig } from 'vaultquery/provider-types';
import { CACHE_PARAMETER_DESCRIPTION, CACHE_PARAMETER_VALUES, CACHE_VALUE_SUGGESTIONS } from 'places-shared/settings';
import { DEFINITION_LANGUAGE } from './Definition';

export const POPUP_RENDERER_ID = 'wikipedia.summary';

const LANGUAGES: Record<string, string> = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', ja: 'Japanese', zh: 'Chinese',
};

export const WIKIPEDIA_BLOCK: CodeBlockDefinition = {
  type: DEFINITION_LANGUAGE,
  description: 'Populate wiki_places with nearby articles',
  parameters: [
    { name: 'id', description: 'Required; unique across searches', values: { examples: ['scranton'] } },
    { name: 'location', description: 'Required latitude, longitude', values: { examples: ['41.4086, -75.6624'] } },
    { name: 'radius', description: '10m to 10km. Bare numbers use Places units', values: { examples: ['500m', '5km', '3mi', '10km'], default: '10km' } },
    { name: 'limit', description: '1 to 500 articles', values: { examples: ['10', '50', '100', '500'], default: '50' } },
    { name: 'language', description: 'Wikipedia edition', values: { examples: Object.keys(LANGUAGES), default: 'en' } },
    { name: 'cache', description: CACHE_PARAMETER_DESCRIPTION, values: CACHE_PARAMETER_VALUES },
  ],
};

export const WIKIPEDIA_COMPLETIONS: ProviderDefinitionCompletionConfig = {
  keys: WIKIPEDIA_BLOCK.parameters.map(parameter => ({ label: parameter.name, detail: parameter.description })),
  values: {
    ...Object.fromEntries(WIKIPEDIA_BLOCK.parameters.map(parameter => {
      const values = parameter.values;
      const labels = typeof values === 'string' ? [] : 'examples' in values ? values.examples : values.choices;

      return [parameter.name.toLowerCase(), labels.map(label => ({
        label,
        detail: parameter.name === 'language' ? LANGUAGES[label]
          : typeof values !== 'string' && values.default === label ? 'Default' : undefined,
      }))];
    })),
    cache: CACHE_VALUE_SUGGESTIONS.map(({ value, detail }) => ({ label: value, detail })),
  },
};

export const WIKIPEDIA_HIGHLIGHTS: CodeBlockHighlightConfig[] = [{
  blockType: DEFINITION_LANGUAGE,
  validKeys: WIKIPEDIA_BLOCK.parameters.map(parameter => parameter.name),
}, {
  blockType: 'places',
  validKeys: [],
  nestedKeys: {
    [`content.options.${POPUP_RENDERER_ID}`]: [
      { name: 'units', description: 'Default: metric' },
      { name: 'includeSummary', description: 'Include the article introduction in a newly created note. Default: true' },
    ],
  },
  knownValues: { [`content.options.${POPUP_RENDERER_ID}.units`]: ['metric', 'imperial'],
    [`content.options.${POPUP_RENDERER_ID}.includeSummary`]: ['true', 'false'] },
}];
