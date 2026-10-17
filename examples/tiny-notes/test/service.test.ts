/**
 * Behavior tests for the service seam. They open a real store on a temporary
 * directory with injected ids and clock, so assertions are deterministic and
 * nothing is written into the working tree.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  NoteNotFoundError,
  NoteValidationError,
  openNotes,
  type NoteService,
} from '../src/index.ts';
import { formatNote, formatSummary } from '../src/notes/format.ts';

async function withService(run: (service: NoteService) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tiny-notes-'));
  let sequence = 0;
  const next = (): number => (sequence += 1);
  const service = openNotes({
    filePath: path.join(directory, 'notes.json'),
    newId: () => `note-${next()}`,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, next())),
  });
  try {
    await run(service);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('adds a note, normalizes tags, and lists newest first', async () => {
  await withService(async (service) => {
    const first = await service.add({
      title: 'First',
      body: 'one',
      tags: ['Work', ' work ', 'Ideas'],
    });
    const second = await service.add({ title: 'Second' });
    assert.deepEqual(first.tags, ['ideas', 'work']);
    assert.deepEqual(
      (await service.search()).map((note) => note.id),
      [second.id, first.id],
    );
    assert.match(formatNote(first), /^## First\n\none\n\nTags: ideas, work/);
    assert.match(
      formatSummary(await service.summary()),
      /Notes: 2 total, 2 active, 0 archived/,
    );
  });
});

test('rejects a note without a title', async () => {
  await withService(async (service) => {
    await assert.rejects(service.add({ title: '   ' }), NoteValidationError);
  });
});

test('searches by tag and by text', async () => {
  await withService(async (service) => {
    await service.add({ title: 'Groceries', body: 'Oat milk and bread', tags: ['home'] });
    await service.add({
      title: 'Release notes',
      body: 'Ship the parser',
      tags: ['work'],
    });
    const byTag = await service.search({ tag: 'work' });
    const byText = await service.search({ text: 'OAT' });
    assert.deepEqual(
      byTag.map((note) => note.title),
      ['Release notes'],
    );
    assert.deepEqual(
      byText.map((note) => note.title),
      ['Groceries'],
    );
  });
});

test('archive hides a note from the default listing and is idempotent', async () => {
  await withService(async (service) => {
    const note = await service.add({ title: 'Old', tags: ['home'] });
    const archived = await service.archive(note.id);
    assert.notEqual(archived.archivedAt, null);
    assert.equal((await service.search()).length, 0);
    assert.equal((await service.search({ includeArchived: true })).length, 1);
    assert.deepEqual(await service.archive(note.id), archived);
  });
});

test('remove deletes a note and then reports it missing', async () => {
  await withService(async (service) => {
    const note = await service.add({ title: 'Temp' });
    assert.equal((await service.remove(note.id)).id, note.id);
    await assert.rejects(service.get(note.id), NoteNotFoundError);
  });
});

test('summary counts notes and ranks tags by frequency', async () => {
  await withService(async (service) => {
    await service.add({ title: 'A', tags: ['work'] });
    await service.add({ title: 'B', tags: ['work', 'urgent'] });
    const archived = await service.add({ title: 'C', tags: ['home'] });
    await service.archive(archived.id);
    assert.deepEqual(await service.summary(), {
      total: 3,
      active: 2,
      archived: 1,
      tags: [
        { tag: 'work', count: 2 },
        { tag: 'home', count: 1 },
        { tag: 'urgent', count: 1 },
      ],
    });
  });
});
