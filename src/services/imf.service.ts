import fs from 'fs';
import path from 'path';
import { AppError } from '../utils/error';

interface ImfQueryParams {
  countries: string[];
  fields: string[];
  start_year: number;
  end_year: number;
  isNea?: boolean;
}

interface ImfResultRow {
  country_name: string;
  year: number;
  [indicator: string]: string | number | null;
}

let countryMapCache: Record<string, string> | null = null;
let reverseCountryMapCache: Record<string, string> | null = null; // name(lowercased) -> code

function loadCountryMap(): Record<string, string> {
  if (countryMapCache) return countryMapCache;
  // Try dist then src for the JSON file
  const possiblePaths = [
    path.resolve(__dirname, '../data/definitions/imf/series-code-countries.json'), // when built to dist
    path.resolve(__dirname, '../../src/data/definitions/imf/series-code-countries.json'), // when running with ts-node/tsx
  path.resolve(process.cwd(), 'src/data/definitions/imf/series-code-countries.json'),
  path.resolve(process.cwd(), 'data/definitions/imf/series-code-countries.json')
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, string>;
        // Normalize: trim names
        countryMapCache = {};
        for (const [k, v] of Object.entries(parsed)) {
          countryMapCache[k] = typeof v === 'string' ? v.trim() : String(v);
        }
        return countryMapCache!;
      }
    } catch {/* continue */}
  }
  countryMapCache = {};
  return countryMapCache;
}

function loadReverseCountryMap(): Record<string, string> {
  if (reverseCountryMapCache) return reverseCountryMapCache;
  const forward = loadCountryMap();
  reverseCountryMapCache = {};
  for (const [code, name] of Object.entries(forward)) {
    reverseCountryMapCache[name.toLowerCase()] = code;
  }
  return reverseCountryMapCache;
}

function resolveCountry(input: string): string {
  const trimmed = input.trim();
  if (/^[A-Z0-9]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  const rev = loadReverseCountryMap();
  const lower = trimmed.toLowerCase();
  // Exact match first
  const exact = rev[lower];
  if (exact) return exact;
  // Substring / contains fuzzy match over full names
  const forward = loadCountryMap();
  const candidates: Array<{ code: string; name: string }> = [];
  for (const [code, name] of Object.entries(forward)) {
    if (name.toLowerCase().includes(lower)) candidates.push({ code, name });
  }
  if (candidates.length === 1) return candidates[0].code;
  if (candidates.length > 1) {
    // Deterministic pick: shortest name then alphabetical
    candidates.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    return candidates[0].code;
  }
  throw new AppError(`Unrecognized country (no contains match): ${input}`, 400);
}

function buildCompositeSeriesCode(countries: string[], seriesCode: string): string {
  const countriesPart = countries.join('+');
  return `${countriesPart}.${seriesCode}`;
}

function buildImfUrl(countries: string[], seriesCode: string, start: number, end: number, isNea?: boolean): string {
  const composite = buildCompositeSeriesCode(countries, seriesCode);
  const datasetRoot = isNea ? 'IMF.STA,ANEA' : 'IMF.RES,WEO';
  return `https://api.imf.org/external/sdmx/2.1/data/${datasetRoot}/${encodeURIComponent(composite)}/all` +
    `?startPeriod=${encodeURIComponent(String(start))}` +
    `&endPeriod=${encodeURIComponent(String(end))}` +
    `&dimensionAtObservation=TIME_PERIOD&detail=dataonly&includeHistory=false`;
}

// Lightweight XML parsing tailored to the IMF response structure (Series -> Obs) without external deps.
function parseImfXml(xml: string): { series: Array<{ country: string; indicator: string; observations: Array<{ year: number; value: number | null; }>}> } {
  const seriesRegex = /<Series\s+[^>]*?COUNTRY="([A-Z0-9]{3})"[^>]*?INDICATOR="([A-Z0-9_\.]+)"[^>]*>([\s\S]*?)<\/Series>/g;
  const obsRegex = /<Obs\s+[^>]*?TIME_PERIOD="(\d{4})"[^>]*?OBS_VALUE="([^"]*)"\s*\/>/g;
  const series: Array<{ country: string; indicator: string; observations: Array<{ year: number; value: number | null; }>} > = [];
  let sMatch: RegExpExecArray | null;
  while ((sMatch = seriesRegex.exec(xml)) !== null) {
    const [, country, indicator, inner] = sMatch;
    const observations: Array<{ year: number; value: number | null; }> = [];
    let oMatch: RegExpExecArray | null;
    while ((oMatch = obsRegex.exec(inner)) !== null) {
      const [, yearStr, valueStr] = oMatch;
      const year = parseInt(yearStr, 10);
      const value = valueStr === '' ? null : (Number.isNaN(parseFloat(valueStr)) ? null : parseFloat(valueStr));
      observations.push({ year, value });
    }
    series.push({ country, indicator, observations });
  }
  return { series };
}

async function fetchSingleSeries(countries: string[], series_code: string, start_year: number, end_year: number, isNea?: boolean) {
  const url = buildImfUrl(countries, series_code, start_year, end_year, isNea);
  const controller = new AbortController();
  const timeoutMs = Number(process.env.IMF_TIMEOUT_MS || 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError(`IMF API error (${series_code}): ${res.status}`, res.status, { body: text.slice(0, 300) });
    }
    const xml = await res.text();
    return parseImfXml(xml);
  } catch (e: any) {
    if (e.name === 'AbortError') throw new AppError(`IMF request timed out (${series_code})`, 504);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export const queryImfData = async (params: ImfQueryParams): Promise<ImfResultRow[]> => {
  const { countries, fields, start_year, end_year, isNea } = params;
  if (end_year < start_year) throw new AppError('end_year must be >= start_year', 400);
  if (fields.length === 0) return [];

  // Resolve any non-AAA inputs (country names) to 3-letter codes
  const countryCodes = countries.map(resolveCountry);

  const countryMap = loadCountryMap();
  // Fetch all series (sequential or parallel). Use Promise.all for parallel.
  const results = await Promise.all(fields.map(field => fetchSingleSeries(countryCodes, field, start_year, end_year, isNea)));

  // Aggregate by country/year
  const agg = new Map<string, ImfResultRow>();
  for (let i = 0; i < fields.length; i++) {
    const code = fields[i];
    const parsed = results[i];
    for (const s of parsed.series) {
  const normalized = countryMap[s.country] || s.country;
      for (const obs of s.observations) {
        const key = `${normalized}|${obs.year}`;
        let row = agg.get(key);
        if (!row) {
          row = { country_name: normalized, year: obs.year } as ImfResultRow;
          agg.set(key, row);
        }
        row[code] = obs.value === null ? null : obs.value;
      }
    }
  }
  const rows = Array.from(agg.values()).sort((a, b) => a.country_name.localeCompare(b.country_name) || a.year - b.year);
  return rows;
};

