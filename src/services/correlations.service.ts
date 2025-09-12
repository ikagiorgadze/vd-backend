import duckdb from 'duckdb';
import path from 'path';
import { Correlation } from '../types/explain';

const CORRELATIONS_PARQUET_PATH = path.resolve(process.cwd(), 'data/correlations.parquet');

let db: duckdb.Database | null = null;

function getDb(): duckdb.Database {
  if (!db) {
    db = new duckdb.Database(':memory:');
  }
  return db;
}

export async function getCorrelation(params: {
  indexA: string; indexB: string; country: string;
}): Promise<(Correlation & { yearsCovered?: [number, number] }) | null> {
  const { indexA, indexB, country } = params;
  const a = indexA.trim().toLowerCase();
  const b = indexB.trim().toLowerCase();
  const c = country.trim().toLowerCase();

  const database = getDb();
  const parquet = CORRELATIONS_PARQUET_PATH;

  const sql = `
    SELECT 
      country_name,
      index_a,
      index_b,
      r_pearson AS r,
      n_obs AS n,
      p_value
    FROM read_parquet('${parquet}')
    WHERE lower(index_a) IN ('${a}', '${b}')
      AND lower(index_b) IN ('${a}', '${b}')
      AND lower(country_name) = '${c}'
  `;

  const rows: any[] = await new Promise((resolve, reject) => {
    database.all(sql, (err, res) => err ? reject(err) : resolve(res));
  });
  if (!rows.length) return null;

  // Rank candidates: highest n, then largest |r|, then smallest p_value
  rows.sort((x, y) => {
    const nx = Number(x.n ?? 0), ny = Number(y.n ?? 0);
    if (ny !== nx) return ny - nx;
    const rx = Math.abs(Number(x.r ?? 0)), ry = Math.abs(Number(y.r ?? 0));
    if (ry !== rx) return ry - rx;
    const px = Number.isFinite(Number(x.p_value)) ? Number(x.p_value) : Number.POSITIVE_INFINITY;
    const py = Number.isFinite(Number(y.p_value)) ? Number(y.p_value) : Number.POSITIVE_INFINITY;
    return px - py;
  });

  const best = rows[0];
  const result: Correlation & { yearsCovered?: [number, number] } = {
    r: Number(best.r),
    n: best.n != null ? Number(best.n) : undefined,
    method: 'Pearson',
  };
  return result;
}
