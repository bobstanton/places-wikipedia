import { DEFAULT_SETTINGS, parseCodeBlockYaml, parseLongDistanceAsKilometers, parseCacheSetting, type CachePolicy } from 'places-shared/settings';
import { kmToMeters, type UnitsSystem } from 'places-shared/units';

export const DEFINITION_LANGUAGE = 'places-wikipedia-vaultquery';
export const DEFAULT_CACHE_MAX_AGE_MS = 24 * 3_600_000;

export interface WikipediaSearch {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  limit: number;
  language: string;
  cachePolicy: CachePolicy;
}

export function parseDefinition(source: string, units: UnitsSystem = DEFAULT_SETTINGS.units): WikipediaSearch {
  const parsed = parseCodeBlockYaml(source);
  const allowed = new Set(['id', 'location', 'radius', 'limit', 'language', 'cache']);

  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) throw new Error(`Unknown Wikipedia search setting: ${key}.`);
  }

  const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';

  if (!id) throw new Error('An id is required. Example: id: scranton');
  const location = typeof parsed.location === 'string' ? parsed.location.split(',')
    : Array.isArray(parsed.location) ? parsed.location : [];

  if (location.length !== 2 || location.some(value =>
    (typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '')) {
    throw new Error('Location must contain latitude, longitude.');
  }

  const latitude = Number(location[0]);
  const longitude = Number(location[1]);

  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new Error('Location must contain valid latitude, longitude.');
  }

  const language = typeof parsed.language === 'string' ? parsed.language.trim().toLowerCase() : 'en';

  if (parsed.language !== undefined && typeof parsed.language !== 'string'
    || !/^[a-z][a-z0-9-]{0,30}$/.test(language)) {
    throw new Error('Language must be a Wikipedia language code');
  }

  const distance = parseLongDistanceAsKilometers(parsed.radius ?? '10km', units);
  const radius = distance === undefined ? NaN : Number(kmToMeters(distance));

  if (!Number.isFinite(radius) || radius < 10 || radius > 10000) {
    throw new Error('Radius must be from 10m to 10km.');
  }

  return {
    id, latitude, longitude, language,
    radius,
    limit: numberSetting(parsed, 'limit', 50, 1, 500, true),
    cachePolicy: parseCacheSetting(parsed.cache),
  };
}

function numberSetting(record: Record<string, unknown>, key: string, fallback: number, minimum: number, maximum: number, integer = false): number {
  const value = record[key] ?? fallback;

  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum
    || (integer && !Number.isInteger(value))) {
    throw new Error(`${key} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}.`);
  }

  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
