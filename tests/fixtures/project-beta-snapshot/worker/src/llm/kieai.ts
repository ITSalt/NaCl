// Synthetic reconstruction of the project-beta UC-300 wire-format gap.
// Source episode: project-beta-postmortem.md § 3.3 (api.kie.example.invalid endpoint shape — SPEC MISSING).
//
// The TS type `ILlmProvider` is shared between BE and FE; both ends
// import the same type → `nacl-tl-sync` PASSES on type-alignment alone.
// BUT no recorded fixture or contract test exists demonstrating the
// actual wire shape api.kie.example.invalid returns. The adapter defaults to OpenAI-shape
// parsing (`choices[0].message.content`); api.kie.example.invalid actually requires
// Anthropic-shape (`content[].text` walk).
//
// Post-W2, `nacl-tl-sync` emits `UNVERIFIED (wire-evidence missing)`
// because UC-300 has `actor != SYSTEM` (analyst initiates) and no
// `wire-evidence:fixture:<path>` / `wire-evidence:contract-test:<path>`
// / `wire-evidence:live-smoke:<timestamp>` artifact is present.

interface ILlmProvider {
  generate(args: { prompt: string; model?: string; language: string }): Promise<LlmResult>;
}

interface LlmResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

const KIE_BASE_URL = 'https://api.kie.example.invalid/v1'; // sanitised
const KIE_API_KEY = process.env.KIE_API_KEY ?? '';

export class KieAiLlmProvider implements ILlmProvider {
  async generate({ prompt, model, language }: { prompt: string; model?: string; language: string }): Promise<LlmResult> {
    // BUG: OpenAI-shape request body — api.kie.example.invalid is Anthropic-flavoured.
    // The fix landed in commit 1f025b7 (POST-DELIVERY) and rewrote both
    // the request body shape AND the response parsing path.
    const res = await fetch(`${KIE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model ?? 'claude-sonnet-4',
        messages: [{ role: 'user', content: prompt }],
        language,
      }),
    });
    const data = await res.json() as { choices: Array<{ message: { content: string } }>; usage: { input: number; output: number } };
    return {
      text: data.choices[0].message.content, // crashes against Anthropic shape
      model: model ?? 'claude-sonnet-4',
      tokensIn: data.usage.input,
      tokensOut: data.usage.output,
    };
  }
}

// NOTE: this file is INTENTIONALLY shipped without a wire-evidence
// artifact. To pass W2, projects must add either:
//   - tests/fixtures/wire-evidence/kieai-protocol.json (recorded shape)
//   - tests/integration/kieai-contract.test.ts (running HTTP round-trip)
//   - .tl/qa-smoke/kieai-LIVE-SMOKE-<timestamp>.json
// Without any of these, post-W2 sync emits UNVERIFIED.
