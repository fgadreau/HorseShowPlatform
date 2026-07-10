import type { NrhaRiderRankingListType } from "../types/domain";

export type ParsedNrhaRiderRankingRow = {
  earnings: number | null;
  rank: number;
  riderName: string;
  sourcePayload: Record<string, unknown>;
};

export type ParsedNrhaRiderRankingPdf = {
  listType: NrhaRiderRankingListType;
  rows: ParsedNrhaRiderRankingRow[];
  sourceFileName: string;
  sourceYear: number | null;
};

const moneyPattern = /^\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})$/;

export async function parseNrhaRiderRankingPdf(file: File, listType: NrhaRiderRankingListType): Promise<ParsedNrhaRiderRankingPdf> {
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("La liste NRHA doit être un PDF.");
  }

  const { getDocument } = await loadPdfTools();
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;

  try {
    const tokens: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        const text = "str" in item && typeof item.str === "string" ? item.str.trim() : "";

        if (text) {
          tokens.push(text);
        }
      }
    }

    const rows = parseRankingTokens(tokens);

    if (!rows.length) {
      throw new Error("Aucune ligne Rank / Name / Earnings trouvée dans ce PDF NRHA.");
    }

    return {
      listType,
      rows,
      sourceFileName: file.name,
      sourceYear: sourceYearFromText(file.name, tokens),
    };
  } finally {
    await pdf.destroy();
  }
}

function parseRankingTokens(tokens: string[]) {
  const rows: ParsedNrhaRiderRankingRow[] = [];

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const rankToken = tokens[index];
    const nameToken = tokens[index + 1];
    const earningsToken = tokens[index + 2];

    if (!/^\d{1,3}$/.test(rankToken) || !nameToken || !moneyPattern.test(earningsToken)) {
      continue;
    }

    const rank = Number(rankToken);
    const earnings = moneyValue(earningsToken);

    if (!Number.isInteger(rank) || rank <= 0) {
      continue;
    }

    rows.push({
      earnings,
      rank,
      riderName: nameToken,
      sourcePayload: {
        earningsText: earningsToken,
        tokenIndex: index,
      },
    });

    index += 2;
  }

  return dedupeRows(rows).sort((a, b) => a.rank - b.rank);
}

function dedupeRows(rows: ParsedNrhaRiderRankingRow[]) {
  const byRank = new Map<number, ParsedNrhaRiderRankingRow>();

  for (const row of rows) {
    if (!byRank.has(row.rank)) {
      byRank.set(row.rank, row);
    }
  }

  return [...byRank.values()];
}

function moneyValue(value: string) {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function sourceYearFromText(fileName: string, tokens: string[]) {
  const fileYear = yearFromValue(fileName);

  if (fileYear) {
    return fileYear;
  }

  return yearFromValue(tokens.join(" "));
}

function yearFromValue(value: string) {
  const match = value.match(/\b(20\d{2})\b/);
  const year = match ? Number(match[1]) : null;
  return year && Number.isInteger(year) ? year : null;
}

async function loadPdfTools() {
  const [pdfjs, pdfWorkerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;

  return {
    getDocument: pdfjs.getDocument,
  };
}
