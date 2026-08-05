const mode = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
const expectedRef = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
const productionRef = String(process.env.PRODUCTION_SUPABASE_PROJECT_REF || "").trim();

if (!['production', 'rehearsal'].includes(mode)) {
  throw new Error('Usage: node scripts/assert-database-target.mjs production|rehearsal');
}
if (!databaseUrl || !expectedRef || !productionRef) {
  throw new Error('DATABASE_URL, EXPECTED_SUPABASE_PROJECT_REF and PRODUCTION_SUPABASE_PROJECT_REF are required.');
}

const parsed = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  throw new Error('DATABASE_URL must use the postgres or postgresql protocol.');
}

const fingerprint = `${decodeURIComponent(parsed.username)} ${parsed.hostname}`.toLowerCase();
const hasExpectedRef = fingerprint.includes(expectedRef.toLowerCase());
const hasProductionRef = fingerprint.includes(productionRef.toLowerCase());

if (!hasExpectedRef) {
  throw new Error('The database connection does not match EXPECTED_SUPABASE_PROJECT_REF.');
}
if (mode === 'production' && expectedRef !== productionRef) {
  throw new Error('A production dry-run must target the configured production project ref.');
}
if (mode === 'rehearsal' && (expectedRef === productionRef || hasProductionRef)) {
  throw new Error('The rehearsal refuses every connection that matches the production project ref.');
}

console.log(`Database target accepted for ${mode}; credentials were not printed.`);
