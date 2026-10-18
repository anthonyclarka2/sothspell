import { spawn } from 'node:child_process';
import { createChildEnvironment } from '@sothspell/harness';

/**
 * The one process seam for the Claude Code adapter. The model adapter talks to
 * this port; tests inject a fake host, and the real implementation spawns the
 * `claude` CLI in non-interactive (`-p`) mode. Nothing else in the package
 * touches the host process.
 */

export interface ClaudeCodeHostRunInput {
  args: string[];
  stdin?: string;
  signal?: AbortSignal;
  cwd?: string;
}

export interface ClaudeCodeHostRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ClaudeCodeHost {
  run(input: ClaudeCodeHostRunInput): Promise<ClaudeCodeHostRunResult>;
}

export interface ClaudeCodeProcessHostOptions {
  /** Executable to spawn; defaults to `claude`. */
  command?: string;
  /** Extra environment for the child. */
  env?: NodeJS.ProcessEnv;
}

/** Spawns the real Claude Code CLI. Exported so the owner-gated smoke can use it. */
export function createClaudeCodeProcessHost(
  options: ClaudeCodeProcessHostOptions = {},
): ClaudeCodeHost {
  const command = options.command ?? 'claude';
  return {
    run(input) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, input.args, {
          cwd: input.cwd,
          env: {
            ...createChildEnvironment({
              prefixes: ['SOTHSPELL_', 'ANTHROPIC_', 'CLAUDE_'],
            }),
            ...options.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });

        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        child.once('error', reject);
        child.once('close', (code) => {
          resolve({ code, stdout, stderr });
        });

        if (input.stdin !== undefined) {
          child.stdin.end(input.stdin);
        } else {
          child.stdin.end();
        }
      });
    },
  };
}
