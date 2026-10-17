import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { ManifestInput } from './port.js';
import type {
  LanguageManifest,
  ManifestDependency,
  ManifestDependencyKind,
} from './types.js';

/**
 * Manifest readers for the brief. They deliberately extract only the fields the
 * brief reports: the project name and version, the build system, declared entry
 * points, and the dependency list. The raw manifest stays in the file manifest
 * with its hash, so a tour can anchor the manifest itself.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dependency(
  name: string,
  version: string | null,
  kind: ManifestDependencyKind = 'runtime',
): ManifestDependency {
  return { name, version, kind };
}

const REQUIREMENT_PATTERN = /^([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*([<>=!~][^;#\s]*)?/;

/** One line of a requirements file, minus markers, comments, and options. */
function parseRequirement(text: string): ManifestDependency | null {
  const line = (text.split(';')[0] ?? '').trim();
  if (line.length === 0 || line.startsWith('#') || line.startsWith('-')) {
    return null;
  }
  const match = REQUIREMENT_PATTERN.exec(line);
  const name = match?.[1];
  if (!name) {
    return null;
  }
  return dependency(name, match?.[2] ?? null);
}

function pythonBuildSystem(doc: Record<string, unknown>): string {
  const poetry = asRecord(asRecord(doc.tool).poetry);
  if (Object.keys(poetry).length > 0) {
    return 'poetry';
  }
  const buildSystem = asRecord(doc['build-system']);
  const backend = asString(buildSystem['build-backend']);
  if (backend) {
    return backend.split('.')[0] ?? backend;
  }
  const known = ['hatchling', 'setuptools', 'flit', 'pdm', 'poetry', 'maturin'];
  for (const requirement of asArray(buildSystem.requires)) {
    const name =
      typeof requirement === 'string'
        ? (requirement.split(/[<>=![]/)[0] ?? '').trim()
        : '';
    if (known.includes(name)) {
      return name;
    }
  }
  return 'pep517';
}

function readPyproject(manifestPath: string, text: string): LanguageManifest | null {
  let doc: Record<string, unknown>;
  try {
    doc = asRecord(parseToml(text));
  } catch {
    // A malformed manifest is not fatal: the file entry still carries its hash.
    return null;
  }

  const project = asRecord(doc.project);
  const poetry = asRecord(asRecord(doc.tool).poetry);
  const dependencies: ManifestDependency[] = [];

  for (const entry of asArray(project.dependencies)) {
    if (typeof entry === 'string') {
      const parsed = parseRequirement(entry);
      if (parsed) {
        dependencies.push(parsed);
      }
    }
  }
  for (const [group, entries] of Object.entries(
    asRecord(project['optional-dependencies']),
  )) {
    const kind: ManifestDependencyKind =
      group === 'dev' || group === 'test' || group === 'tests' ? 'dev' : 'unknown';
    for (const entry of asArray(entries)) {
      if (typeof entry === 'string') {
        const parsed = parseRequirement(entry);
        if (parsed) {
          dependencies.push({ ...parsed, kind });
        }
      }
    }
  }

  for (const [depName, value] of Object.entries(asRecord(poetry.dependencies))) {
    if (depName === 'python') {
      continue;
    }
    const inline = asRecord(value);
    dependencies.push(
      dependency(
        depName,
        asString(value) ?? asString(inline.version) ?? null,
        asString(inline.optional) === 'true' ? 'unknown' : 'runtime',
      ),
    );
  }
  for (const [group, entries] of Object.entries(asRecord(poetry.group))) {
    for (const [depName, value] of Object.entries(
      asRecord(asRecord(entries).dependencies),
    )) {
      const inline = asRecord(value);
      dependencies.push(
        dependency(
          depName,
          asString(value) ?? asString(inline.version) ?? null,
          group === 'dev' ? 'dev' : 'unknown',
        ),
      );
    }
  }

  const entryPoints = [
    ...Object.keys(asRecord(project.scripts)),
    ...Object.keys(asRecord(poetry.scripts)),
  ].toSorted();

  return {
    path: manifestPath,
    language: 'python',
    buildSystem: pythonBuildSystem(doc),
    name: asString(project.name) ?? asString(poetry.name) ?? null,
    version: asString(project.version) ?? asString(poetry.version) ?? null,
    entryPoints,
    dependencies,
  };
}

export function readPythonManifest(input: ManifestInput): LanguageManifest | null {
  if (path.posix.basename(input.path) === 'requirements.txt') {
    const dependencies: ManifestDependency[] = [];
    for (const line of input.text.split('\n')) {
      const parsed = parseRequirement(line);
      if (parsed) {
        dependencies.push(parsed);
      }
    }
    return {
      path: input.path,
      language: 'python',
      buildSystem: 'requirements',
      name: null,
      version: null,
      entryPoints: [],
      dependencies,
    };
  }
  return readPyproject(input.path, input.text);
}

export function readGoManifest(input: ManifestInput): LanguageManifest | null {
  let moduleName: string | null = null;
  const dependencies: ManifestDependency[] = [];

  const addRequirement = (entry: string): void => {
    const [name, version] = entry.trim().split(/\s+/);
    if (name && name.length > 0) {
      dependencies.push(dependency(name, version ?? null));
    }
  };

  let inRequireBlock = false;
  for (const rawLine of input.text.split('\n')) {
    const line = (rawLine.split('//')[0] ?? '').trim();
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith('module ')) {
      moduleName = line.slice('module '.length).trim();
      continue;
    }
    if (line === 'require (') {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock) {
      if (line === ')') {
        inRequireBlock = false;
        continue;
      }
      addRequirement(line);
      continue;
    }
    if (line.startsWith('require ')) {
      addRequirement(line.slice('require '.length));
    }
  }

  return {
    path: input.path,
    language: 'go',
    buildSystem: 'go modules',
    name: moduleName,
    version: null,
    entryPoints: [],
    dependencies,
  };
}

