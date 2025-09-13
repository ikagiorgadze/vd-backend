import { Request, Response } from 'express';
import { ExplainRequest } from '../types/explain';
import { getIndexMetaUniversal } from '../services/metadata-universal.service';
import { getCorrelation } from '../services/correlations.service';
import { buildExplainPrompt } from '../services/helpers/prompt';
import { getOpenAIClient } from '../services/openai.service';

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
      const client = getOpenAIClient();
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      });
      explanation = completion.choices?.[0]?.message?.content || '';
      return res.json({ explanation });
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
