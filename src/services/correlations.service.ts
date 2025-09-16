import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs/promises';
import { Correlation, CorrelationPair } from '../types/explain';

const CORRELATIONS_DIR = process.env.CORRELATIONS_DIR
  ? path.resolve(process.cwd(), process.env.CORRELATIONS_DIR)
  : path.resolve(process.cwd(), 'data/parquets/correlations');

let db: duckdb.Database | null = null;

function getDb(): duckdb.Database {
  if (!db) {
    db = new duckdb.Database(':memory:');
  }
  return db;
}

export async function getCorrelation(
  indexA: string,
  indexB: string,
  country: string
): Promise<(Correlation & { yearsCovered?: [number, number] }) | null> {
  console.log('🔍 [getCorrelation] Called with:', { indexA, indexB, country });

  const stripDataset = (s: string) => {
    const raw = String(s ?? '').trim();
    const i = raw.indexOf(':');
    return i >= 0 ? raw.slice(i + 1) : raw;
  };

  const codeA = stripDataset(indexA);
  const codeB = stripDataset(indexB);
  console.log('🔍 [getCorrelation] Stripped codes:', { codeA, codeB });

  // Lowercase and escape literals for safe comparison with lower(...) columns
  const escapeSqlLiteral = (s: string) => s.replace(/'/g, "''");
  const codeA_l = escapeSqlLiteral(codeA.toLowerCase());
  const codeB_l = escapeSqlLiteral(codeB.toLowerCase());
  console.log('🔍 [getCorrelation] Lowercased codes:', { codeA_l, codeB_l });

  // Country parquet lives under: CORRELATIONS_DIR/country_name-<Country>/part-*.parquet
  // Use the human-readable country name as-is (including spaces).
  const countryTrim = country.trim();
  const candNames = [
    `country_name=${countryTrim}`,
    `country_name-${countryTrim}`,
  ];
  console.log('🔍 [getCorrelation] Candidate country names:', candNames);

  let countryDir: string | null = null;
  let matchedVariant: string | null = null;
  // First try exact path variants (fast path)
  for (const n of candNames) {
    const p = path.join(CORRELATIONS_DIR, n);
    console.log('🔍 [getCorrelation] Checking path:', p);
    try {
      const stat = await fs.stat(p);
      if (stat && stat.isDirectory()) {
        countryDir = p;
        matchedVariant = n;
        console.log('✅ [getCorrelation] Found country directory:', p);
        break;
      }
    } catch (e) {
      console.log('⚠️ [getCorrelation] Path not found or not directory:', p);
    }
  }

  // If not found, fall back to case-insensitive scan of the correlations dir
  if (!countryDir) {
    console.log('🔍 [getCorrelation] Exact match not found, trying case-insensitive scan');
    try {
      const entries = await fs.readdir(CORRELATIONS_DIR, { withFileTypes: true });
      const lowerCand = candNames.map((x) => x.toLowerCase());
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const nameLower = ent.name.toLowerCase();
        const idx = lowerCand.indexOf(nameLower);
        if (idx >= 0) {
          countryDir = path.join(CORRELATIONS_DIR, ent.name);
          matchedVariant = candNames[idx];
          console.log('✅ [getCorrelation] Found country directory via scan:', countryDir);
          break;
        }
      }
    } catch (e) {
      console.log('⚠️ [getCorrelation] Case-insensitive scan failed:', e);
    }
  }

  if (!countryDir) {
    console.log('❌ [getCorrelation] No country directory found');
    return null;
  }

  // Ensure the country parquet folder and part files exist. If not, return
  // null so callers can respond with 404 (missing data for that country).
  let entries: string[];
  try {
    entries = await fs.readdir(countryDir);
    console.log('🔍 [getCorrelation] Directory entries:', entries);
  } catch (e) {
    console.log('❌ [getCorrelation] Failed to read directory:', e);
    return null;
  }

  const hasParts = entries.some(
    (n) => n.startsWith('part-') && n.endsWith('.parquet')
  );
  console.log('🔍 [getCorrelation] Has parquet parts:', hasParts);

  if (!hasParts) {
    console.log('❌ [getCorrelation] No parquet parts found');
    return null;
  }

  // Use DuckDB to read with glob pattern across the part files.
  const partGlob = path.join(countryDir, 'part-*.parquet');
  const database = getDb();
  const parquet = partGlob;
  console.log('🔍 [getCorrelation] Using parquet glob:', parquet);

  // Match exact token after stripping dataset prefix: equality on lowercased code
  // Ensure we match either orientation (a/b or b/a)
  const sql = `
    WITH src AS (
      SELECT 
        country_name,
        index_a,
        index_b,
        r_pearson AS r,
        n_obs AS n,
        p_value
      FROM read_parquet('${parquet}')
    ), norm AS (
      SELECT *, lower(
          CASE WHEN position(':' IN index_a) > 0 THEN substring(index_a FROM position(':' IN index_a) + 1)
               ELSE index_a END
        ) AS a_raw,
        lower(
          CASE WHEN position(':' IN index_b) > 0 THEN substring(index_b FROM position(':' IN index_b) + 1)
               ELSE index_b END
        ) AS b_raw
      FROM src
    )
    SELECT country_name, index_a, index_b, r, n, p_value
    FROM norm
    WHERE (
  (a_raw = '${codeA_l}' AND b_raw = '${codeB_l}') OR
  (a_raw = '${codeB_l}' AND b_raw = '${codeA_l}')
    )
  `;
  console.log('🔍 [getCorrelation] Executing SQL:', sql);

  let rows: any[];
  try {
    rows = await new Promise((resolve, reject) => {
      database.all(sql, (err, res) => (err ? reject(err) : resolve(res)));
    });
    console.log('✅ [getCorrelation] SQL executed, rows returned:', rows.length);
  } catch (e) {
    console.log('❌ [getCorrelation] SQL execution failed:', e);
    throw e;
  }

  if (!rows.length) {
    console.log('❌ [getCorrelation] No matching rows found');
    return null;
  }

  // Rank candidates: highest n, then largest |r|, then smallest p_value
  rows.sort((x, y) => {
    const nx = Number(x.n ?? 0),
      ny = Number(y.n ?? 0);
    if (ny !== nx) return ny - nx;
    const rx = Math.abs(Number(x.r ?? 0)),
      ry = Math.abs(Number(y.r ?? 0));
    if (ry !== rx) return ry - rx;
    const px = Number.isFinite(Number(x.p_value))
      ? Number(x.p_value)
      : Number.POSITIVE_INFINITY;
    const py = Number.isFinite(Number(y.p_value))
      ? Number(y.p_value)
      : Number.POSITIVE_INFINITY;
    return px - py;
  });

  const best = rows[0];
  console.log('🔍 [getCorrelation] Best row selected:', best);

  const result: Correlation & { yearsCovered?: [number, number] } = {
    r: Number(best.r),
    n: best.n != null ? Number(best.n) : undefined,
    method: 'Pearson',
    p_value: best.p_value != null ? Number(best.p_value) : undefined,
  };
  console.log('✅ [getCorrelation] Returning result:', result);
  return result;
}

