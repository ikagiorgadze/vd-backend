import { Request, Response } from 'express';
import { BaseRequest } from '../types/request';
import { queryVdemData } from '../services/vdem.service';
import { formatError } from '../utils/error';
import { z } from 'zod';
import { getIndexMetaSafe, recordMissingDefinitions } from '../services/indexMeta';
import { recordQueryCodes } from '../services/codeLogger';
import { getCorrelation } from '../services/correlations';
import { buildExplainPrompt } from '../services/prompt';
import { getOpenAIClient } from '../services/openai';

// GET /health controller – returns a simple status response
export const getHealth = (_req: BaseRequest, res: Response) => {
  res.json({ ok: true, service: 'v-dem' });
};

// POST /query controller – expects a request body with countries, fields, etc.
// It uses the service layer to get data (currently a mock response).
export const queryVdemDataController = async (req: BaseRequest, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be JSON', status: 400 });
    }
    const { countries, fields, start_year, end_year } = req.body as BaseRequest['body'];
    // record incoming field codes for telemetry/testing
    try {
      if (Array.isArray(fields) && fields.length > 0) {
        const codes = fields.map(String).filter(Boolean);
        recordQueryCodes(codes).catch((e) => console.error('[DEBUG][codeLogger] recordQueryCodes failed', e));
      }
    } catch (e) {
      console.error('[DEBUG][codeLogger] failed to schedule record', e);
    }
    const result = await queryVdemData(countries, fields, start_year, end_year);
    const safeResult = result.map(row =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => (typeof v === 'bigint' ? [k, Number(v)] : [k, v]))
      )
    );
    res.json(safeResult);
  } catch (err) {
    const formatted = formatError(err);
    res.status(formatted.status).json(formatted);
  }
};

// NOTE: Explain functionality is implemented in routes/vdemExplain.routes.ts.
// This placeholder helps if the route is accidentally wired here.
const ExplainSchema = z.object({
  indexA: z.string().min(1),
  indexB: z.string().min(1),
  country: z.string().min(2),
  execute: z.boolean().optional(),
});

export const explainVdemRelationshipsController = async (req: Request, res: Response) => {
  try {
    // DEBUG: incoming request body
    console.log('[DEBUG][explain] incoming body:', JSON.stringify(req.body));
    const parsed = ExplainSchema.safeParse(req.body);
    if (!parsed.success) {
      // DEBUG: validation failed
      console.log('[DEBUG][explain] validation error:', parsed.error.flatten());
      return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
    }
  const { indexA, indexB, country, execute } = parsed.data;
  // DEBUG: parsed inputs
  console.log('[DEBUG][explain] parsed inputs:', { indexA, indexB, country, execute });

    // DEBUG: loading index metadata
    console.log('[DEBUG][explain] loading index metadata for', indexA, 'and', indexB);
    const [metaAraw, metaBraw] = await Promise.all([
      getIndexMetaSafe(indexA),
      getIndexMetaSafe(indexB),
    ]);
    const metadataMissing = { indexA: !metaAraw, indexB: !metaBraw };
    if (metadataMissing.indexA || metadataMissing.indexB) {
      // DEBUG: missing metadata; will use placeholders and continue
      console.log('[DEBUG][explain] metadata missing', { hasA: !!metaAraw, hasB: !!metaBraw });
      try {
        const missing = [] as string[];
        if (!metaAraw) missing.push(indexA);
        if (!metaBraw) missing.push(indexB);
        // fire-and-forget recording of missing definitions
        recordMissingDefinitions(missing).catch((e) => console.error('[DEBUG][explain] recordMissingDefinitions failed', e));
      } catch (e) {
        console.error('[DEBUG][explain] error scheduling missing-definitions record', e);
      }
    }
    const metaA = metaAraw ?? { index_code: indexA, name: indexA, question: '', definition: '' };
    const metaB = metaBraw ?? { index_code: indexB, name: indexB, question: '', definition: '' };

    // DEBUG: querying correlation
  console.log('[DEBUG][explain] querying correlation for', { indexA, indexB, country });
  const correlation = await getCorrelation({ indexA, indexB, country });
    // DEBUG: correlation result
    console.log('[DEBUG][explain] correlation result:', correlation);
    if (!correlation) {
      return res.status(404).json({ error: 'correlation not found for provided filters' });
    }

    // DEBUG: building prompt
  const prompt = buildExplainPrompt({ metaA, metaB, country, correlation });
    console.log('[DEBUG][explain] prompt length:', prompt.length);

    let explanation: string | undefined;
    let model = process.env.OPENAI_MODEL || 'gpt-4o';

    if (execute) {
      // DEBUG: starting OpenAI call
      console.log('[DEBUG][explain] executing OpenAI with model', model);
      const client = getOpenAIClient();
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      });
      // DEBUG: openai response received
      console.log('[DEBUG][explain] OpenAI response choices:', completion.choices?.length ?? 0);
      explanation = completion.choices?.[0]?.message?.content || '';
    }

    // DEBUG: sending response
    console.log('[DEBUG][explain] sending response payload');
    if (execute) {
      // If execute=true, return the explanation wrapped in JSON for easier client parsing
      if (!explanation) explanation = '';
      return res.json({ explanation });
    }

    // Default: return previous JSON payload when not executing model
    return res.json({
      prompt,
      context: {
        indexA: metaA,
        indexB: metaB,
        country,
        
        correlation,
      },
      model,
      metadataMissing,
      ...(explanation ? { explanation } : {}),
    });
  } catch (err: any) {
    console.error('explain endpoint error', err);
    return res.status(500).json({ error: 'internal error', details: String(err?.message || err) });
  }
};
