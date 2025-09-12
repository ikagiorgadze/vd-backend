import fs from 'fs/promises';
import path from 'path';

const CODES_PATH = path.resolve(process.cwd(), 'testing', 'codes.json');

// Minimal append: assumes testing/codes.json exists and contains a JSON array.
export async function recordQueryCodes(codes: string[] = []): Promise<void> {
  if (!codes || codes.length === 0) return;
  // Ensure directory exists (harmless if it already does)
  try { await fs.mkdir(path.dirname(CODES_PATH), { recursive: true }); } catch {}
  let raw = '';
  let arr: string[] = [];
  try {
    raw = await fs.readFile(CODES_PATH, 'utf-8');
  } catch (e) {
    // file missing; start with empty array
    arr = [];
  }

  if (raw && arr.length === 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed.map((s: any) => String(s));
    } catch (e) {
      // Try to recover an array-like substring (handles trailing garbage like extra brackets)
      const m = raw.match(/\[([\s\S]*)\]/);
      if (m) {
        try {
          const candidate = '[' + m[1] + ']';
          const parsed2 = JSON.parse(candidate);
          if (Array.isArray(parsed2)) arr = parsed2.map((s: any) => String(s));
        } catch (e2) {
          arr = [];
        }
      } else {
        arr = [];
      }
    }
  }

  const existingSet = new Set(arr.map((s) => String(s).toLowerCase()));
  let added = false;
  for (const rawCode of codes) {
    const code = String(rawCode || '').trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (!existingSet.has(key)) {
      arr.push(code);
      existingSet.add(key);
      added = true;
    }
  }

  if (!added) return;
  // Simple direct write
  await fs.writeFile(CODES_PATH, JSON.stringify(arr, null, 2), 'utf-8');
}

export async function readRecordedCodes(): Promise<string[]> {
  const raw = await fs.readFile(CODES_PATH, 'utf-8');
  const arr = JSON.parse(raw);
  return Array.isArray(arr) ? arr.map((s) => String(s)) : [];
}
