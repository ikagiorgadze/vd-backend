import duckdb from "duckdb";
import path from "path";
import fs from 'fs';
import { AppError } from '../utils/error';

interface Row {
  country_name: string;
  year: number;
  [key: string]: string | number | null;
}

const db = new duckdb.Database(":memory:"); // In-memory DuckDB

// Resolve parquet/data path from environment first. Prefer a VDEM-specific
// env var, fall back to PARQUET_PATH for compatibility, then to the
// repository data path. Use process.cwd() so the path is stable at runtime.
const VDEM_DATA_PATH = process.env.VDEM_DATA_PATH || process.env.PARQUET_PATH;
const parquetPath = VDEM_DATA_PATH
  ? path.resolve(process.cwd(), VDEM_DATA_PATH)
  : path.resolve(process.cwd(), 'data', 'parquets', 'vdem_data.parquet');

export const queryVdemData = async (
  countries: string[],
  fields: string[],
  startYear?: number,
  endYear?: number
): Promise<Row[]> => {
  // Fail fast with a clear message if the parquet path doesn't exist.
  if (!fs.existsSync(parquetPath)) {
    throw new AppError(
      `Parquet file not found at ${parquetPath}. Ensure the file exists or set VDEM_DATA_PATH/PARQUET_PATH to the correct location.`,
      500
    );
  }
  const start = Number.isFinite(startYear) ? (startYear as number) : 2000; // Change default start year from here
  const end = Number.isFinite(endYear) ? (endYear as number) : start + 5; // Change default end year from here (extract to env later)

  // Use the correct country column, e.g., country_id
  const fieldList = ["country_name", "year", ...fields]
    .map((field) => `"${field}"`)
    .join(", ");
  const countryList = countries.map((c) => `'${c}'`).join(", ");
  const sql = `
    SELECT ${fieldList}
    FROM read_parquet('${parquetPath}')
    WHERE country_name IN (${countryList})
      AND year BETWEEN ${start} AND ${end}
    ORDER BY country_name ASC, year ASC
  `;

  return new Promise<Row[]>((resolve, reject) => {
    db.all(sql, (err: Error | null, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows as Row[]);
    });
  });
};
