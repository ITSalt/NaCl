// UC-300-style protocol provider (Anthropic-flavored api.kie.example.invalid endpoint).
//
// Identical to ../../with-wire-evidence/src/ProtocolProvider.ts on purpose:
// the TS interface and implementation match across both fixtures. The only
// dimension that differs is the presence of wire-evidence — see the README.

export interface ProtocolRequest {
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens: number;
}

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
