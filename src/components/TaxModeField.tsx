export function TaxModeField({ value, onChange, locale, disabled = false }: {
  value: string; onChange: (value: "exclusive" | "inclusive" | "") => void; locale: string; disabled?: boolean;
}) {
  const fr = locale === "fr";
  return <label>{fr ? "Le montant saisi est…" : "The entered amount is…"}<select required value={value} disabled={disabled} onChange={event => onChange(event.target.value as "exclusive" | "inclusive" | "")}>
    <option value="">{fr ? "Choisir le traitement des taxes" : "Choose tax treatment"}</option>
    <option value="exclusive">{fr ? "Avant taxes" : "Before taxes"}</option>
    <option value="inclusive">{fr ? "Taxes incluses" : "Tax included"}</option>
  </select><small>{fr ? "Les prix unitaires taxes incluses sont convertis avant taxes, puis les taxes sont calculées par ligne." : "Tax-inclusive unit prices are converted before tax; taxes are then calculated per line."}</small></label>;
}
