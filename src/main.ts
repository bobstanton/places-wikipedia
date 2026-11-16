import { type App, Plugin, requestUrl } from 'obsidian';
import { registerVaultQueryTableProviders } from 'vaultquery/api';
import { registerPlaceExtensionLifecycle, PLACES_EXTENSION_API_VERSION, type IPlacePluginExtension, type IPlacePluginExtensionExports } from "places-shared/obsidian/services";
import type { IPlacesHostServices } from "places-shared/obsidian/services";
import { WikipediaClient } from './WikipediaClient';
import { createWikipediaProvider } from './WikipediaProvider';
import { createWikipediaPopupRenderer } from './WikipediaPopup';
import { WIKIPEDIA_BLOCK, WIKIPEDIA_HIGHLIGHTS } from './CodeBlockDefinitions';
import { WikipediaNotes } from './WikipediaNotes';
import { DEFAULT_SETTINGS, type IPlacesExtensionHostSettings, type IPlaceExtensionSettings } from 'places-shared/settings';
import type { UnitsSystem } from 'places-shared/units';
import './styles.css';

export default class PlacesWikipediaPlugin extends Plugin implements IPlacePluginExtension {
  private units: UnitsSystem = DEFAULT_SETTINGS.units;
  private host?: IPlacesHostServices;
  private notes?: WikipediaNotes;

  getPlaceExports(_app?: App, _settings?: IPlaceExtensionSettings, hostSettings?: IPlacesExtensionHostSettings, host?: IPlacesHostServices): IPlacePluginExtensionExports {
    if (hostSettings) this.units = hostSettings.units;
    if (host) this.host = host;
    this.notes ??= new WikipediaNotes(this.app, () => this.host?.placeNotes);

    return {
      apiVersion: PLACES_EXTENSION_API_VERSION,
      popupRenderers: [createWikipediaPopupRenderer(this.notes)],
      codeBlockDefinitions: [WIKIPEDIA_BLOCK],
      highlightConfigs: WIKIPEDIA_HIGHLIGHTS,
    };
  }

  onload(): void {
    const client = new WikipediaClient(async url => {
      const response = await requestUrl({
        url,
        headers: {
          'User-Agent': `PlacesWikipedia/${this.manifest.version} (https://github.com/bobstanton)`,
          'Api-User-Agent': `PlacesWikipedia/${this.manifest.version} (https://github.com/bobstanton)`,
          Accept: 'application/json',
        },
        throw: false,
      });
      const json: unknown = response.status >= 200 && response.status < 300 ? response.json : null;

      return { status: response.status, headers: response.headers, json };
    });

    this.register(() => client.dispose());
    registerPlaceExtensionLifecycle(this);

    const registration = registerVaultQueryTableProviders(this.app, {
      pluginId: this.manifest.id,
      providers: [createWikipediaProvider(client, () => this.units)],
    });

    this.register(() => { void registration.then(ready => ready.dispose()); });
  }
}
