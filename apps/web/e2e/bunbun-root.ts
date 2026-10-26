import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The live golden-tour specs read the real Bunbun checkout. The checked-in
 * excerpts cannot stand in for a full source file or the symbol graph, so
 * specs skip when the read-only checkout is absent (for example in CI).
 */
export const bunbunRoot =
  process.env.BUNBUN_ROOT ??
  process.env.SOTHSPELL_PROJECT_ROOT ??
  '/Users/ajc/Projects/codegens/bunbun';

// An empty directory is not a checkout: require the repository marker so an
// unpopulated source root skips the live specs instead of failing them.
export const bunbunAvailable = existsSync(join(bunbunRoot, 'package.json'));
