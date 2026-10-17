import { describe, expect, it } from 'vitest';
import { buildSequenceModel } from './sequence.js';
import type { DiagramInstruction } from './index.js';

const sequence: DiagramInstruction = {
  id: 'diagram_sequence',
  kind: 'sequence',
  title: 'A request',
  nodes: [
    { id: 'client', label: 'Client', type: 'client', anchorId: 'anchor_client' },
    { id: 'api', label: 'API', type: 'service' },
  ],
  edges: [
    { id: 'message_one', from: 'client', to: 'api', kind: 'calls', label: 'request' },
    { id: 'message_two', from: 'api', to: 'client', kind: 'renders', label: 'response' },
  ],
};

describe('buildSequenceModel', () => {
  it('keeps actors and messages in declaration order', () => {
    const model = buildSequenceModel(sequence);

    expect(model?.actors.map((actor) => actor.id)).toEqual(['client', 'api']);
    expect(model?.actors[0]?.anchorId).toBe('anchor_client');
    expect(model?.messages.map((message) => message.id)).toEqual([
      'message_one',
      'message_two',
    ]);
    expect(model?.messages[0]?.label).toBe('request');
  });

  it('returns null for a non-sequence diagram', () => {
    expect(buildSequenceModel({ ...sequence, kind: 'architecture' })).toBeNull();
  });
});
