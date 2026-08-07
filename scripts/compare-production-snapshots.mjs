import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  throw new Error('Usage: node scripts/compare-production-snapshots.mjs before.json after.json');
}

const before = JSON.parse(readFileSync(beforePath, 'utf8').trim());
const after = JSON.parse(readFileSync(afterPath, 'utf8').trim());

if (before.schema_contract !== 'legacy') {
  throw new Error(`Expected a legacy snapshot before migration, got ${before.schema_contract}.`);
}
if (after.schema_contract !== 'canonical') {
  throw new Error(`Expected a canonical snapshot after migration, got ${after.schema_contract}.`);
}

const failures = [];
for (const [name, expected] of Object.entries(before.invariants || {})) {
  const actual = after.invariants?.[name];
  if (!isDeepStrictEqual(actual, expected)) failures.push({ actual, expected, name });
}

const observationChanges = [];
for (const [name, expected] of Object.entries(before.observations || {})) {
  const actual = after.observations?.[name];
  if (!isDeepStrictEqual(actual, expected)) observationChanges.push({ actual, expected, name });
}

const lines = [
  '# Production data rehearsal',
  '',
  failures.length === 0
    ? '✅ All core row counts and identifier hashes were preserved.'
    : `❌ ${failures.length} core invariant(s) changed.`,
  '',
];

for (const failure of failures) {
  lines.push(`- **${failure.name}**: before \`${JSON.stringify(failure.expected)}\`, after \`${JSON.stringify(failure.actual)}\``);
}
if (observationChanges.length > 0) {
  lines.push('', '## Financial observations requiring review', '');
  for (const change of observationChanges) {
    lines.push(`- **${change.name}**: before \`${change.expected}\`, after \`${change.actual}\``);
  }
}

const report = `${lines.join('\n')}\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
if (failures.length > 0) process.exit(1);
