import type { HarnessStatus } from './types.js';

/**
 * The human-readable rendering every harness shares. Keeping it here means the
 * OpenCode command, the Claude Code skill, and the Codex skill print the same
 * status and answer text instead of drifting apart.
 */

export function formatStatus(status: HarnessStatus): string {
  const lines = [
    `Project: ${status.projectRoot}`,
    `Tour: ${status.tourId ?? 'none yet'}`,
    `Player: ${status.playerUrl}`,
  ];
  if (status.run) {
    lines.push(`Run: ${status.run.beatId}, ${status.run.completed} beat(s) completed`);
  } else {
    lines.push('Run: no saved progress');
  }
  return lines.join('\n');
}

/**
 * The SessionStart hook payload shared by the Claude Code and Codex adapters:
 * announce an existing tour through `additionalContext`, stay silent when none
 * exists. Both hosts accept the same `hookSpecificOutput` shape.
 */
export function sessionStartHookOutput(status: HarnessStatus): string | null {
  if (!status.tourId) {
    return null;
  }
  const deepLink = `${status.playerUrl}/t/${encodeURIComponent(status.tourId)}`;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: [
        `A sóþspell tour exists for this project (${status.tourId}).`,
        `Open ${deepLink} to play it, or ask the guide about the current beat.`,
        'The player is the `sothspell serve` process; do not start a second server.',
      ].join(' '),
    },
  });
}

export function formatAnswer(answer: unknown): string {
  if (answer !== null && typeof answer === 'object') {
    const record = answer as {
      answer?: { markdown?: unknown };
      citations?: unknown;
    };
    if (typeof record.answer?.markdown === 'string') {
      const citations = Array.isArray(record.citations)
        ? record.citations
            .map((citation) => {
              if (citation === null || typeof citation !== 'object') {
                return null;
              }
              const entry = citation as { label?: unknown; path?: unknown };
              if (typeof entry.path !== 'string') {
                return null;
              }
              return `- ${typeof entry.label === 'string' ? entry.label : entry.path} (${entry.path})`;
            })
            .filter((line): line is string => line !== null)
        : [];
      return [
        record.answer.markdown,
        ...(citations.length > 0 ? ['', 'Citations:', ...citations] : []),
      ].join('\n');
    }
  }
  return JSON.stringify(answer, null, 2) ?? 'No answer returned.';
}
