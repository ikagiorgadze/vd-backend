import { Correlation, IndexMeta } from '../types/vdem';

export function buildExplainPrompt(args: {
  metaA: IndexMeta; metaB: IndexMeta; country: string;
  correlation: (Correlation & { yearsCovered?: [number, number] }) | null;
}): string {
  const { metaA, metaB, country, correlation } = args;
  const header = `Explain relationship between '${metaA.name} (${metaA.index_code})' and '${metaB.name} (${metaB.index_code})' in ${country}`;

  const rLine = correlation
    ? `r = ${correlation.r}${correlation.method ? ` (${correlation.method})` : ''}` +
      `${correlation.n != null ? `, n=${correlation.n}` : ''}` +
      `${correlation.yearsCovered ? `, years=${correlation.yearsCovered[0]}–${correlation.yearsCovered[1]}` : ''}`
    : 'Correlation not available';

  const yr = 'All years';

  const metaBlock = `
Indices:
A) ${metaA.index_code}
- Name: ${metaA.name}
- Question: ${metaA.question}
- Definition: ${metaA.definition}

B) ${metaB.index_code}
- Name: ${metaB.name}
- Question: ${metaB.question}
- Definition: ${metaB.definition}
`;

  const instructions = `
Write a short, human-friendly explanation for a general audience.

Style and tone:
- Use plain language and a conversational tone. Prefer everyday words over technical terms.
- Minimize numbers. Do not quote r, n, p-values, or say “Pearson” unless absolutely necessary.
- Refer to the indices by their names (not codes) and briefly describe what they capture.
- Keep it focused on what this means in ${country} rather than on statistical details.

Structure (approx. 140–220 words):
- Summary (2–3 sentences): say whether the two indices tend to move together and what that generally implies.
- Why it matters (2–3 short bullets): practical or real-world implications in ${country}.
- Drivers/Context (2–3 short bullets): plausible reasons these move together, grounded in the provided index descriptions.
- Caveats (1–2 short bullets): avoid causal claims; mention limits of the data or missing definitions if relevant.

Rules:
- Do not list formulas or parenthetical statistics.
- Do not fabricate facts beyond the provided context.
- If metadata is missing, acknowledge the gap in simple terms (e.g., “the definition for one index isn’t available”).
`;

  const context = `Context:\n- ${rLine}\n- Years: ${yr}`;

  return [header, context, metaBlock, instructions].join('\n\n');
}
