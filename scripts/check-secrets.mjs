#!/usr/bin/env node
/**
 * Guards the public repository against committed credentials. It scans every
 * tracked file with high-signal token shapes and assignment patterns, skips the
 * test/fixture files that intentionally contain fake keys, and exits non-zero
 * with file:line locations on any match. Run it in CI and before publishing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TOKEN_PATTERNS = [
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'OpenAI key', pattern: /\bsk-[A-Za-z0-9]{24,}\b/ },
  { name: 'OpenAI project key', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Anthropic key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'ElevenLabs key', pattern: /\bsk_[A-Za-z0-9]{32,}\b/ },
  { name: 'Stripe live key', pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'GitLab token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
];

const ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|client[_-]?secret|session[_-]?secret)\b\s*[:=]\s*['"`][^'"`\n]{16,}['"`]/i;

/** Unquoted `.env`-style assignments with a long value. */
const ENV_ASSIGNMENT_PATTERN =
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|APIKEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*=\s*[^\s#'"]{16,}/;

/** Files that intentionally carry fake values for tests and docs. */
const FIXTURE_FILE =
  /(^|\/)(test|tests|fixtures?|__fixtures__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.md$/i;

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const findings = [];
let scanned = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable tracked file
  }
  scanned += 1;
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const { name, pattern } of TOKEN_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ file, line: index + 1, name, sample: line.trim().slice(0, 120) });
      }
    }
    if (!FIXTURE_FILE.test(file) && ASSIGNMENT_PATTERN.test(line)) {
      findings.push({
        file,
        line: index + 1,
        name: 'secret-looking assignment',
        sample: line.trim().slice(0, 120),
      });
    }
    if (!FIXTURE_FILE.test(file) && ENV_ASSIGNMENT_PATTERN.test(line)) {
      findings.push({
        file,
        line: index + 1,
        name: 'env-style secret assignment',
        sample: line.trim().slice(0, 120),
      });
    }
  }
}

if (findings.length > 0) {
  console.error(`check-secrets: ${findings.length} finding(s) in ${scanned} files`);
  for (const finding of findings) {
    console.error(
      `  ${finding.file}:${finding.line} [${finding.name}] ${finding.sample}`,
    );
  }
  process.exit(1);
}

console.log(`check-secrets: no credentials found in ${scanned} tracked files`);
