import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { aggregateCapacityReports } from "./capacity/aggregate.mjs";

const inputDirectory = process.argv[2] || ".tmp/capacity-shards";
const outputDirectory = process.argv[3] || ".tmp/capacity-aggregate";
const reportPaths = (await findJsonFiles(inputDirectory))
  .filter((filePath) => !filePath.includes("capacity-aggregate"));
const reports = await Promise.all(
  reportPaths.map(async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"))),
);
const report = aggregateCapacityReports(reports);

await fs.mkdir(outputDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(outputDirectory, `showscore-capacity-distributed-${stamp}.json`);
const markdownPath = path.join(outputDirectory, `showscore-capacity-distributed-${stamp}.md`);
await Promise.all([
  fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  fs.writeFile(markdownPath, markdownReport(report), "utf8"),
]);

for (const item of report.checks) {
  console.log(`${item.passed ? "OK" : "ÉCHEC"} — ${item.name}: ${item.actual} (limite ${item.limit})`);
}
console.log(`Rapports agrégés: ${jsonPath} et ${markdownPath}`);
if (!report.passed) process.exitCode = 1;

async function findJsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  }));
  return nested.flat();
}

function markdownReport(activeReport) {
  const lines = [
    "# Rapport de capacité ShowScore distribué",
    "",
    `- Résultat: **${activeReport.passed ? "RÉUSSI" : "ÉCHEC"}**`,
    `- Vues: ${activeReport.profile.viewers.total} (${activeReport.profile.viewers.tv} TV, ${activeReport.profile.viewers.mobile} mobiles, ${activeReport.profile.viewers.obs} OBS)`,
    `- Runners: ${activeReport.shards.length}`,
    `- Producteur live: ${activeReport.writer.mutations.length} mutations`,
    "",
    "| Vérification | Mesure | Limite | Résultat |",
    "| --- | ---: | ---: | --- |",
    ...activeReport.checks.map((item) => `| ${item.name} | ${item.actual} | ${item.limit} | ${item.passed ? "OK" : "ÉCHEC"} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
