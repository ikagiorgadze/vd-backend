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

Index B: ${metaB.name}
`;

  // Internal reference: codes are provided but explicitly labeled as internal
  // and the model must not mention them in the answer.
  const internalRef = `
Internal reference (do not mention these identifiers in the answer):
A = ${metaA.index_code}
B = ${metaB.index_code}
`;

  const instructions = `Write a short, professional explanation for a general audience.

MANDATORY OUTPUT FORMAT:
- The response MUST contain the following four headers (exact spelling and capitalization):
  Summary
  Why it matters
  Drivers/Context
  Caveats

Each header must be followed by the content described below. Do not add any other top-level header. The headers become the primary structure of the answer; put the shortest possible summary under each.

Style and tone:
- Use professional language and tone. Prefer technical terms over everyday words.
- Refer to the indices only by their human-friendly names (not codes).
- Never mention internal identifiers, code strings, file names, or dataset labels (for example "v2x_polyarchy", "v2lgstafflo", or "NGDP.RPCH").
- Keep it focused on what this means in ${country} rather than on statistical details.

Structure (approx. 140–220 words total):
- Summary (3-5 sentences): say whether the two indices (refer to them by their names, ${metaA.name} and ${metaB.name}) tend to move together and what that generally implies.
- Why it matters (2-3 short bullets): practical or real-world implications in ${country}.
- Drivers/Context (2-3 short bullets): plausible reasons these move together, grounded in the provided index descriptions. Quote ${correlation!.r} (Pearson's r) and briefly describe how it describes the correlation.
- Caveats (1-2 short bullets): avoid causal claims; mention limits of the data if relevant; under no circumstances should missing definitions be acknowledged.

Rules:
- Do not include index codes or internal identifiers anywhere in the explanation.
- Do not list formulas or parenthetical statistics beyond the single quoted Pearson r in Drivers/Context.
- If metadata is present, do not fabricate facts beyond the provided context.
- If metadata is missing, do not acknowledge the gap; instead give cautious, general language grounded in plausible external sources.
`;

  const context = `Context:\n- ${rLine}\n- Years: ${yr}`;

  // Place internalRef last so the model sees it but is instructed not to
  // mention it. The visible prompt contains only human-facing names and
  // short descriptions.
  return [header, context, humanMeta, instructions, internalRef].join('\n\n');
}
