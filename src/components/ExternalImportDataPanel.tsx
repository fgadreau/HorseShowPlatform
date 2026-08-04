import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { defaultAcceptedExternalImportKeys, type ExternalImportChangeType } from "../lib/externalImportProposal";
import type { Locale } from "../lib/i18n";
import { uiText } from "../features/dashboard/shared";

type ExternalImportDisplayRow<Key extends string> = {
  key: Key;
  label: string;
  current: string;
  official: string;
  changeType: ExternalImportChangeType;
};

function ExternalImportDataPanel<Key extends string>({
  locale,
  rows,
  sourceLabel,
  onApply,
  disabledKeys = [],
}: {
  locale: Locale;
  rows: ExternalImportDisplayRow<Key>[];
  sourceLabel: string;
  onApply: (keys: Key[]) => void;
  disabledKeys?: Key[];
}) {
  const disabledKeySet = new Set(disabledKeys);
  const [selectedKeys, setSelectedKeys] = useState<Set<Key>>(() => new Set(defaultAcceptedExternalImportKeys(rows).filter((key) => !disabledKeySet.has(key))));
  const rowSelectionSignature = `${rows.map((row) => `${row.key}:${row.current}:${row.official}`).join("|")}|disabled:${disabledKeys.join(",")}`;

  useEffect(() => {
    setSelectedKeys(new Set(defaultAcceptedExternalImportKeys(rows).filter((key) => !disabledKeySet.has(key))));
  }, [rowSelectionSignature]);

  function toggleKey(key: Key) {
    if (disabledKeySet.has(key)) return;
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="nrha-data-import-panel">
      <div className="inline-form-header">
        <strong>{uiText(locale, `Données ${sourceLabel} disponibles`, `Available ${sourceLabel} data`)}</strong>
        <span>{uiText(locale, "Les champs vides sont présélectionnés. Toute valeur existante à remplacer doit être cochée explicitement.", "Missing fields are preselected. Any existing value to replace must be checked explicitly.")}</span>
      </div>
      <div className="nrha-data-import-list">
        {rows.map((row) => (
          <div className="nrha-data-import-row" key={row.key}>
            <span>{row.label}</span>
            <strong>HSP: {row.current}</strong>
            <strong>{sourceLabel}: {row.official}</strong>
            <label className="nrha-data-import-choice">
              <input checked={selectedKeys.has(row.key)} disabled={disabledKeySet.has(row.key)} type="checkbox" onChange={() => toggleKey(row.key)} />
              {disabledKeySet.has(row.key)
                ? uiText(locale, "Champ protégé", "Protected field")
                : uiText(locale, `Utiliser ${sourceLabel}`, `Use ${sourceLabel}`)}
            </label>
          </div>
        ))}
      </div>
      <button className="ghost-button" disabled={!selectedKeys.size} type="button" onClick={() => onApply(Array.from(selectedKeys))}>
        <Plus size={18} />
        {uiText(locale, "Importer les champs sélectionnés", "Import selected fields")}
      </button>
    </div>
  );
}

export { ExternalImportDataPanel };
export type { ExternalImportDisplayRow };
