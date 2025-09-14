import fs from 'fs/promises';
import path from 'path';
import { IndexMeta } from '../types/explain';
import { getIndexMetaSafe as getVdemMetaSafe } from './index-meta.service';

type DatasetGroup = 'VDEM' | 'IMF' | null;

function detectDatasetByShape(code: string): DatasetGroup {
  const raw = String(code ?? '').trim();
  // Heuristic: IMF series contain a dot (e.g., NGDP_RPCH.A or BCA_NGDPD.A). Everything else is V-Dem.
  if ((raw.includes('_') && !raw.includes('.')) || !raw.includes('.')) return 'VDEM';
  if (raw.includes('.')) return 'IMF';
  return null;
}

let cachedImfMap: Map<string, string> | null = null;
async function loadImfDefinitions(): Promise<Map<string, string>> {
  if (cachedImfMap) return cachedImfMap;
  const file = path.resolve(process.cwd(), 'data/definitions/imf/imf-series-code-definitions.json');
  const raw = await fs.readFile(file, 'utf-8');
  const obj = JSON.parse(raw) as Record<string, string>;
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    map.set(k.trim().toLowerCase(), String(v ?? ''));
  }
  cachedImfMap = map;
  return map;
}

export async function getIndexMetaUniversal(inputCode: string): Promise<IndexMeta | null> {
  const code = String(inputCode ?? '').trim();
  const dataset = detectDatasetByShape(code);
  const friendlyFallback = (ds: DatasetGroup): Pick<IndexMeta, 'name' | 'definition' | 'question'> => {
    if (ds === 'IMF') return { name: 'IMF indicator', question: '', definition: '' };
    if (ds === 'VDEM') return { name: 'V-Dem indicator', question: '', definition: '' };
    // Default if unknown
    return { name: 'Indicator', question: '', definition: '' };
  };

  if (dataset === 'VDEM') {
    const meta = await getVdemMetaSafe(code);
    if (meta) {
      // If for some reason name is missing or equals the code, use a friendly label instead of leaking the code.
      const name = (meta.name && meta.name.trim() && meta.name.trim().toLowerCase() !== code.toLowerCase())
        ? meta.name
        : friendlyFallback('VDEM').name;
      return { ...meta, name };
    }
    const ff = friendlyFallback('VDEM');
    return { index_code: code, ...ff } as IndexMeta;
  }

  if (dataset === 'IMF') {
    const imf = await loadImfDefinitions();
    const short = imf.get(code.toLowerCase());
  if (short && short.trim()) return { index_code: code, name: short.trim(), question: '', definition: short.trim() };
  const ff = friendlyFallback('IMF');
  return { index_code: code, ...ff } as IndexMeta;
  }

  const v = await getVdemMetaSafe(code);
  if (v) {
    const name = (v.name && v.name.trim() && v.name.trim().toLowerCase() !== code.toLowerCase())
      ? v.name
      : friendlyFallback('VDEM').name;
    return { ...v, name };
  }
  const imf = await loadImfDefinitions();
  const short = imf.get(code.toLowerCase());
  if (short && short.trim()) return { index_code: code, name: short.trim(), question: '', definition: short.trim() };
  const ff = friendlyFallback(dataset ?? (code.includes('.') ? 'IMF' : 'VDEM'));
  return { index_code: code, ...ff } as IndexMeta;
}
