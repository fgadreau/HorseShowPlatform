import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { ViewIntro } from "../../components/ui";
import { buildNrhaResultsReport, serializeNrhaResultsCsv, type NrhaReportData } from "../../lib/nrhaResultsCsv";
import type { Locale } from "../../lib/i18n";
import "./reports.css";

export function ReportsView({ data, locale }: { data: NrhaReportData; locale: Locale }) {
  const text = (fr: string, en: string) => locale === "fr" ? fr : en;
  const [showId, setShowId] = useState("");
  const [slateId, setSlateId] = useState("");
  const [fallbackShowNumber, setFallbackShowNumber] = useState("");
  const [usdPerCad, setUsdPerCad] = useState("");
  const [goType, setGoType] = useState("1");
  const [goNum, setGoNum] = useState("1");
  const options = useMemo(() => ({ showId, slateId, fallbackShowNumber, usdPerCad, goType, goNum }), [showId, slateId, fallbackShowNumber, usdPerCad, goType, goNum]);
  const report = useMemo(() => buildNrhaResultsReport(data, options), [data, options]);
  const ready = showId && usdPerCad && !report.errors.length && report.rows.length > 0;

  function download() {
    if (!ready) return;
    const url = URL.createObjectURL(new Blob([serializeNrhaResultsCsv(report.rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const number = [...new Set(report.rows.map((row) => row.ShowNum))];
    link.download = number.length === 1 ? `${number[0]}.csv` : `NRHA-${showId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="stack reports-view">
    <ViewIntro eyebrow={data.organization.name} title={text("Rapports", "Reports")} description={text("Générez les rapports de l’association à partir des résultats publiés.", "Generate association reports from published results.")} />
    <section className="panel">
      <div className="panel-header"><h2>{text("Résultats NRHA — CSV", "NRHA results — CSV")}</h2></div>
      <p>{text("Seules les classes avec un numéro de classe NRHA sont incluses. Le fichier reprend les 17 colonnes du modèle fourni, séparées par des points-virgules.", "Only classes with an NRHA class number are included. The file uses the supplied template’s 17 semicolon-separated columns.")}</p>
      <div className="reports-fields">
        <label>{text("Concours", "Show")}<select value={showId} onChange={(event) => { setShowId(event.target.value); setSlateId(""); setFallbackShowNumber(""); }}><option value="">{text("Sélectionner un concours", "Select a show")}</option>{data.shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label>
        <label>{text("Slate", "Slate")}<select value={slateId} onChange={(event) => setSlateId(event.target.value)} disabled={!showId}><option value="">{text("Toutes les slates", "All slates")}</option>{data.slates.filter((slate) => slate.show_id === showId).map((slate) => <option key={slate.id} value={slate.id}>{slate.name}{slate.technical_number ? ` — ${slate.technical_number}` : ""}</option>)}</select></label>
        <label>{text("Numéro de concours NRHA de remplacement", "Fallback NRHA show number")}<input inputMode="numeric" value={fallbackShowNumber} onChange={(event) => setFallbackShowNumber(event.target.value)} /><small>{text("Utilisé seulement si la slate n’a pas de numéro technique.", "Used only when the slate has no technical number.")}</small></label>
        <label>{text("Taux de change : 1 CAD = X USD", "Exchange rate: 1 CAD = X USD")}<input inputMode="decimal" placeholder="0.730000" value={usdPerCad} onChange={(event) => setUsdPerCad(event.target.value)} /><small>{text("Exemple : au taux de 0,73, un gain de 100 CAD donne 73,00 USD.", "Example: at a rate of 0.73, CAD 100 becomes USD 73.00.")}</small></label>
        <label>GoType<input inputMode="numeric" value={goType} onChange={(event) => setGoType(event.target.value)} /></label>
        <label>GoNum<input inputMode="numeric" value={goNum} onChange={(event) => setGoNum(event.target.value)} /></label>
      </div>
      <p>{text("Les gains dans l’application restent en CAD. Chaque gain du CSV est converti en USD et arrondi au cent. GoType et GoNum valent 1 dans le modèle ; ajustez-les au besoin.", "Application winnings stay in CAD. Each CSV award is converted to USD and rounded to cents. GoType and GoNum are 1 in the template; adjust as needed.")}</p>
      {showId && usdPerCad && report.errors.length > 0 ? <div role="alert" className="inline-alert"><div><strong>{text("À compléter avant l’export", "Complete before exporting")}</strong><ul>{report.errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div> : null}
      {ready ? <div aria-live="polite">
        <p>{report.classCount} {text("classes", "classes")} · {report.rows.length} {text("performances", "performances")} · {report.totalCad.toFixed(2)} CAD → {report.totalUsd} USD</p>
        <div className="reports-preview"><table><caption>{text("Aperçu — 20 premières lignes", "Preview — first 20 rows")}</caption><thead><tr>{["ShowNum", "ClassCode", "Horse", "Member", "PlaceNum", "TotalScore", "MoneyWon (USD)"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{report.rows.slice(0, 20).map((row, index) => <tr key={index}><td>{row.ShowNum}</td><td>{row.ClassCode}</td><td>{row.Horse}</td><td>{row.Member}</td><td>{row.PlaceNum}</td><td>{row.TotalScore}</td><td>{row.MoneyWon}</td></tr>)}</tbody></table></div>
      </div> : null}
      <button type="button" className="primary-button" disabled={!ready} onClick={download}><Download size={16} />{text("Télécharger le CSV NRHA en USD", "Download NRHA CSV in USD")}</button>
    </section>
  </div>;
}
