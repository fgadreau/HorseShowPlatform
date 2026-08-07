import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { createBlockTemplate } from "../../services/supabaseServices";
import type { Organization } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { showScorePatternSelectValue } from "./showScorePatterns";

function BlockTemplateForm({
  locale = "fr",
  organization,
  onCreateBlockTemplate,
  onCreated,
}: {
  locale?: Locale;
  organization: Organization | null;
  onCreateBlockTemplate: (input: Parameters<typeof createBlockTemplate>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [blockLabel, setBlockLabel] = useState("");
  const [category, setCategory] = useState("");
  const [pattern, setPattern] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateBlockTemplate({
        organization_id: organization.id,
        name,
        code,
        block_label: blockLabel,
        category,
        pattern: showScorePatternSelectValue(pattern),
        notes,
      });
      setName("");
      setCode("");
      setBlockLabel("");
      setCategory("");
      setPattern("");
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

export { BlockTemplateForm };
