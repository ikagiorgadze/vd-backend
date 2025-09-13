import { Correlation, IndexMeta } from '../../types/explain';

export function buildExplainPrompt(args: {
  metaA: IndexMeta;
  metaB: IndexMeta;
  country: string;
  correlation: (Correlation & { yearsCovered?: [number, number] }) | null;
}): string {
  const { metaA, metaB, country, correlation } = args;
  // Use human-friendly names in the header. Codes are kept only in an
  // internal reference block (in case the model asks), but must not be
  // mentioned in the final explanation.
  const header = `Explain the relationship between "${metaA.name}" and "${metaB.name}" in ${country}`;

  const rLine = correlation
    ? `r = ${correlation.r}${
        correlation.method ? ` (${correlation.method})` : ''
      }` +
      `${correlation.n != null ? `, n=${correlation.n}` : ''}` +
      `${
        correlation.yearsCovered
          ? `, years=${correlation.yearsCovered[0]}–${correlation.yearsCovered[1]}`
          : ''
      }`
    : 'Correlation not available';

  const yr = 'All years';

  // Build a human-facing metadata block. Avoid exposing index codes here to
  // prevent the model from repeating them. Use short descriptions for IMF
  // entries when available; leave question blank for IMF/WEO/NEA.
  const humanMeta = `
Index A: ${metaA.name}
- What it captures: ${metaA.definition || 'Definition not available.'}

Index B: ${metaB.name}
- What it captures: ${metaB.definition || 'Definition not available.'}
`;

  // Internal reference: codes are provided but explicitly labeled as internal
  // and the model must not mention them in the answer.
  const internalRef = `
Internal reference (do not mention these identifiers in the answer):
A = ${metaA.index_code}
B = ${metaB.index_code}
`;

  const instructions = `
Write a short, professional explanation for a general audience.

Style and tone:
- Use professional language and tone. Prefer technical terms over everyday words.
- Refer to the indices by their names (not codes) and briefly describe what they capture.
- Never mention internal identifiers or code strings (for example "v2x_polyarchy" or "NGDP.RPCH"). Use names and plain language only.
- Keep it focused on what this means in ${country} rather than on statistical details.

Structure (approx. 140–220 words):
- Summary (3-5 sentences): say whether the two indices (refer to them by their names, ${
    metaA.name
  } and ${metaB.name}) tend to move together and what that generally implies.
- Why it matters (2–3 short bullets): practical or real-world implications in ${country}.
- Drivers/Context (2–3 short bullets): plausible reasons these move together, grounded in the provided index descriptions. Quote ${
    correlation!.r
  } (Pearson's r) and briefly describe how it describes the correlation, while disregarding other numbers.
- Caveats (1–2 short bullets): avoid causal claims; mention limits of the data if relevant; under no circumstances should missing definitions be acknowledged.

Rules:
- Do not include index codes or internal identifiers in the explanation.
- Do not list formulas or parenthetical statistics.
- If metadata is present, do not fabricate facts beyond the provided context.
- If metadata is missing, do not acknowledge the gap at all and refer to trustworthy sources of information (e.g., academic papers, official reports, established and respected sources).
`;

  const context = `Context:\n- ${rLine}\n- Years: ${yr}`;

  // Place internalRef last so the model sees it but is instructed not to
  // mention it. The visible prompt contains only human-facing names and
  // short descriptions.
  return [header, context, humanMeta, instructions, internalRef].join('\n\n');
}
