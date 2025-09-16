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
  console.log('🔍 [Explain] Request received:', {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers
  });

  try {
    const { indexA, indexB, country, execute } = req.body as ExplainRequest;
    console.log('🔍 [Explain] Extracted params:', { indexA, indexB, country, execute });

    const [metaA, metaB] = await Promise.all([
      getIndexMetaUniversal(indexA.name),
      getIndexMetaUniversal(indexB.name),
    ]);
    console.log('🔍 [Explain] Metadata retrieved:', { metaA: !!metaA, metaB: !!metaB });

    const correlation = await getCorrelation(indexA.name, indexB.name, country );
    console.log('🔍 [Explain] Correlation retrieved:', correlation ? 'found' : 'not found');

    if (!correlation) {
      console.log('❌ [Explain] No correlation found, returning 404');
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
    console.log('🔍 [Explain] Prompt built, length:', prompt.length);

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

      console.log('🔍 [Explain] Cache key generated, checking cache...');
      const cached = explainCache.get(key);
      if (cached) {
        console.log('✅ [Explain] Cache hit, returning cached response');
        return res.json({ explanation: cached, cached: true });
      }

      console.log('🔍 [Explain] Cache miss, calling OpenAI...');
      const client = getOpenAIClient();
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      });
      explanation = completion.choices?.[0]?.message?.content || '';
      console.log('✅ [Explain] OpenAI response received, length:', explanation.length);

      if (explanation) {
        explainCache.set(key, explanation);
        console.log('💾 [Explain] Response cached');
      }

      console.log('✅ [Explain] Returning explanation');
      return res.json({ explanation, cached: false });
    }

    console.log('✅ [Explain] Returning prompt and context (execute=false)');
    return res.json({
      prompt,
      context: { indexA: safeMetaA, indexB: safeMetaB, country, correlation },
      model,
    });
  } catch (err: any) {
    console.error('💥 [Explain] Error occurred:', err);
    console.error('💥 [Explain] Error stack:', err?.stack);
    return res
      .status(500)
      .json({ error: 'internal error', details: String(err?.message || err) });
  }
};

export const getCorrelationsController = async (
  req: Request,
  res: Response
) => {
  console.log('🔍 [Correlations] Request received:', {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers
  });

  try {
    const query = req.query as unknown as CorrelationsRequest;
    console.log('🔍 [Correlations] Parsed query:', query);

    const { country, type, dataset1, dataset2, minObservations, limit } = query;
    console.log('🔍 [Correlations] Extracted params:', { country, type, dataset1, dataset2, minObservations, limit });

    if (!country || !type || !dataset1 || !dataset2) {
      console.log('❌ [Correlations] Missing required parameters');
      return res.status(400).json({ error: 'Missing required parameters: country, type, dataset1, dataset2' });
    }

    if (!['highest', 'lowest', 'strongest', 'weakest', 'most_significant', 'least_significant', 'most_observations', 'fewest_observations'].includes(type)) {
      console.log('❌ [Correlations] Invalid type parameter:', type);
      return res.status(400).json({ error: 'Type must be one of: highest, lowest, strongest, weakest, most_significant, least_significant, most_observations, fewest_observations' });
    }

    const validDatasets = ['VDEM', 'WEO', 'NEA'];
    if (!validDatasets.includes(dataset1) || !validDatasets.includes(dataset2)) {
      console.log('❌ [Correlations] Invalid dataset parameters:', { dataset1, dataset2 });
      return res.status(400).json({ error: 'Dataset1 and dataset2 must be "VDEM", "WEO", or "NEA"' });
    }

    const minObs = minObservations ? parseInt(String(minObservations), 10) : undefined;
    const lim = 3; // Always return exactly 3 correlation pairs
    console.log('🔍 [Correlations] Processed params:', { minObs, lim });

    console.log('🔍 [Correlations] Calling getTopCorrelations with:', { country, type, dataset1, dataset2, minObs, lim });
    const correlations = await getTopCorrelations(country, type, dataset1, dataset2, minObs, lim);
    console.log('✅ [Correlations] getTopCorrelations returned:', correlations?.length || 0, 'results');

    const response: CorrelationsResponse = {
      correlations,
    };

    console.log('✅ [Correlations] Sending response with', correlations?.length || 0, 'correlations');
    return res.json(response);
  } catch (err: any) {
    console.error('💥 [Correlations] Error occurred:', err);
    console.error('💥 [Correlations] Error stack:', err?.stack);
    return res
      .status(500)
      .json({ error: 'internal error', details: String(err?.message || err) });
  }
};
