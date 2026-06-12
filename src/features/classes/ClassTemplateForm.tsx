import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { createClassTemplate } from "../../services/supabaseServices";
import { numericValue } from "../../lib/display";
import type { BackNumberPolicy, Organization, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { defaultBackNumberPolicy, eligibilityRulesFromNotes } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { showScorePatternSelectValue } from "./showScorePatterns";

function ClassTemplateForm({
  locale = "fr",
  organization,
  sanctioningBodies,
  onCreateClassTemplate,
  onCreated,
}: {
  locale?: Locale;
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [blockLabel, setBlockLabel] = useState("");
  const [category, setCategory] = useState("");
  const [pattern, setPattern] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>([]);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>("horse");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClassTemplate({
        organization_id: organization.id,
        name,
        code,
        block_label: blockLabel,
        category,
        default_pattern: showScorePatternSelectValue(pattern),
        default_entry_fee: numericValue(entryFee),
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
        notes,
      });
      setName("");
      setCode("");
      setBlockLabel("");
      setCategory("");
      setPattern("");
      setEntryFee("");
      setSanctioningBodyCodes([]);
      setBackNumberPolicy("horse");
      setEligibilityNotes("");
      setNotes("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouveau bloc récurrent", "New recurring block")}</h2>
          <p>{uiText(locale, "Catalogue régulier de l'association.", "Reusable association catalog.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input disabled={!organization} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Catégorie du bloc", "Block category")}
            <input disabled={!organization} value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input disabled={!organization} value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <ShowScorePatternSelect disabled={!organization} locale={locale} value={pattern} onChange={setPattern} />
          </label>
        </div>
        <label>
          {uiText(locale, "Frais par défaut", "Default fee")}
          <input disabled={!organization} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          disabled={!organization}
          label={uiText(locale, "Sanctions par défaut du bloc", "Default block sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea disabled={!organization} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          Notes
          <textarea disabled={!organization} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer le bloc récurrent", "Create recurring block")}
        </button>
      </form>
    </section>
  );
}

export { ClassTemplateForm };
