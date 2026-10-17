import { readFileSync } from 'node:fs';

export const PROMPT_VERSION = '1.0.0';

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }
  const text = readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), 'utf8');
  cache.set(name, text);
  return text;
}

export function renderPrompt(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  });
}
