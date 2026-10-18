/**
 * Child processes get an allowlisted environment instead of the whole server
 * environment. A harness CLI needs PATH, HOME, locale, and its own provider
 * variables; it does not need the user's GitHub tokens, cloud keys for other
 * tools, or this machine's unrelated secrets.
 */

const ALLOWED_EXACT: ReadonlySet<string> = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'CI',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'SSH_AUTH_SOCK',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMDATA',
]);

export interface ChildEnvironmentOptions {
  /** Variable prefixes the child needs, for example `ANTHROPIC_`. */
  prefixes?: readonly string[];
  /** Explicit overrides that always win. */
  extra?: NodeJS.ProcessEnv;
  /** Source environment; defaults to `process.env`. */
  source?: NodeJS.ProcessEnv;
}

export function createChildEnvironment(
  options: ChildEnvironmentOptions = {},
): NodeJS.ProcessEnv {
  const source = options.source ?? process.env;
  const prefixes = options.prefixes ?? [];
  const result: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (ALLOWED_EXACT.has(name) || prefixes.some((prefix) => name.startsWith(prefix))) {
      result[name] = value;
    }
  }

  return { ...result, ...options.extra };
}
