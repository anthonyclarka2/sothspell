import type { PrismaField, PrismaModel } from './types.js';

const MODEL_PATTERN = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
const FIELD_PATTERN = /^\s{2,}(\w+)\s+([A-Za-z0-9_<>[\]?]+)([^\n]*)$/;

/**
 * Reads Prisma models from a contract or schema file. This is a deliberately
 * small parser: the snapshot needs model and field names for the tour, not a
 * full Prisma grammar.
 */
export function parsePrismaModels(text: string, path: string): PrismaModel[] {
  const models: PrismaModel[] = [];

  for (const match of text.matchAll(MODEL_PATTERN)) {
    const name = match[1];
    const body = match[2];
    if (!name || body === undefined) {
      continue;
    }

    const fields: PrismaField[] = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue;
      }
      const field = FIELD_PATTERN.exec(line);
      if (!field) {
        continue;
      }
      const [, fieldName, fieldType, rawAttributes] = field;
      if (!fieldName || !fieldType) {
        continue;
      }
      fields.push({
        name: fieldName,
        type: fieldType,
        attributes: (rawAttributes ?? '').trim().split(/\s+/).filter(Boolean),
      });
    }

    models.push({ name, path, fields });
  }

  return models.toSorted((left, right) => left.name.localeCompare(right.name));
}
