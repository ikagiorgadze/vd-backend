import { Response } from 'express';
import { BaseRequest } from '../types/request';
import { queryImfData as queryImfService } from '../services/imf.service';
import { AppError, formatError } from '../utils/error';

export const getHealth = (_req: BaseRequest, res: Response) => {
  res.json({ ok: true, service: 'imf' });
};

export const queryImfData = async (req: BaseRequest, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      throw new AppError('Request body must be JSON', 400);
    }
  const { countries, fields, start_year, end_year, isNea } = req.body as BaseRequest['body'];

    if (!countries || !Array.isArray(countries) || countries.length === 0) {
      throw new AppError('countries must be a non-empty array of ISO codes', 400);
    }
    if (typeof start_year !== 'number' || typeof end_year !== 'number') {
      throw new AppError('start_year and end_year must be numbers', 400);
    }
    
    if (fields.length === 0) {
      throw new AppError('Provide fields', 400);
    }
    if (fields.length > Number(process.env.IMF_MAX_FIELDS || 5)) {
      throw new AppError(`Too many fields (max ${(process.env.IMF_MAX_FIELDS || 5)})`, 400);
    }

  const rows = await queryImfService({ countries, fields, start_year, end_year, isNea });
    res.json(rows);
  } catch (err) {
    const formatted = formatError(err);
    res.status(formatted.status).json(formatted);
  }
};
