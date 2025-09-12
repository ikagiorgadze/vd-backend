import { Request, Response } from 'express';
import { BaseRequest } from '../types/request';
import { queryVdemData } from '../services/vdem.service';
import { formatError } from '../utils/error';
import { ExplainRequest } from '../types/explain';
import { getIndexMetaSafe } from '../services/index-meta.service';
import { getCorrelation } from '../services/correlations.service';
import { buildExplainPrompt } from '../services/helpers/prompt';
import { getOpenAIClient } from '../services/openai.service';

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

// NOTE: Explain functionality is implemented in routes/vdemExplain.routes.ts.
// This placeholder helps if the route is accidentally wired here.
export const explainVdemRelationshipsController = async (
  req: Request,
  res: Response
) => {
  try {
  // Use the shared ExplainRequest type for typing. Validation is handled
  // elsewhere, so cast the body and use the fields directly.
  const { indexA, indexB, country, execute } = req.body as ExplainRequest;

    const [metaAraw, metaBraw] = await Promise.all([
      getIndexMetaSafe(indexA),
      getIndexMetaSafe(indexB),
    ]);
    const metadataMissing = { indexA: !metaAraw, indexB: !metaBraw };
    if (metadataMissing.indexA || metadataMissing.indexB) {
      try {
        const missing = [] as string[];
        if (!metaAraw) missing.push(indexA);
        if (!metaBraw) missing.push(indexB);
      } catch (err: any) {
        return res
          .status(500)
          .json({
            error: 'internal error',
            details: String(err?.message || err),
          });
      }
    }
    const metaA = metaAraw ?? {
      index_code: indexA,
      name: indexA,
      question: '',
      definition: '',
    };
    const metaB = metaBraw ?? {
      index_code: indexB,
      name: indexB,
      question: '',
      definition: '',
    };

    const correlation = await getCorrelation({ indexA, indexB, country });
    if (!correlation) {
      return res
        .status(404)
        .json({ error: 'correlation not found for provided filters' });
    }

    const prompt = buildExplainPrompt({ metaA, metaB, country, correlation });
    let explanation: string | undefined;
    let model = process.env.OPENAI_MODEL || 'gpt-4o';

    if (execute) {
      const client = getOpenAIClient();
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      });

      explanation = completion.choices?.[0]?.message?.content || '';
    }

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
    return res
      .status(500)
      .json({ error: 'internal error', details: String(err?.message || err) });
  }
};
