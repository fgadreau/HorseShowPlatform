import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import { updateBlockTemplate } from "../../services/supabaseServices";
import type { BlockTemplate } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { showScorePatternSelectValue } from "./showScorePatterns";

function BlockTemplateEditForm({
  locale = "fr",
  blockTemplate,
  onCancel,
  onUpdateBlockTemplate,
}: {
  locale?: Locale;
  blockTemplate: BlockTemplate;
  onCancel: () => void;
  onUpdateBlockTemplate: (id: string, input: Parameters<typeof updateBlockTemplate>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(blockTemplate.name);
  const [code, setCode] = useState(blockTemplate.code ?? "");
  const [blockLabel, setBlockLabel] = useState(blockTemplate.block_label ?? "");
  const [category, setCategory] = useState(blockTemplate.category ?? "");
  const [pattern, setPattern] = useState(showScorePatternSelectValue(blockTemplate.pattern));
  const [notes, setNotes] = useState(blockTemplate.notes ?? "");
  const [isActive, setIsActive] = useState(blockTemplate.is_active);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateBlockTemplate(blockTemplate.id, {
        name,
        code: code || null,
        block_label: blockLabel || null,
        category: category || null,
        pattern: showScorePatternSelectValue(pattern) || null,
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
          <p>{blockTemplate.name}</p>
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

export { BlockTemplateEditForm };
