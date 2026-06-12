import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../../components/ui";
import { numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateClassTemplate } from "../../services/supabaseServices";
import type { BackNumberPolicy, ClassTemplate, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { defaultBackNumberPolicy, eligibilityRulesFromNotes, eligibilityNotesFromRules } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { showScorePatternSelectValue } from "./showScorePatterns";

function ClassTemplateEditForm({
  locale = "fr",
  classTemplate,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplate,
}: {
  locale?: Locale;
  classTemplate: ClassTemplate;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(classTemplate.name);
  const [code, setCode] = useState(classTemplate.code ?? "");
  const [blockLabel, setBlockLabel] = useState(classTemplate.block_label ?? "");
  const [category, setCategory] = useState(classTemplate.category ?? "");
  const [pattern, setPattern] = useState(showScorePatternSelectValue(classTemplate.default_pattern));
  const [entryFee, setEntryFee] = useState(classTemplate.default_entry_fee == null ? "" : String(classTemplate.default_entry_fee));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classTemplate.sanctioning_body_codes ?? []);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(classTemplate.back_number_policy ?? "horse");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classTemplate.eligibility_rules));
  const [notes, setNotes] = useState(classTemplate.notes ?? "");
  const [isActive, setIsActive] = useState(classTemplate.is_active);
  const [busy, setBusy] = useState(false);

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateClassTemplate(classTemplate.id, {
        name,
        code: code || null,
        block_label: blockLabel || null,
        category: category || null,
        default_pattern: showScorePatternSelectValue(pattern) || null,
        default_entry_fee: numericValue(entryFee) ?? null,
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
        notes: notes || null,
        is_active: isActive,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel span-2">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier le bloc récurrent", "Edit recurring block")}</h2>
          <p>{classTemplate.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Catégorie du bloc", "Block category")}
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <ShowScorePatternSelect locale={locale} value={pattern} onChange={setPattern} />
          </label>
        </div>
        <label>
          {uiText(locale, "Frais par défaut", "Default fee")}
          <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          label={uiText(locale, "Sanctions par défaut du bloc", "Default block sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label className="check-row">
          <input checked={isActive} type="checkbox" onChange={(event) => setIsActive(event.target.checked)} />
          <span>{uiText(locale, "Bloc récurrent actif", "Active recurring block")}</span>
        </label>
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { ClassTemplateEditForm };
