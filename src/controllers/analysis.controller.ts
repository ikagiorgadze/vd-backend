import { Request, Response } from 'express';
import { ExplainRequest, CorrelationsRequest, CorrelationsResponse } from '../types/explain';
import { getIndexMetaUniversal } from '../services/metadata-universal.service';
import { getCorrelation, getTopCorrelations } from '../services/correlations.service';
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
      getIndexMetaUniversal(indexA.name),
      getIndexMetaUniversal(indexB.name),
    ]);

    const correlation = await getCorrelation(indexA.name, indexB.name, country );
    if (!correlation) {
      return res
        .status(404)
        .json({ error: 'correlation not found for provided filters' });
    }

    const safeMetaA = metaA ?? {
      index_code: indexA.name,
      name: indexA.name,
      question: '',
      definition: '',
    };
    const safeMetaB = metaB ?? {
      index_code: indexB.name,
      name: indexB.name,
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
    const model = process.env.OPENAI_MODEL || 'gpt-4.1';
    if (execute) {
      const key = makeKey({
        a: safeMetaA.index_code,
        b: safeMetaB.index_code,
        country,
        r: correlation.r,
        n: correlation.n,
        p: correlation.p_value,
        m: correlation.method,
        years: (correlation as any).yearsCovered || [correlation.start_year, correlation.end_year],
        model,
        prompt,
        version: 'v3', // Removed analogies, more serious tone
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

export const getCorrelationsController = async (
  req: Request,
  res: Response
) => {
  try {
    const query = req.query as unknown as CorrelationsRequest;

    const { country, type, dataset1, dataset2, minObservations, limit } = query;

    if (!country || !type || !dataset1 || !dataset2) {
      return res.status(400).json({ error: 'Missing required parameters: country, type, dataset1, dataset2' });
    }

    if (!['highest', 'lowest', 'strongest', 'weakest', 'most_significant', 'least_significant', 'most_observations', 'fewest_observations'].includes(type)) {
      return res.status(400).json({ error: 'Type must be one of: highest, lowest, strongest, weakest, most_significant, least_significant, most_observations, fewest_observations' });
    }

    const validDatasets = ['VDEM', 'WEO', 'NEA'];
    if (!validDatasets.includes(dataset1) || !validDatasets.includes(dataset2)) {
      return res.status(400).json({ error: 'Dataset1 and dataset2 must be "VDEM", "WEO", or "NEA"' });
    }

    const minObs = minObservations ? parseInt(String(minObservations), 10) : undefined;
    const lim = limit ? parseInt(String(limit), 10) : 3;

    const correlations = await getTopCorrelations(country, type, dataset1, dataset2, minObs, lim);

    const response: CorrelationsResponse = {
      correlations,
    };

    return res.json(response);
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: 'internal error', details: String(err?.message || err) });
  }
};
