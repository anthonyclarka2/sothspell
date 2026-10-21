import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-symbols-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'symbol-fixture', version: '1.0.0' }),
  );
  await writeFile(
    path.join(root, 'src', 'store.ts'),
    [
      'export interface StoredComment {',
      '  id: string;',
      '}',
      'export type CommentId = string;',
      'export enum CommentState {',
      "  Active = 'active',",
      '}',
      'export class CommentStore {',
      '  save(id: CommentId): StoredComment {',
      '    return { id };',
      '  }',
      '}',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    [
      "import { Injectable } from '@nestjs/common';",
      "import { CommentStore, type CommentId } from './store';",
      '',
      '@Injectable()',
      'export class CommentsService {',
      '  constructor(private readonly store: CommentStore) {}',
      '',
      "  @Get(':id')",
      '  create(id: CommentId): StoredComment {',
      '    return this.store.save(id);',
      '  }',
      '}',
      '',
      'export function greet(name: string): string {',
      '  return `hello ${name}`;',
      '}',
      '',
      'export const answer = 42;',
      'const helper = (): number => 1;',
    ].join('\n'),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('symbol extraction', () => {
  it('extracts classes, methods, functions, variables, interfaces, types, and enums', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const byQualifiedName = new Map(
      snapshot.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
    );

    expect(byQualifiedName.get('CommentStore')?.kind).toBe('class');
    expect(byQualifiedName.get('CommentStore.save')?.kind).toBe('method');
    expect(byQualifiedName.get('CommentsService.create')?.kind).toBe('method');
    expect(byQualifiedName.get('StoredComment')?.kind).toBe('interface');
    expect(byQualifiedName.get('CommentId')?.kind).toBe('type');
    expect(byQualifiedName.get('CommentState')?.kind).toBe('enum');
    expect(byQualifiedName.get('greet')?.kind).toBe('function');
    expect(byQualifiedName.get('answer')?.kind).toBe('variable');
    expect(byQualifiedName.get('helper')?.kind).toBe('function');
  });

  it('keeps decorators and export status', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const service = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === 'CommentsService',
    );
    const create = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === 'CommentsService.create',
    );

    expect(service?.decorators.map((entry) => entry.name)).toContain('Injectable');
    expect(service?.exported).toBe(true);
    expect(create?.decorators).toContainEqual({ name: 'Get', argument: ':id' });
    expect(create?.parentId).toBe(service?.id);
  });

  it('builds file import edges and package imports', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);

    expect(snapshot.graph.fileImports).toContainEqual({
      from: 'src/service.ts',
      to: 'src/store.ts',
      specifier: './store',
      line: 2,
    });
    expect(snapshot.graph.packageImports).toContainEqual({
      from: 'src/service.ts',
      packageName: '@nestjs/common',
      specifier: '@nestjs/common',
    });
    expect(snapshot.graph.edges).toContainEqual({
      from: 'symbol:src/service.ts',
      to: 'symbol:src/store.ts',
      kind: 'imports',
      confidence: 'syntax',
      line: 2,
    });
    expect(snapshot.graph.edges).toContainEqual({
      from: 'symbol:src/service.ts',
      to: 'symbol:src/store.ts#CommentStore',
      kind: 'references',
      confidence: 'import',
      line: 2,
    });
  });

  it('produces stable symbol ids across runs', async () => {
    const root = await makeProject();
    const first = await analyzeProject(root);
    const second = await analyzeProject(root);

    expect(second.symbols.map((symbol) => symbol.id)).toEqual(
      first.symbols.map((symbol) => symbol.id),
    );
    expect(
      first.symbols.find((symbol) => symbol.qualifiedName === 'CommentStore')?.id,
    ).toBe('symbol:src/store.ts#CommentStore');
  });

  it('reads Prisma models from a contract file', async () => {
    const root = await makeProject();
    await writeFile(
      path.join(root, 'contract.prisma'),
      [
        'model Comment {',
        '  id String @id',
        '  text String',
        '  threadId String',
        '}',
      ].join('\n'),
    );
    const snapshot = await analyzeProject(root);

    expect(snapshot.prismaModels).toContainEqual({
      name: 'Comment',
      path: 'contract.prisma',
      fields: [
        { name: 'id', type: 'String', attributes: ['@id'] },
        { name: 'text', type: 'String', attributes: [] },
        { name: 'threadId', type: 'String', attributes: [] },
      ],
    });
  });
});
