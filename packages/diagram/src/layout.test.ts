import { describe, expect, it } from 'vitest';
import { layoutDiagram, type DiagramInstruction } from './index.js';

const diagram: DiagramInstruction = {
  id: 'diagram_symbols',
  kind: 'architecture',
  title: 'Symbol targets',
  nodes: [
    {
      id: 'node_module',
      label: 'AppModule',
      type: 'class',
      symbolId: 'symbol:src/app.module.ts#AppModule',
    },
    {
      id: 'node_service',
      label: 'Service',
      type: 'class',
      anchorId: 'anchor_service',
    },
  ],
  edges: [
    {
      id: 'edge_one',
      from: 'node_module',
      to: 'node_service',
      kind: 'depends',
    },
  ],
};

describe('layoutDiagram', () => {
  it('copies symbol ID and anchor ID onto positioned nodes', async () => {
    const positioned = await layoutDiagram(diagram);

    expect(positioned.nodes[0]?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
    expect(positioned.nodes[0]?.anchorId).toBeUndefined();
    expect(positioned.nodes[1]?.anchorId).toBe('anchor_service');
    expect(positioned.nodes[1]?.symbolId).toBeUndefined();
  });

  it('leaves symbol IDs out when the diagram has none', async () => {
    const positioned = await layoutDiagram({
      ...diagram,
      nodes: [{ id: 'node_plain', label: 'Plain', type: 'note' }],
      edges: [],
    });

    expect(positioned.nodes[0]).not.toHaveProperty('symbolId');
    expect(positioned.nodes[0]).not.toHaveProperty('anchorId');
  });
});
