import { Router } from 'express';
import { z } from 'zod';
import { getIndexMetaSafe } from '../services/indexMeta';
import { getCorrelation } from '../services/correlations';
import { buildExplainPrompt } from '../services/prompt';
import { getOpenAIClient } from '../services/openai';

const router = Router();

const Schema = z.object({
  indexA: z.string().min(1),
  indexB: z.string().min(1),
  country: z.string().min(2),
  execute: z.boolean().optional(),
});

router.post('/v-dem/analysis/relationships/explain', async (req, res) => {
  try {
    // DEBUG: incoming request body
    console.log('[DEBUG][explain] incoming body:', JSON.stringify(req.body));
    const parsed = Schema.safeParse(req.body);
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
    const [metaA, metaB] = await Promise.all([
      getIndexMetaSafe(indexA),
      getIndexMetaSafe(indexB),
    ]);
    if (!metaA || !metaB) {
      // DEBUG: missing metadata
      console.log('[DEBUG][explain] metadata missing', { hasA: !!metaA, hasB: !!metaB });
      return res.status(404).json({ error: 'index metadata not found', missing: {
        indexA: !metaA, indexB: !metaB,
      }});
    }

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
    return res.json({
      prompt,
      context: {
        indexA: metaA,
        indexB: metaB,
        country,
        correlation,
      },
      model,
      ...(explanation ? { explanation } : {}),
    });
  } catch (err: any) {
    console.error('explain endpoint error', err);
    return res.status(500).json({ error: 'internal error', details: String(err?.message || err) });
  }
});

export default router;
