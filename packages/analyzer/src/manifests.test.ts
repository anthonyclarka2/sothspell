import { describe, expect, it } from 'vitest';
import {
  readCargoManifest,
  readGoManifest,
  readGradleManifest,
  readMavenManifest,
  readPythonManifest,
} from './manifests.js';

describe('python manifests', () => {
  it('reads a PEP 621 pyproject', () => {
    const manifest = readPythonManifest({
      path: 'pyproject.toml',
      text: [
        '[build-system]',
        'requires = ["hatchling"]',
        'build-backend = "hatchling.build"',
        '',
        '[project]',
        'name = "demo"',
        'version = "1.2.3"',
        'dependencies = [',
        '  "httpx>=0.27",',
        '  "attrs",',
        ']',
        '',
        '[project.optional-dependencies]',
        'dev = ["pytest>=8"]',
        '',
        '[project.scripts]',
        'demo = "demo.__main__:main"',
      ].join('\n'),
    });

    expect(manifest).toMatchObject({
      path: 'pyproject.toml',
      language: 'python',
      buildSystem: 'hatchling',
      name: 'demo',
      version: '1.2.3',
      entryPoints: ['demo'],
    });
    expect(manifest?.dependencies).toEqual([
      { name: 'httpx', version: '>=0.27', kind: 'runtime' },
      { name: 'attrs', version: null, kind: 'runtime' },
      { name: 'pytest', version: '>=8', kind: 'dev' },
    ]);
  });

  it('reads a poetry pyproject and its dev group', () => {
    const manifest = readPythonManifest({
      path: 'pyproject.toml',
      text: [
        '[tool.poetry]',
        'name = "demo"',
        'version = "0.2.0"',
        '',
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'requests = "^2.32"',
        '',
        '[tool.poetry.group.dev.dependencies]',
        'pytest = "^8"',
        '',
        '[tool.poetry.scripts]',
        'demo = "demo:main"',
      ].join('\n'),
    });

    expect(manifest?.buildSystem).toBe('poetry');
    expect(manifest?.name).toBe('demo');
    expect(manifest?.dependencies).toEqual([
      { name: 'requests', version: '^2.32', kind: 'runtime' },
      { name: 'pytest', version: '^8', kind: 'dev' },
    ]);
  });

  it('reads requirements.txt, skipping options and markers', () => {
    const manifest = readPythonManifest({
      path: 'requirements.txt',
      text: [
        '# runtime',
        'httpx>=0.27',
        'attrs[extra]==23.2.0 ; python_version >= "3.12"',
        '-r other.txt',
        '-e .',
        '',
      ].join('\n'),
    });

    expect(manifest?.buildSystem).toBe('requirements');
    expect(manifest?.dependencies).toEqual([
      { name: 'httpx', version: '>=0.27', kind: 'runtime' },
      { name: 'attrs', version: '==23.2.0', kind: 'runtime' },
    ]);
  });

  it('returns null for a malformed manifest instead of throwing', () => {
    expect(readPythonManifest({ path: 'pyproject.toml', text: '[project' })).toBeNull();
  });
});

describe('go manifests', () => {
  it('reads the module path and require blocks', () => {
    const manifest = readGoManifest({
      path: 'go.mod',
      text: [
        'module example.com/demo',
        '',
        'go 1.22',
        '',
        'require (',
        '\tgithub.com/google/uuid v1.6.0',
        '\tgolang.org/x/text v0.14.0 // indirect',
        ')',
        '',
        'require github.com/stretchr/testify v1.9.0',
      ].join('\n'),
    });

    expect(manifest).toMatchObject({
      language: 'go',
      buildSystem: 'go modules',
      name: 'example.com/demo',
      version: null,
      entryPoints: [],
    });
    expect(manifest?.dependencies).toEqual([
      { name: 'github.com/google/uuid', version: 'v1.6.0', kind: 'runtime' },
      { name: 'golang.org/x/text', version: 'v0.14.0', kind: 'runtime' },
      { name: 'github.com/stretchr/testify', version: 'v1.9.0', kind: 'runtime' },
    ]);
  });
});

describe('cargo manifests', () => {
  it('reads the package, dependency tables, and binaries', () => {
    const manifest = readCargoManifest({
      path: 'Cargo.toml',
      text: [
        '[package]',
        'name = "demo"',
        'version = "0.3.0"',
        '',
        '[dependencies]',
        'serde = { version = "1.0", features = ["derive"] }',
        'anyhow = "1"',
        '',
        '[dev-dependencies]',
        'pretty_assertions = "1.4"',
        '',
        '[[bin]]',
        'name = "demo"',
        'path = "src/main.rs"',
      ].join('\n'),
    });

    expect(manifest).toMatchObject({
      language: 'rust',
      buildSystem: 'cargo',
      name: 'demo',
      version: '0.3.0',
      entryPoints: ['demo'],
    });
    expect(manifest?.dependencies).toEqual([
      { name: 'serde', version: '1.0', kind: 'runtime' },
      { name: 'anyhow', version: '1', kind: 'runtime' },
      { name: 'pretty_assertions', version: '1.4', kind: 'dev' },
    ]);
  });
});

describe('maven manifests', () => {
  it('reads coordinates, dependencies, scopes, and main classes', () => {
    const manifest = readMavenManifest({
      path: 'pom.xml',
      text: [
        '<project>',
        '  <artifactId>demo</artifactId>',
        '  <version>1.0.0</version>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.junit.jupiter</groupId>',
        '      <artifactId>junit-jupiter</artifactId>',
        '      <version>5.10.2</version>',
        '      <scope>test</scope>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>com.example</groupId>',
        '      <artifactId>core</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '  <build><plugins><plugin><configuration>',
        '    <mainClass>com.example.demo.Main</mainClass>',
        '  </configuration></plugin></plugins></build>',
        '</project>',
      ].join('\n'),
    });

    expect(manifest).toMatchObject({
      language: 'java',
      buildSystem: 'maven',
      name: 'demo',
      version: '1.0.0',
      entryPoints: ['com.example.demo.Main'],
    });
    expect(manifest?.dependencies).toEqual([
      {
        name: 'org.junit.jupiter:junit-jupiter',
        version: '5.10.2',
        kind: 'dev',
      },
      { name: 'com.example:core', version: null, kind: 'runtime' },
    ]);
  });
});

describe('gradle manifests', () => {
  it('reads dependency notations by configuration', () => {
    const manifest = readGradleManifest({
      path: 'build.gradle',
      text: [
        "group = 'com.example'",
        "version = '2.0.0'",
        'dependencies {',
        "  implementation 'com.example:core:1.0.0'",
        '  api("org.slf4j:slf4j-api:2.0.13")',
        "  testImplementation 'org.junit.jupiter:junit-jupiter:5.10.2'",
        "  compileOnly 'org.projectlombok:lombok:1.18.32'",
        '}',
      ].join('\n'),
    });

    expect(manifest).toMatchObject({
      language: 'java',
      buildSystem: 'gradle',
      version: '2.0.0',
    });
    expect(manifest?.dependencies).toEqual([
      { name: 'com.example:core', version: '1.0.0', kind: 'runtime' },
      { name: 'org.slf4j:slf4j-api', version: '2.0.13', kind: 'runtime' },
      {
        name: 'org.junit.jupiter:junit-jupiter',
        version: '5.10.2',
        kind: 'dev',
      },
      { name: 'org.projectlombok:lombok', version: '1.18.32', kind: 'build' },
    ]);
  });
});
