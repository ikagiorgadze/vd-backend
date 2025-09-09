import { Request } from 'express';

// Shared base payload concepts
export interface BaseQueryPayload {
  countries: string[];
  start_year?: number;
  end_year?: number;
  fields: string[];
  isNea?: boolean; // IMF specific optional flag to use ANEA dataset
}
export interface BaseRequest extends Request {
  body: BaseQueryPayload;
}
