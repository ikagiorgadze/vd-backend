import { Request } from 'express';

export interface QueryRequest extends Request {
  body: {
    countries: string[];
    fields: string[];
    start_year?: number;
    end_year?: number;
  };
}