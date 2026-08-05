import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseRef = process.argv[2] || "origin/main";
const headRef = process.argv[3] || "HEAD";
const migrationDirectory = "supabase/migrations/";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

git("merge-base", "--is-ancestor", baseRef, headRef);

const changes = git("diff", "--name-status", `${baseRef}...${headRef}`, "--", migrationDirectory)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split("\t");
    return { path: paths.at(-1), status };
  });

const rewritten = changes.filter(({ status }) => status !== "A");
if (rewritten.length > 0) {
  console.error("Existing migration history must remain immutable:");
  for (const change of rewritten) console.error(`- ${change.status} ${change.path}`);
  process.exit(1);
}

const added = changes.map(({ path }) => path);
const truncating = [];
const destructive = [];
const destructivePattern = /\b(?:drop\s+(?:table|column|schema|type|view)|delete\s+from)\b/i;

for (const path of added) {
  const sql = readFileSync(path, "utf8");
  if (/\btruncate\s+table\b/i.test(sql)) truncating.push(path);
  if (destructivePattern.test(sql)) destructive.push(path);
}

if (truncating.length > 0) {
  console.error("TRUNCATE TABLE is forbidden in the production promotion chain:");
  for (const path of truncating) console.error(`- ${path}`);
  process.exit(1);
}

console.log(`${added.length} new migration(s); existing history is immutable; no TRUNCATE TABLE found.`);
if (destructive.length > 0) {
  console.log("Migrations requiring backup/clone rehearsal because they contain destructive DDL or data cleanup:");
  for (const path of destructive) console.log(`- ${path}`);
}
