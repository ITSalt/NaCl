// wire-evidence:fixture test
//
// Loads the recorded api.kie.example.invalid response in ../wire-evidence/fixture-response.json
// and asserts KieAiProtocolProvider.parseResponse() handles the real envelope.
//
// This test is the artifact `nacl-tl-sync` recognizes as
// `wire-evidence:fixture:<path>`. The host project's runner (vitest, jest)
// is expected to discover this file via its standard test glob; the test
// itself does not mock fetch — it parses a recorded JSON body.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KieAiProtocolProvider, type ProtocolResponse } from '../src/ProtocolProvider';

describe('KieAiProtocolProvider — wire-evidence:fixture', () => {
  const fixturePath = resolve(__dirname, '..', 'wire-evidence', 'fixture-response.json');
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as ProtocolResponse & {
    _capture_meta?: { status: number };
  };

  it('parses the recorded Anthropic-flavored envelope', () => {
    const provider = new KieAiProtocolProvider('https://api.api.kie.example.invalid', 'test-key');
    const text = provider.parseResponse(raw);
    expect(text).toBe('PROTOCOL OUTLINE\n1. Purpose\n2. Participants\n3. Agenda');
  });

  it('rejects an OpenAI-flavored envelope (regression guard against the wire-shape mismatch)', () => {
    const provider = new KieAiProtocolProvider('https://api.api.kie.example.invalid', 'test-key');
    const openAiShape = {
      id: 'chatcmpl-abc',
      choices: [{ message: { content: 'this would be OpenAI' } }],
    };
    expect(() => provider.parseResponse(openAiShape)).toThrow(/content/);
  });

  it('the fixture is a captured 200 response', () => {
    expect(raw._capture_meta?.status).toBe(200);
  });
});
