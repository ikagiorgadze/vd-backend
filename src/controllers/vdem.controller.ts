import { Request, Response } from 'express';
import { BaseRequest } from '../types/request';
import { queryVdemData } from '../services/vdem.service';
import { formatError } from '../utils/error';

// GET /health controller – returns a simple status response
export const getHealth = (_req: BaseRequest, res: Response) => {
  res.json({ ok: true, service: 'v-dem' });
};

// POST /query controller – expects a request body with countries, fields, etc.
// It uses the service layer to get data (currently a mock response).
export const queryVdemDataController = async (
  req: BaseRequest,
  res: Response
) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res
        .status(400)
        .json({ error: 'Request body must be JSON', status: 400 });
    }
    const { countries, fields, start_year, end_year } =
      req.body as BaseRequest['body'];

    const result = await queryVdemData(countries, fields, start_year, end_year);
    const safeResult = result.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) =>
          typeof v === 'bigint' ? [k, Number(v)] : [k, v]
        )
      )
    );
    res.json(safeResult);
  } catch (err) {
    const formatted = formatError(err);
    res.status(formatted.status).json(formatted);
  }
};
