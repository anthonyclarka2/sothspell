import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { SothspellDocumentSchema } from '../src/schema.js';

const outputDirectory = new URL('../schema/', import.meta.url);
const outputFile = new URL('../schema/sothspell.schema.json', import.meta.url);

const jsonSchema = z.toJSONSchema(SothspellDocumentSchema, {
  target: 'draft-2020-12',
});

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf8');

console.log(`Wrote ${outputFile.pathname}`);
