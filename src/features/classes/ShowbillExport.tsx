import { Download, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Block, ClassRecord, Organization, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { classScheduleStartLabel, sortScheduleBlocks } from "./classUtils";
import { showScorePatternLabel } from "./showScorePatterns";

type ShowbillExportProps = {
  blocks: Block[];
  classes: ClassRecord[];
  locale: Locale;
  organization: Organization | null;
  show: Show;
  showDays: ShowDay[];
};

function ShowbillExport({ blocks, classes, locale, organization, show, showDays }: ShowbillExportProps) {
  const showBlocks = blocks.filter((block) => block.show_id === show.id);
  const sortedDays = [...showDays]
    .filter((day) => day.show_id === show.id)
    .sort((first, second) => first.sort_order - second.sort_order || first.day_date.localeCompare(second.day_date));
  const currency = show.default_currency || "CAD";

  function downloadGoogleSheetsCsv() {
    const headers = [
      uiText(locale, "Date", "Date"),
      uiText(locale, "Journée", "Day"),
      uiText(locale, "Arène", "Arena"),
      uiText(locale, "Départ", "Start"),
      uiText(locale, "Bloc", "Block"),
      uiText(locale, "Libellé", "Label"),
      uiText(locale, "Code classe", "Class code"),
      uiText(locale, "Classe", "Class"),
      uiText(locale, "Patron", "Pattern"),
      uiText(locale, "Added money", "Added money"),
      uiText(locale, "Frais inscription", "Entry fee"),
      uiText(locale, "Frais juges", "Judges fee"),
      uiText(locale, "Notes", "Notes"),
    ];
    const rows: Array<Array<string | number | null>> = [headers];

    for (const day of sortedDays) {
      const dayBlocks = sortScheduleBlocks(showBlocks.filter((block) => block.show_day_id === day.id));

      for (const block of dayBlocks) {
        const blockClasses = classes
          .filter((classRecord) => classRecord.block_id === block.id)
          .sort((first, second) => first.sort_order - second.sort_order || (first.code ?? "").localeCompare(second.code ?? "") || first.name.localeCompare(second.name));
        const common = [
          day.day_date,
          day.day_name || day.day_number || "",
          block.arena || "",
          classScheduleStartLabel(block, locale, showBlocks),
          block.name,
          block.display_label || "",
        ];

        if (!blockClasses.length) {
          rows.push([...common, "", "", block.pattern || "", "", "", "", block.notes || ""]);
          continue;
        }

        for (const classRecord of blockClasses) {
          rows.push([
            ...common,
            classRecord.code || "",
            classRecord.name,
            block.pattern || "",
            classRecord.added_money || "",
            classRecord.entry_fee,
            classRecord.judge_fee,
            classRecord.notes || "",
          ]);
        }
      }
    }

    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(show.name)}-showbill.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="showbill-export-shell">
      <div className="showbill-toolbar">
        <p>{uiText(locale, "Le CSV s'importe directement dans Google Sheets et conserve une ligne par classe.", "The CSV imports directly into Google Sheets and keeps one row per class.")}</p>
        <div className="row-actions">
          <button className="ghost-button" type="button" onClick={downloadGoogleSheetsCsv}>
            <Download size={17} />
            {uiText(locale, "CSV Google Sheets", "Google Sheets CSV")}
          </button>
          <button className="primary-button" type="button" onClick={() => window.print()}>
            <Printer size={17} />
            {uiText(locale, "Imprimer / PDF", "Print / PDF")}
          </button>
        </div>
      </div>

      <article className="showbill-print-root">
        <header className="showbill-title">
          <span>{uiText(locale, "HORAIRE · SHOWBILL", "SCHEDULE · SHOWBILL")}</span>
          <h1>{show.name}</h1>
          <p>{[organization?.name, show.venue, show.location].filter(Boolean).join(" · ")}</p>
          <strong>{showDateRange(show.start_date, show.end_date)}</strong>
        </header>

        {sortedDays.map((day) => {
          const dayBlocks = sortScheduleBlocks(showBlocks.filter((block) => block.show_day_id === day.id));
          const arenas = groupBlocksByArena(dayBlocks);

          return (
            <section className="showbill-day" key={day.id}>
              <div className="showbill-day-heading">
                <h2>{day.day_name || uiText(locale, `Journée ${day.day_number ?? ""}`.trim(), `Day ${day.day_number ?? ""}`.trim())}</h2>
                <span>{formatDate(day.day_date)}</span>
              </div>

              <div className="showbill-arena-grid">
                {arenas.map(({ arena, blocks: arenaBlocks }) => (
                  <section className="showbill-arena" key={arena}>
                    <h3>{arena === "__no_arena__" ? uiText(locale, "Arène à préciser", "Arena to confirm") : arena}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>{uiText(locale, "Classe / bloc", "Class / block")}</th>
                          <th>{uiText(locale, "Patron", "Pattern")}</th>
                          <th>{uiText(locale, "Added", "Added")}</th>
                          <th>{uiText(locale, "Inscr.", "Entry")}</th>
                          <th>{uiText(locale, "Juges", "Judges")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arenaBlocks.flatMap((block) => {
                          const blockClasses = classes
                            .filter((classRecord) => classRecord.block_id === block.id)
                            .sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name));
                          const heading = (
                            <tr className="showbill-block-row" key={`${block.id}-heading`}>
                              <th colSpan={5}>
                                <span>{block.display_label || block.name}</span>
                                <small>{classScheduleStartLabel(block, locale, showBlocks)}</small>
                              </th>
                            </tr>
                          );

                          if (!blockClasses.length) {
                            return [
                              heading,
                              <tr key={`${block.id}-event`}>
                                <td>{block.name}</td>
                                <td>{block.pattern ? showScorePatternLabel(block.pattern) : "—"}</td>
                                <td>—</td><td>—</td><td>—</td>
                              </tr>,
                            ];
                          }

                          return [
                            heading,
                            ...blockClasses.map((classRecord) => (
                              <tr key={classRecord.id}>
                                <td>{[classRecord.code, classRecord.name].filter(Boolean).join(" · ")}</td>
                                <td>{block.pattern ? showScorePatternLabel(block.pattern) : "—"}</td>
                                <td>{moneyCell(classRecord.added_money, currency)}</td>
                                <td>{moneyCell(classRecord.entry_fee, currency)}</td>
                                <td>{moneyCell(classRecord.judge_fee, currency)}</td>
                              </tr>
                            )),
                          ];
                        })}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            </section>
          );
        })}
      </article>
    </div>
  );
}

function groupBlocksByArena(blocks: Block[]) {
  const grouped = new Map<string, Block[]>();

  for (const block of blocks) {
    const arena = block.arena?.trim() || "__no_arena__";
    grouped.set(arena, [...(grouped.get(arena) ?? []), block]);
  }

  return Array.from(grouped, ([arena, arenaBlocks]) => ({ arena, blocks: arenaBlocks }));
}

function moneyCell(value: number | null | undefined, currency: string) {
  return value == null || value === 0 ? "—" : formatCurrency(value, currency);
}

function showDateRange(startDate: string, endDate: string) {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function safeFilename(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "showbill";
}

function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export { ShowbillExport };
