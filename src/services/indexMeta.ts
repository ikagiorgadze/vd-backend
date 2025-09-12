import fs from 'fs/promises';
import path from 'path';
import { IndexMeta } from '../types/vdem';

const RESPONSE_JSON_PATH = process.env.RESPONSE_JSON_PATH || path.resolve(process.cwd(), 'src/definitions.json');
const MISSING_DEFINITIONS_PATH = process.env.MISSING_DEFINITIONS_PATH || path.resolve(process.cwd(), 'missing-definitions.json');

let cachedIndexMap: Map<string, IndexMeta> | null = null;

export async function loadIndexMeta(filePath: string = RESPONSE_JSON_PATH): Promise<Map<string, IndexMeta>> {
  if (cachedIndexMap) {
    // DEBUG: cached metadata used
    console.log('[DEBUG][indexMeta] using cached metadata');
    return cachedIndexMap;
  }
  // DEBUG: loading metadata from file
  console.log('[DEBUG][indexMeta] loading from', filePath);
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
  // DEBUG: loaded entries count
  console.log('[DEBUG][indexMeta] loaded entries:', map.size);
  return map;
}

export async function getIndexMetaSafe(code: string): Promise<IndexMeta | null> {
  const map = await loadIndexMeta();
  const key = code.trim().toLowerCase();
  return map.get(key) ?? null;
}

/**
 * Append missing index codes to a JSON file for later inspection.
 * This avoids duplicates and is resilient if the file does not exist yet.
 */
export async function recordMissingDefinitions(codes: string[] = []): Promise<void> {
  if (!codes || codes.length === 0) return;
  const filePath = MISSING_DEFINITIONS_PATH;
  try {
    let existing: string[] = [];
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed.map((s) => String(s));
    } catch (e) {
      // file missing or invalid -> we'll create it
      existing = [];
    }

    const seen = new Set(existing.map((s) => s.toLowerCase()));
    let changed = false;
    for (const c of codes) {
      const k = String(c || '').trim();
      if (!k) continue;
      if (!seen.has(k.toLowerCase())) {
        existing.push(k);
        seen.add(k.toLowerCase());
        changed = true;
      }
    }
    if (changed) {
      await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8');
      console.log('[DEBUG][indexMeta] appended missing definitions to', filePath, codes);
    }
  } catch (err) {
    console.error('[ERROR][indexMeta] could not record missing definitions', err);
  }
}
