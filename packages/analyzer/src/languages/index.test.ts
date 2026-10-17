import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../types.js';
import {
  LANGUAGE_ANALYZERS,
  detectedAnalyzers,
  detectionFor,
  languageIdFor,
  primaryLanguage,
} from './index.js';

function file(path: string, language: FileEntry['language'], bytes: number): FileEntry {
  return {
    path,
    language,
    bytes,
    hash: `sha256:${path}`,
    lineCount: 1,
    isBinary: false,
    redacted: false,
    lastModifiedMs: 0,
  };
}

describe('language detection', () => {
  it('claims TypeScript, JavaScript, and Svelte file languages for the first adapter', () => {
    expect(detectionFor('typescript')?.analyzer.id).toBe('typescript');
    expect(detectionFor('tsx')?.language).toBe('typescript');
    expect(detectionFor('javascript')?.language).toBe('javascript');
    expect(detectionFor('jsx')?.language).toBe('javascript');
    expect(detectionFor('svelte')?.language).toBe('svelte');
  });

  it('detects the new languages and ignores everything else', () => {
    expect(detectionFor('python')?.analyzer.id).toBe('python');
    expect(detectionFor('go')?.analyzer.id).toBe('go');
    expect(detectionFor('rust')?.analyzer.id).toBe('rust');
    expect(detectionFor('java')?.analyzer.id).toBe('java');
    expect(detectionFor('markdown')).toBeNull();
    expect(detectionFor('yaml')).toBeNull();
    expect(languageIdFor('markdown')).toBeNull();
  });

  it('lists only the adapters a project actually needs, in registry order', () => {
    const files = [
      file('src/main.py', 'python', 10),
      file('src/main.go', 'go', 10),
      file('README.md', 'markdown', 10),
    ];
    const analyzers = detectedAnalyzers(files);

    expect(analyzers.map((analyzer) => analyzer.id)).toEqual(['python', 'go']);
    expect(LANGUAGE_ANALYZERS.map((analyzer) => analyzer.id)).toEqual([
      'typescript',
      'python',
      'go',
      'rust',
      'java',
    ]);
  });

  it('chooses the primary language by source bytes and breaks ties by id', () => {
    expect(
      primaryLanguage([
        file('a.py', 'python', 100),
        file('b.go', 'go', 40),
        file('README.md', 'markdown', 900),
      ]),
    ).toBe('python');
    expect(primaryLanguage([file('a.py', 'python', 100), file('b.go', 'go', 100)])).toBe(
      'go',
    );
    expect(primaryLanguage([file('README.md', 'markdown', 900)])).toBeNull();
  });

  it('records grammar-backed adapters as requiring a runtime', () => {
    for (const analyzer of LANGUAGE_ANALYZERS) {
      if (analyzer.id === 'typescript') {
        expect(analyzer.requiresGrammar).toBe(false);
      } else {
        expect(analyzer.requiresGrammar).toBe(true);
      }
    }
  });
});
