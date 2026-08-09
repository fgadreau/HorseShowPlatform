import { Download, Printer } from "lucide-react";
import { formatCurrency } from "../../lib/display";
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
  const showClasses = classes.filter((classRecord) => classRecord.show_id === show.id);
  const showAddedMoney = showClasses.some((classRecord) => Number(classRecord.added_money) > 0);
  const showEntryFees = showClasses.some((classRecord) => Number(classRecord.entry_fee) > 0);
  const showJudgeFees = showClasses.some((classRecord) => Number(classRecord.judge_fee) > 0);
  const tableColumnCount = 2 + Number(showAddedMoney) + Number(showEntryFees) + Number(showJudgeFees);

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

  function printShowbill() {
    const source = document.querySelector<HTMLElement>(".showbill-print-root");
    const printWindow = window.open("", "_blank", "width=900,height=1200");

    if (!source || !printWindow) {
      window.alert(uiText(
        locale,
        "Autorise les fenêtres contextuelles pour imprimer le showbill.",
        "Allow pop-ups to print the showbill.",
      ));
      return;
    }

    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
    printWindow.document.close();
    printWindow.document.documentElement.lang = locale;
    printWindow.document.title = `${show.name} · Showbill`;
    printWindow.document.body.className = "showbill-print-document";
    printWindow.document.body.append(source.cloneNode(true));

    document.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
      printWindow.document.head.append(style.cloneNode(true));
    });

    const stylesheetLoads = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((stylesheet) => (
      new Promise<void>((resolve) => {
        const clone = printWindow.document.createElement("link");
        clone.rel = "stylesheet";
        clone.href = stylesheet.href;
        clone.addEventListener("load", () => resolve(), { once: true });
        clone.addEventListener("error", () => resolve(), { once: true });
        printWindow.document.head.append(clone);
      })
    ));

    void Promise.all(stylesheetLoads).then(() => {
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 150);
    });
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
          <button className="primary-button" type="button" onClick={printShowbill}>
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
          <strong>{showDateRange(show.start_date, show.end_date, locale)}</strong>
        </header>

        {sortedDays.map((day) => {
          const dayBlocks = sortScheduleBlocks(showBlocks.filter((block) => block.show_day_id === day.id));
          const arenas = groupBlocksByArena(dayBlocks);

          return (
            <section className="showbill-day" key={day.id}>
              <div className="showbill-day-heading">
                <h2>{day.day_name || uiText(locale, `Journée ${day.day_number ?? ""}`.trim(), `Day ${day.day_number ?? ""}`.trim())}</h2>
                <span>{formatShowbillDate(day.day_date, locale)}</span>
              </div>

              <div className="showbill-arena-grid">
                {arenas.map(({ arena, blocks: arenaBlocks }) => (
                  <section className="showbill-arena" key={arena}>
                    <h3>{arena === "__general__" ? uiText(locale, "Général", "General") : arena}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>{uiText(locale, "Classe / bloc", "Class / block")}</th>
                          <th>{uiText(locale, "Patron", "Pattern")}</th>
                          {showAddedMoney ? <th>{uiText(locale, "Added", "Added")}</th> : null}
                          {showEntryFees ? <th>{uiText(locale, "Inscr.", "Entry")}</th> : null}
                          {showJudgeFees ? <th>{uiText(locale, "Juges", "Judges")}</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {arenaBlocks.flatMap((block) => {
                          const blockClasses = showClasses
                            .filter((classRecord) => classRecord.block_id === block.id)
                            .sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name));
                          const heading = (
                            <tr className="showbill-block-row" key={`${block.id}-heading`}>
                              <th colSpan={tableColumnCount}>
                                <span>{block.display_label || block.name}</span>
                                <small>{classScheduleStartLabel(block, locale, showBlocks)}</small>
                              </th>
                            </tr>
                          );

                          if (!blockClasses.length) {
                            return [
                              <tr className="showbill-event-row" key={`${block.id}-event`}>
                                <td>
                                  <strong>{block.display_label || block.name}</strong>
                                  <small>{classScheduleStartLabel(block, locale, showBlocks)}</small>
                                </td>
                                <td>{block.pattern ? showScorePatternLabel(block.pattern) : "—"}</td>
                                {showAddedMoney ? <td>—</td> : null}
                                {showEntryFees ? <td>—</td> : null}
                                {showJudgeFees ? <td>—</td> : null}
                              </tr>,
                            ];
                          }

                          return [
                            heading,
                            ...blockClasses.map((classRecord) => (
                              <tr key={classRecord.id}>
                                <td>{[classRecord.code, classRecord.name].filter(Boolean).join(" · ")}</td>
                                <td>{block.pattern ? showScorePatternLabel(block.pattern) : "—"}</td>
                                {showAddedMoney ? <td>{moneyCell(classRecord.added_money, currency)}</td> : null}
                                {showEntryFees ? <td>{moneyCell(classRecord.entry_fee, currency)}</td> : null}
                                {showJudgeFees ? <td>{moneyCell(classRecord.judge_fee, currency)}</td> : null}
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
    const arena = block.arena?.trim() || "__general__";
    grouped.set(arena, [...(grouped.get(arena) ?? []), block]);
  }

  return Array.from(grouped, ([arena, arenaBlocks]) => ({ arena, blocks: arenaBlocks }));
}

function moneyCell(value: number | null | undefined, currency: string) {
  return value == null || value === 0 ? "—" : formatCurrency(value, currency);
}

function formatShowbillDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function showDateRange(startDate: string, endDate: string, locale: Locale) {
  return startDate === endDate
    ? formatShowbillDate(startDate, locale)
    : `${formatShowbillDate(startDate, locale)} – ${formatShowbillDate(endDate, locale)}`;
}

function safeFilename(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "showbill";
}

function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export { ShowbillExport };
