import { Response } from "express";
import { QueryRequest } from "../types/request";
import { queryData as queryDataService } from "../services/data.service";

// GET /health controller – returns a simple status response
export const getHealth = (_req: QueryRequest, res: Response) => {
  res.json({ ok: true });
};

// POST /query controller – expects a request body with countries, fields, etc.
// It uses the service layer to get data (currently a mock response).
export const queryData = async (req: QueryRequest, res: Response) => {
  const { countries, fields, start_year, end_year } = req.body;
  // Call the service to get data (dummy implementation for now)
  const result = await queryDataService(
    countries,
    fields,
    start_year,
    end_year
  );

  // Convert BigInt to Number
  const safeResult = result.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) =>
        typeof value === "bigint" ? [key, Number(value)] : [key, value]
      )
    )
  );

  res.json(safeResult);
};
