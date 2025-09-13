import fs from 'fs/promises';
import path from 'path';
import { IndexMeta } from '../types/explain';
import { getIndexMetaSafe as getVdemMetaSafe } from './index-meta.service';

type DatasetGroup = 'VDEM' | 'IMF' | null;

function detectDatasetByShape(code: string): DatasetGroup {
  const raw = String(code ?? '').trim();
  if (raw.includes('_') && !raw.includes('.')) return 'VDEM';
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

  if (dataset === 'VDEM') {
    const meta = await getVdemMetaSafe(code);
    if (meta) return meta;
    return { index_code: code, name: code, question: '', definition: '' };
  }

  if (dataset === 'IMF') {
    const imf = await loadImfDefinitions();
    const short = imf.get(code.toLowerCase());
  if (short) return { index_code: code, name: short.trim() || code, question: '', definition: short.trim() };
  return { index_code: code, name: code, question: '', definition: '' };
  }

  const v = await getVdemMetaSafe(code);
  if (v) return v;
  const imf = await loadImfDefinitions();
  const short = imf.get(code.toLowerCase());
  if (short) return { index_code: code, name: short.trim() || code, question: '', definition: short.trim() };
  return { index_code: code, name: code, question: '', definition: '' };
}