export function readCargoManifest(input: ManifestInput): LanguageManifest | null {
  let doc: Record<string, unknown>;
  try {
    doc = asRecord(parseToml(input.text));
  } catch {
    return null;
  }

  const pkg = asRecord(doc.package);
  const dependencies: ManifestDependency[] = [];
  const addTable = (value: unknown, kind: ManifestDependencyKind): void => {
    for (const [depName, entry] of Object.entries(asRecord(value))) {
      const inline = asRecord(entry);
      dependencies.push(
        dependency(depName, asString(entry) ?? asString(inline.version) ?? null, kind),
      );
    }
  };
  addTable(doc.dependencies, 'runtime');
  addTable(doc['dev-dependencies'], 'dev');
  addTable(doc['build-dependencies'], 'build');

  const entryPoints = asArray(doc.bin)
    .map((entry) => asString(asRecord(entry).name))
    .filter((name): name is string => name !== null);

  return {
    path: input.path,
    language: 'rust',
    buildSystem: 'cargo',
    name: asString(pkg.name) ?? null,
    version: asString(pkg.version) ?? null,
    entryPoints: entryPoints.toSorted(),
    dependencies,
  };
}

function xmlBlocks(text: string, tag: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

function xmlValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

export function readMavenManifest(input: ManifestInput): LanguageManifest | null {
  const dependencies: ManifestDependency[] = [];
  for (const block of xmlBlocks(input.text, 'dependency')) {
    const groupId = xmlValue(block, 'groupId');
    const artifactId = xmlValue(block, 'artifactId');
    if (!artifactId) {
      continue;
    }
    const scope = xmlValue(block, 'scope');
    const kind: ManifestDependencyKind =
      scope === 'test'
        ? 'dev'
        : scope === 'provided' || scope === 'import'
          ? 'build'
          : 'runtime';
    dependencies.push(
      dependency(
        groupId ? `${groupId}:${artifactId}` : artifactId,
        xmlValue(block, 'version'),
        kind,
      ),
    );
  }

  const mainClasses: string[] = [];
  const mainClassPattern = /<mainClass\b[^>]*>([\s\S]*?)<\/mainClass>/g;
  let match: RegExpExecArray | null;
  while ((match = mainClassPattern.exec(input.text)) !== null) {
    const value = match[1]?.trim();
    if (value) {
      mainClasses.push(value);
    }
  }

  return {
    path: input.path,
    language: 'java',
    buildSystem: 'maven',
    name: xmlValue(input.text, 'artifactId'),
    version: xmlValue(input.text, 'version'),
    entryPoints: mainClasses.toSorted(),
    dependencies,
  };
}

const GRADLE_CONFIGURATION_KINDS: Record<string, ManifestDependencyKind> = {
  implementation: 'runtime',
  api: 'runtime',
  runtimeOnly: 'runtime',
  testImplementation: 'dev',
  testRuntimeOnly: 'dev',
  compileOnly: 'build',
  annotationProcessor: 'build',
  kapt: 'build',
};

export function readGradleManifest(input: ManifestInput): LanguageManifest | null {
  const dependencies: ManifestDependency[] = [];
  const pattern =
    /^\s*(implementation|api|runtimeOnly|testImplementation|testRuntimeOnly|compileOnly|annotationProcessor|kapt)\s*[( ]\s*['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input.text)) !== null) {
    const configuration = match[1] ?? '';
    const coordinate = match[2] ?? '';
    const [group, artifact, version] = coordinate.split(':');
    const name = group && artifact ? `${group}:${artifact}` : coordinate;
    dependencies.push(
      dependency(
        name,
        version ?? null,
        GRADLE_CONFIGURATION_KINDS[configuration] ?? 'unknown',
      ),
    );
  }

  const version = /^\s*version\s*=\s*['"]([^'"]+)['"]/m.exec(input.text)?.[1] ?? null;
  const name =
    /^\s*(?:rootProject\.name|name)\s*=\s*['"]([^'"]+)['"]/m.exec(input.text)?.[1] ??
    null;

  return {
    path: input.path,
    language: 'java',
    buildSystem: 'gradle',
    name,
    version,
    entryPoints: [],
    dependencies,
  };
}