export async function getTopCorrelations(
  country: string,
  type: 'highest' | 'lowest' | 'strongest' | 'weakest' | 'most_significant' | 'least_significant' | 'most_observations' | 'fewest_observations',
  dataset1: 'VDEM' | 'WEO' | 'NEA',
  dataset2: 'VDEM' | 'WEO' | 'NEA',
  minObservations?: number,
  limit: number = 3
): Promise<CorrelationPair[]> {
  console.log('🔍 [getTopCorrelations] Called with:', { country, type, dataset1, dataset2, minObservations, limit });

  const countryTrim = country.trim();
  const candNames = [
    `country_name=${countryTrim}`,
    `country_name-${countryTrim}`,
  ];
  console.log('🔍 [getTopCorrelations] Candidate country names:', candNames);

  let countryDir: string | null = null;
  // First try exact path variants (fast path)
  for (const n of candNames) {
    const p = path.join(CORRELATIONS_DIR, n);
    console.log('🔍 [getTopCorrelations] Checking path:', p);
    try {
      const stat = await fs.stat(p);
      if (stat && stat.isDirectory()) {
        countryDir = p;
        console.log('✅ [getTopCorrelations] Found country directory:', p);
        break;
      }
    } catch (e) {
      console.log('⚠️ [getTopCorrelations] Path not found or not directory:', p);
    }
  }

  // If not found, fall back to case-insensitive scan
  if (!countryDir) {
    console.log('🔍 [getTopCorrelations] Exact match not found, trying case-insensitive scan');
    try {
      const entries = await fs.readdir(CORRELATIONS_DIR, { withFileTypes: true });
      const lowerCand = candNames.map((x) => x.toLowerCase());
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const nameLower = ent.name.toLowerCase();
        const idx = lowerCand.indexOf(nameLower);
        if (idx >= 0) {
          countryDir = path.join(CORRELATIONS_DIR, ent.name);
          console.log('✅ [getTopCorrelations] Found via case-insensitive scan:', countryDir);
          break;
        }
      }
    } catch (e) {
      console.log('❌ [getTopCorrelations] Error during case-insensitive scan:', e);
    }
  }

  if (!countryDir) {
    console.log('❌ [getTopCorrelations] No country directory found for:', country);
    return [];
  }

  // Check for part files
  let entries: string[];
  try {
    entries = await fs.readdir(countryDir);
    console.log('🔍 [getTopCorrelations] Found entries in country dir:', entries);
  } catch (e) {
    console.log('❌ [getTopCorrelations] Error reading country directory:', e);
    return [];
  }

  const hasParts = entries.some(
    (n) => n.startsWith('part-') && n.endsWith('.parquet')
  );
  console.log('🔍 [getTopCorrelations] Has parquet parts:', hasParts);

  if (!hasParts) {
    console.log('❌ [getTopCorrelations] No parquet files found');
    return [];
  }

  const partGlob = path.join(countryDir, 'part-*.parquet');
  const database = getDb();
  console.log('🔍 [getTopCorrelations] Using parquet path:', partGlob);

  const dataset1Prefix = `${dataset1}:`;
  const dataset2Prefix = `${dataset2}:`;

  let orderBy: string;
  switch (type) {
    case 'highest':
      orderBy = 'r_pearson DESC';
      break;
    case 'lowest':
      orderBy = 'r_pearson ASC';
      break;
    case 'strongest':
      orderBy = 'ABS(r_pearson) DESC';
      break;
    case 'weakest':
      orderBy = 'ABS(r_pearson) ASC';
      break;
    case 'most_significant':
      orderBy = 'p_value ASC';
      break;
    case 'least_significant':
      orderBy = 'p_value DESC';
      break;
    case 'most_observations':
      orderBy = 'n_obs DESC';
      break;
    case 'fewest_observations':
      orderBy = 'n_obs ASC';
      break;
    default:
      orderBy = 'r_pearson DESC';
  }

  const minNClause = minObservations ? `AND n_obs >= ${minObservations}` : '';

  const sql = `
    SELECT 
      index_a,
      index_b,
      r_pearson AS r,
      n_obs AS n,
      p_value
    FROM read_parquet('${partGlob}')
    WHERE (
      (index_a LIKE '${dataset1Prefix}%' AND index_b LIKE '${dataset2Prefix}%') OR
      (index_a LIKE '${dataset2Prefix}%' AND index_b LIKE '${dataset1Prefix}%')
    )
    ${minNClause}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;

  console.log('🔍 [getTopCorrelations] Executing SQL:', sql.replace(/\s+/g, ' ').trim());

  const rows: any[] = await new Promise((resolve, reject) => {
    database.all(sql, (err, res) => (err ? reject(err) : resolve(res)));
  });

  console.log('✅ [getTopCorrelations] SQL returned', rows?.length || 0, 'rows');

  const result = rows.map(row => ({
    indexA: row.index_a,
    indexB: row.index_b,
    r: Number(row.r),
    n: Number(row.n),
    p_value: Number(row.p_value),
  }));

  console.log('✅ [getTopCorrelations] Processed results:', result.length, 'correlations');
  return result;
}