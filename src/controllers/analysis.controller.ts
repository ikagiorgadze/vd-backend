import { Request, Response } from 'express';
import { ExplainRequest } from '../types/explain';
import { getIndexMetaUniversal } from '../services/metadata-universal.service';
import { getCorrelation } from '../services/correlations.service';
import { buildExplainPrompt } from '../services/helpers/prompt';
import { getOpenAIClient } from '../services/openai.service';
import { TTLCache } from '../utils/ttlCache';

// In-memory cache for explanations
const explainCache = new TTLCache<string>(500, +(process.env.EXPLAIN_CACHE_TTL_MS || 6 * 60 * 60 * 1000));

function makeKey(parts: any): string {
  const json = JSON.stringify(parts);
  // Simple hash to keep key length small
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = (h << 5) - h + json.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

export const explainRelationshipsController = async (
  req: Request,
  res: Response
) => {
  try {
    const { indexA, indexB, country, execute } = req.body as ExplainRequest;

    const [metaA, metaB] = await Promise.all([
      getIndexMetaUniversal(indexA),
      getIndexMetaUniversal(indexB),
    ]);

    const correlation = await getCorrelation({ indexA, indexB, country });
    if (!correlation) {
      return res
        .status(404)
        .json({ error: 'correlation not found for provided filters' });
    }

    const safeMetaA = metaA ?? {
      index_code: indexA,
      name: indexA,
      question: '',
      definition: '',
    };
    const safeMetaB = metaB ?? {
      index_code: indexB,
      name: indexB,
      question: '',
      definition: '',
    };

    const prompt = buildExplainPrompt({
      metaA: safeMetaA,
      metaB: safeMetaB,
      country,
      correlation,
    });

    let explanation: string | undefined;
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    if (execute) {
      const key = makeKey({
        a: safeMetaA.index_code,
        b: safeMetaB.index_code,
        country,
        r: correlation.r,
        n: correlation.n,
        m: correlation.method,
        years: (correlation as any).yearsCovered || [correlation.start_year, correlation.end_year],
        model,
        prompt,
      });

      const cached = explainCache.get(key);
      if (cached) {
        return res.json({ explanation: cached, cached: true });
      }
      const client = getOpenAIClient();
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      });
      explanation = completion.choices?.[0]?.message?.content || '';
      if (explanation) explainCache.set(key, explanation);
      return res.json({ explanation, cached: false });
    }

    return res.json({
      prompt,
      context: { indexA: safeMetaA, indexB: safeMetaB, country, correlation },
      model,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: 'internal error', details: String(err?.message || err) });
  }
};
