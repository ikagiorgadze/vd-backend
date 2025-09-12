import fs from 'fs/promises';
import path from 'path';
import { IndexMeta } from '../types/explain';

const RESPONSE_JSON_PATH = path.resolve(process.cwd(), 'data/definitions/vdem/index-details.json');

let cachedIndexMap: Map<string, IndexMeta> | null = null;

export async function loadIndexMeta(filePath: string = RESPONSE_JSON_PATH): Promise<Map<string, IndexMeta>> {
  if (cachedIndexMap) {
    return cachedIndexMap;
  }

  const raw = await fs.readFile(filePath, 'utf-8');
  const arr = JSON.parse(raw) as any[];
  if (!Array.isArray(arr)) throw new Error('definitions.json must be an array');
  const map = new Map<string, IndexMeta>();
  for (const item of arr) {
    const index_code = String(item.index_code || '').trim();
    const name = String(item.name || '').trim();
    const question = String(item.question || '').trim();
    const definition = String(item.definition || '').trim();
    if (!index_code) continue;
    map.set(index_code.toLowerCase(), { index_code, name, question, definition });
  }
  cachedIndexMap = map;

  return map;
}

export async function getIndexMetaSafe(code: string): Promise<IndexMeta | null> {
  const map = await loadIndexMeta();
  const key = code.trim().toLowerCase();
  return map.get(key) ?? null;
}