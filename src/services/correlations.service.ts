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
  const stripDataset = (s: string) => {
    const raw = String(s ?? '').trim();
    const i = raw.indexOf(':');
    return i >= 0 ? raw.slice(i + 1) : raw;
  };

  const codeA = stripDataset(indexA);
  const codeB = stripDataset(indexB);

  // Lowercase and escape literals for safe comparison with lower(...) columns
  const escapeSqlLiteral = (s: string) => s.replace(/'/g, "''");
  const codeA_l = escapeSqlLiteral(codeA.toLowerCase());
  const codeB_l = escapeSqlLiteral(codeB.toLowerCase());

  // Country parquet lives under: CORRELATIONS_DIR/country_name-<Country>/part-*.parquet
  // Use the human-readable country name as-is (including spaces).
  const countryTrim = country.trim();
  const candNames = [
    `country_name=${countryTrim}`,
    `country_name-${countryTrim}`,
  ];
  let countryDir: string | null = null;
  let matchedVariant: string | null = null;
  // First try exact path variants (fast path)
  for (const n of candNames) {
    const p = path.join(CORRELATIONS_DIR, n);
    try {
      const stat = await fs.stat(p);
      if (stat && stat.isDirectory()) {
        countryDir = p;
        matchedVariant = n;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  // If not found, fall back to case-insensitive scan of the correlations dir
  if (!countryDir) {
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
          break;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  if (!countryDir) return null;
  // Ensure the country parquet folder and part files exist. If not, return
  // null so callers can respond with 404 (missing data for that country).
  let entries: string[];
  entries = await fs.readdir(countryDir);
  const hasParts = entries.some(
    (n) => n.startsWith('part-') && n.endsWith('.parquet')
  );
  if (!hasParts) return null;

  // Use DuckDB to read with glob pattern across the part files.
  const partGlob = path.join(countryDir, 'part-*.parquet');
  const database = getDb();
  const parquet = partGlob;

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

  const rows: any[] = await new Promise((resolve, reject) => {
    database.all(sql, (err, res) => (err ? reject(err) : resolve(res)));
  });
  if (!rows.length) return null;

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
  const result: Correlation & { yearsCovered?: [number, number] } = {
    r: Number(best.r),
    n: best.n != null ? Number(best.n) : undefined,
    method: 'Pearson',
    p_value: best.p_value != null ? Number(best.p_value) : undefined,
  };
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
  const countryTrim = country.trim();
  const candNames = [
    `country_name=${countryTrim}`,
    `country_name-${countryTrim}`,
  ];
  let countryDir: string | null = null;
  // First try exact path variants (fast path)
  for (const n of candNames) {
    const p = path.join(CORRELATIONS_DIR, n);
    try {
      const stat = await fs.stat(p);
      if (stat && stat.isDirectory()) {
        countryDir = p;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  // If not found, fall back to case-insensitive scan
  if (!countryDir) {
    try {
      const entries = await fs.readdir(CORRELATIONS_DIR, { withFileTypes: true });
      const lowerCand = candNames.map((x) => x.toLowerCase());
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const nameLower = ent.name.toLowerCase();
        const idx = lowerCand.indexOf(nameLower);
        if (idx >= 0) {
          countryDir = path.join(CORRELATIONS_DIR, ent.name);
          break;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  if (!countryDir) return [];

  // Check for part files
  let entries: string[];
  try {
    entries = await fs.readdir(countryDir);
  } catch (e) {
    return [];
  }
  const hasParts = entries.some(
    (n) => n.startsWith('part-') && n.endsWith('.parquet')
  );
  if (!hasParts) return [];

  const partGlob = path.join(countryDir, 'part-*.parquet');
  const database = getDb();

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

  const rows: any[] = await new Promise((resolve, reject) => {
    database.all(sql, (err, res) => (err ? reject(err) : resolve(res)));
  });

  return rows.map(row => ({
    indexA: row.index_a,
    indexB: row.index_b,
    r: Number(row.r),
    n: Number(row.n),
    p_value: Number(row.p_value),
  }));
}