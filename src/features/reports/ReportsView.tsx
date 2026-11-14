import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { ViewIntro } from "../../components/ui";
import { buildNrhaResultsReport, serializeNrhaResultsCsv, type NrhaReportData, type NrhaResultsReport } from "../../lib/nrhaResultsCsv";
import type { Locale } from "../../lib/i18n";
import "./reports.css";

export function ReportsView({ data, locale }: { data: NrhaReportData; locale: Locale }) {
  const text = (fr: string, en: string) => locale === "fr" ? fr : en;
  const [showId, setShowId] = useState("");
  const [slateId, setSlateId] = useState("");
  const [fallbackShowNumber, setFallbackShowNumber] = useState("");
  const [usdPerSource, setUsdPerSource] = useState("");
  const [goType, setGoType] = useState("1");
  const [goNum, setGoNum] = useState("1");
  const selectedShow = data.shows.find((show) => show.id === showId);
  const sourceCurrency = selectedShow?.default_currency?.trim().toUpperCase() || data.organization.currency?.trim().toUpperCase() || "CAD";
  const needsUsdConversion = Boolean(showId) && sourceCurrency !== "USD";
  const commonOptions = useMemo(() => ({ showId, slateId, fallbackShowNumber, goType, goNum }), [showId, slateId, fallbackShowNumber, goType, goNum]);
  const sourceReport = useMemo(() => buildNrhaResultsReport(data, { ...commonOptions, moneyMode: "source_currency" }), [data, commonOptions]);
  const convertedReport = useMemo(() => buildNrhaResultsReport(data, { ...commonOptions, moneyMode: "convert_to_usd", usdPerSource }), [data, commonOptions, usdPerSource]);
  const sourceReady = Boolean(showId) && !sourceReport.errors.length && sourceReport.rows.length > 0;
  const convertedReady = needsUsdConversion && Boolean(usdPerSource) && !convertedReport.errors.length && convertedReport.rows.length > 0;

  function download(report: NrhaResultsReport, withoutConversion: boolean) {
    const ready = withoutConversion ? sourceReady : convertedReady;
    if (!ready) return;
    const url = URL.createObjectURL(new Blob([serializeNrhaResultsCsv(report.rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const numbers = [...new Set(report.rows.map((row) => row.ShowNum))];
    const baseName = numbers.length === 1 ? numbers[0] : `NRHA-${showId}`;
    link.download = withoutConversion && report.outputCurrency !== "USD" ? `${baseName}-sans-conversion-${report.outputCurrency}.csv` : `${baseName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sharedErrors = showId ? sourceReport.errors : [];
  const conversionErrors = usdPerSource
    ? convertedReport.errors.filter((error) => !sharedErrors.includes(error))
    : [];

  return <div className="stack reports-view">
    <ViewIntro eyebrow={data.organization.name} title={text("Rapports", "Reports")} description={text("Générez les rapports de l’association à partir des résultats publiés.", "Generate association reports from published results.")} />
    <section className="panel">
      <div className="panel-header"><h2>{text("Résultats NRHA — CSV", "NRHA results — CSV")}</h2></div>
      <p>{text("Seules les classes avec un numéro de classe NRHA sont incluses. Le fichier reprend les 17 colonnes du modèle fourni, séparées par des points-virgules.", "Only classes with an NRHA class number are included. The file uses the supplied template’s 17 semicolon-separated columns.")}</p>
      <div className="reports-fields">
        <label>{text("Concours", "Show")}<select value={showId} onChange={(event) => { setShowId(event.target.value); setSlateId(""); setFallbackShowNumber(""); setUsdPerSource(""); }}><option value="">{text("Sélectionner un concours", "Select a show")}</option>{data.shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label>
        <label>{text("Slate", "Slate")}<select value={slateId} onChange={(event) => setSlateId(event.target.value)} disabled={!showId}><option value="">{text("Toutes les slates", "All slates")}</option>{data.slates.filter((slate) => slate.show_id === showId).map((slate) => <option key={slate.id} value={slate.id}>{slate.name}{slate.technical_number ? ` — ${slate.technical_number}` : ""}</option>)}</select></label>
        <label>{text("Numéro de concours NRHA de remplacement", "Fallback NRHA show number")}<input inputMode="numeric" value={fallbackShowNumber} onChange={(event) => setFallbackShowNumber(event.target.value)} /><small>{text("Utilisé seulement si la slate n’a pas de numéro technique.", "Used only when the slate has no technical number.")}</small></label>
        {needsUsdConversion ? <label>{text(`Taux de change : 1 ${sourceCurrency} = X USD`, `Exchange rate: 1 ${sourceCurrency} = X USD`)}<input aria-label={text("Taux de change", "Exchange rate")} inputMode="decimal" placeholder="0.730000" value={usdPerSource} onChange={(event) => setUsdPerSource(event.target.value)} /><small>{text(`Exemple : au taux de 0,73, un gain de 100 ${sourceCurrency} donne 73,00 USD.`, `Example: at a rate of 0.73, a ${sourceCurrency} 100 award becomes USD 73.00.`)}</small></label> : null}
        <label>GoType<input inputMode="numeric" value={goType} onChange={(event) => setGoType(event.target.value)} /></label>
        <label>GoNum<input inputMode="numeric" value={goNum} onChange={(event) => setGoNum(event.target.value)} /></label>
      </div>
      <p>{needsUsdConversion
        ? text(`Les gains dans HSP restent en ${sourceCurrency}. Le premier rapport les convertit en USD; le second conserve les montants en ${sourceCurrency}.`, `Awards in HSP remain in ${sourceCurrency}. The first report converts them to USD; the second keeps the ${sourceCurrency} amounts.`)
        : text("Les gains sont déjà en USD : aucun taux de change n’est demandé ni appliqué.", "Awards are already in USD: no exchange rate is requested or applied.")}</p>
      <p>{text("GoType et GoNum valent 1 dans le modèle; ajustez-les au besoin.", "GoType and GoNum are 1 in the template; adjust them as needed.")}</p>
      {sharedErrors.length ? <div role="alert" className="inline-alert"><div><strong>{text("À compléter avant l’export", "Complete before exporting")}</strong><ul>{sharedErrors.map((error) => <li key={error}>{error}</li>)}</ul></div></div> : null}
      {conversionErrors.length ? <div role="alert" className="inline-alert"><div><strong>{text("Taux de change à corriger", "Exchange rate to correct")}</strong><ul>{conversionErrors.map((error) => <li key={error}>{error}</li>)}</ul></div></div> : null}

      {showId ? <div className="reports-export-grid">
        {needsUsdConversion ? <article className="reports-export-card">
          <div><h3>{text("Rapport NRHA avec taux de change", "NRHA report with exchange rate")}</h3><p>{text(`La colonne MoneyWon est convertie de ${sourceCurrency} vers USD.`, `The MoneyWon column is converted from ${sourceCurrency} to USD.`)}</p></div>
          {convertedReady ? <strong>{convertedReport.classCount} {text("classes", "classes")} · {convertedReport.rows.length} {text("performances", "performances")} · {convertedReport.totalSource.toFixed(2)} {sourceCurrency} → {convertedReport.totalOutput} USD</strong> : null}
          <button type="button" className="primary-button" disabled={!convertedReady} onClick={() => download(convertedReport, false)}><Download size={16} />{text("Télécharger avec conversion en USD", "Download with USD conversion")}</button>
        </article> : null}
        <article className="reports-export-card">
          <div><h3>{sourceCurrency === "USD" ? text("Rapport NRHA en USD", "NRHA report in USD") : text("Rapport NRHA sans taux de change", "NRHA report without exchange rate")}</h3><p>{sourceCurrency === "USD" ? text("La colonne MoneyWon conserve les montants USD publiés.", "The MoneyWon column keeps the published USD amounts.") : text(`La colonne MoneyWon conserve exactement les montants en ${sourceCurrency}.`, `The MoneyWon column keeps the ${sourceCurrency} amounts exactly.`)}</p></div>
          {sourceReady ? <strong>{sourceReport.classCount} {text("classes", "classes")} · {sourceReport.rows.length} {text("performances", "performances")} · {sourceReport.totalOutput} {sourceCurrency}</strong> : null}
          <button type="button" className="secondary-button" disabled={!sourceReady} onClick={() => download(sourceReport, true)}><Download size={16} />{sourceCurrency === "USD" ? text("Télécharger le CSV NRHA en USD", "Download NRHA CSV in USD") : text(`Télécharger sans conversion (${sourceCurrency})`, `Download without conversion (${sourceCurrency})`)}</button>
        </article>
      </div> : null}

      {sourceReady ? <div aria-live="polite" className="reports-preview"><table><caption>{text("Aperçu — 20 premières lignes", "Preview — first 20 rows")}</caption><thead><tr>{["ShowNum", "ClassCode", "Horse", "Member", "PlaceNum", "TotalScore", `MoneyWon (${sourceCurrency})`, ...(convertedReady ? ["MoneyWon (USD)"] : [])].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{sourceReport.rows.slice(0, 20).map((row, index) => <tr key={index}><td>{row.ShowNum}</td><td>{row.ClassCode}</td><td>{row.Horse}</td><td>{row.Member}</td><td>{row.PlaceNum}</td><td>{row.TotalScore}</td><td>{row.MoneyWon}</td>{convertedReady ? <td>{convertedReport.rows[index]?.MoneyWon ?? ""}</td> : null}</tr>)}</tbody></table></div> : null}
    </section>
  </div>;
}
