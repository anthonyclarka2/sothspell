import { spawn } from 'node:child_process';
import { createChildEnvironment } from '@sothspell/harness';

/**
 * The one process seam for the Codex adapter. The model adapter talks to this
 * port; tests inject a fake host, and the real implementation spawns
 * `codex exec`. Nothing else in the package touches the host process.
 */

export interface CodexHostRunInput {
  args: string[];
  stdin?: string;
  signal?: AbortSignal;
  cwd?: string;
}

export interface CodexHostRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CodexHost {
  run(input: CodexHostRunInput): Promise<CodexHostRunResult>;
}

export interface CodexProcessHostOptions {
  /** Executable to spawn; defaults to `codex`. */
  command?: string;
  env?: NodeJS.ProcessEnv;
}

/** Spawns the real Codex CLI. Exported so the owner-gated smoke can use it. */
export function createCodexProcessHost(options: CodexProcessHostOptions = {}): CodexHost {
  const command = options.command ?? 'codex';
  return {
    run(input) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, input.args, {
          cwd: input.cwd,
          env: {
            ...createChildEnvironment({
              prefixes: ['SOTHSPELL_', 'OPENAI_', 'CODEX_'],
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
