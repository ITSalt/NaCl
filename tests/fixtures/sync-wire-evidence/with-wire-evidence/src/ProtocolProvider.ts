// UC-300-style protocol provider (Anthropic-flavored api.kie.example.invalid endpoint).
//
// This is the canonical "type-alignment passes; wire format is what matters"
// shape from the project-beta api.kie.example.invalid postmortem. The BE and FE share this
// interface; without wire-evidence the live request still 404s.

export interface ProtocolRequest {
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens: number;
}

// Anthropic-flavored response envelope. NOT OpenAI shape.
// OpenAI would be `choices[0].message.content`; Anthropic is `content: [{ type, text }]`.
export interface ProtocolResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: Array<{ type: 'text'; text: string }>;
  stop_reason: string;
}

export interface ProtocolProvider {
  generate(req: ProtocolRequest): Promise<ProtocolResponse>;
  parseResponse(raw: unknown): string;
}

export class KieAiProtocolProvider implements ProtocolProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async generate(req: ProtocolRequest): Promise<ProtocolResponse> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`api.kie.example.invalid responded ${res.status}`);
    }
    return (await res.json()) as ProtocolResponse;
  }

  parseResponse(raw: unknown): string {
    // The wire envelope assertion this fixture exists to demonstrate.
    // A type-alignment-only check would never see this line break.
    const r = raw as ProtocolResponse;
    if (!Array.isArray(r.content) || r.content.length === 0) {
      throw new Error('protocol response missing content[]');
    }
    const block = r.content[0];
    if (block.type !== 'text' || typeof block.text !== 'string') {
      throw new Error('protocol response content[0] not a text block');
    }
    return block.text;
  }
}
