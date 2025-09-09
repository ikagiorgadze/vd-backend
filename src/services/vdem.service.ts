import duckdb from "duckdb";
import path from "path";

interface Row {
  country_name: string;
  year: number;
  [key: string]: string | number | null;
}

const db = new duckdb.Database(":memory:"); // In-memory DuckDB
const parquetPath =
  process.env.PARQUET_PATH ||
  path.resolve(__dirname, "../../data/data_full.parquet");

export const queryVdemData = async (
  countries: string[],
  fields: string[],
  startYear?: number,
  endYear?: number
): Promise<Row[]> => {
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
