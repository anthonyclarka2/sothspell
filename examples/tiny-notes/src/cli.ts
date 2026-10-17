/**
 * The tiny-notes command line. It parses arguments, calls the service, and
 * prints through the shared formatters, keeping storage and note rules out of
 * the front end so the CLI and the HTTP API cannot drift apart.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openNotes, NoteValidationError, type NoteService } from './index.ts';
import { formatNote, formatNoteList, formatSummary } from './notes/format.ts';
import { startNotesServer } from './http/server.ts';

const USAGE = `Usage: tiny-notes <command> [options]

  add <title> [--body <text>] [--tag <tag>]   Create a note
  list [--tag <tag>] [--all]                  List notes (--all includes archived)
  search <text> [--tag <tag>]                 Search title and body
  archive <id> | remove <id>                  Archive or delete a note
  summary                                     Show counts and tags
  serve [--port <number>]                     Start the JSON API (default 4321)

The notes file defaults to ./.tiny-notes/notes.json; set TINY_NOTES_FILE to override.`;

/** Flags that carry no value; every other flag consumes the next token. */
const BOOLEAN_FLAGS = new Set(['all', 'help']);

interface ParsedArguments {
  command: string;
  positional: string[];
  flags: Map<string, string[]>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? '';
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, ['true']);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new NoteValidationError(`--${name} needs a value`);
    }
    flags.set(name, [...(flags.get(name) ?? []), value]);
    index += 1;
  }
  return { command, positional, flags };
}

function flag(flags: Map<string, string[]>, name: string): string | undefined {
  return flags.get(name)?.[0];
}

function requiredText(value: string | undefined, message: string): string {
  const text = (value ?? '').trim();
  if (text.length === 0) {
    throw new NoteValidationError(message);
  }
  return text;
}

/** One entry per command; each receives the parsed arguments and the service. */
const COMMANDS: Record<
  string,
  (parsed: ParsedArguments, service: NoteService) => Promise<void>
> = {
  async add({ positional, flags }, service) {
    const note = await service.add({
      title: requiredText(positional.join(' '), 'add needs a title'),
      body: flag(flags, 'body') ?? '',
      tags: flags.get('tag') ?? [],
    });
    console.log(formatNote(note));
  },
  async list({ flags }, service) {
    const notes = await service.search({
      tag: flag(flags, 'tag'),
      includeArchived: flags.has('all'),
    });
    console.log(formatNoteList(notes));
  },
  async search({ positional, flags }, service) {
    const notes = await service.search({
      text: requiredText(positional.join(' '), 'search needs a text query'),
      tag: flag(flags, 'tag'),
    });
    console.log(formatNoteList(notes));
  },
  async archive({ positional }, service) {
    const id = requiredText(positional[0], 'archive needs a note id');
    console.log(formatNote(await service.archive(id)));
  },
  async remove({ positional }, service) {
    const note = await service.remove(
      requiredText(positional[0], 'remove needs a note id'),
    );
    console.log(`Removed ${note.id}: ${note.title}`);
  },
  async summary(_parsed, service) {
    console.log(formatSummary(await service.summary()));
  },
  async serve({ flags }, service) {
    const port = Number.parseInt(flag(flags, 'port') ?? '4321', 10);
    const { url } = await startNotesServer(service, { port });
    console.log(`tiny-notes API listening on ${url}`);
  },
};

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArguments(argv);
  const command = COMMANDS[parsed.command];
  if (command === undefined) {
    console.log(USAGE);
    return parsed.command === 'help' ? 0 : 1;
  }
  const filePath =
    process.env.TINY_NOTES_FILE ?? path.join(process.cwd(), '.tiny-notes', 'notes.json');
  await command(parsed, openNotes({ filePath }));
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
