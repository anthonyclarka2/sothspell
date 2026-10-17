export interface DiffToken {
  text: string;
  kind: 'same' | 'added' | 'removed';
}

export interface WordDiff {
  before: DiffToken[];
  after: DiffToken[];
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/u).filter((token) => token.length > 0);
}

/**
 * A word-level diff for the regeneration comparison. Narration is bounded at
 * 1200 characters, so the quadratic LCS table is small and exact; no external
 * diff dependency is needed for one panel.
 */
function lcsTable(left: string[], right: string[]): number[][] {
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        left[i] === right[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

export function diffWords(beforeText: string, afterText: string): WordDiff {
  const left = tokenize(beforeText);
  const right = tokenize(afterText);
  const table = lcsTable(left, right);

  const before: DiffToken[] = [];
  const after: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      before.push({ text: left[i]!, kind: 'same' });
      after.push({ text: right[j]!, kind: 'same' });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      before.push({ text: left[i]!, kind: 'removed' });
      i += 1;
    } else {
      after.push({ text: right[j]!, kind: 'added' });
      j += 1;
    }
  }
  while (i < left.length) {
    before.push({ text: left[i]!, kind: 'removed' });
    i += 1;
  }
  while (j < right.length) {
    after.push({ text: right[j]!, kind: 'added' });
    j += 1;
  }

  return { before, after };
}

function countTokens(tokens: DiffToken[], kind: DiffToken['kind']): number {
  return tokens.filter((token) => token.kind === kind && token.text.trim().length > 0)
    .length;
}

export function diffCounts(diff: WordDiff): { added: number; removed: number } {
  return {
    added: countTokens(diff.after, 'added'),
    removed: countTokens(diff.before, 'removed'),
  };
}
