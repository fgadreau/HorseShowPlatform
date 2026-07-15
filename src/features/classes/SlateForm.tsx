import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import { createSlate, updateSlate } from "../../services/supabaseServices";
import type { Organization, SanctioningBody, Show, Slate } from "../../types/domain";
import { uiText } from "../dashboard/shared";

function SlateForm({
  locale = "fr",
  organization,
  sanctioningBodies,
  show,
  slate,
  onCancel,
  onCreateSlate,
  onUpdateSlate,
}: {
  locale?: Locale;
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  show: Show | null;
  slate?: Slate | null;
  onCancel: () => void;
  onCreateSlate: (input: Parameters<typeof createSlate>[0]) => Promise<void>;
  onUpdateSlate: (id: string, input: Parameters<typeof updateSlate>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(slate?.name ?? "");
  const [governingBodyId, setGoverningBodyId] = useState(slate?.governing_body_id ?? "");
  const [technicalNumber, setTechnicalNumber] = useState(slate?.technical_number ?? "");
  const [notes, setNotes] = useState(slate?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !show) {
      return;
    }

    setBusy(true);

    try {
      if (slate) {
        await onUpdateSlate(slate.id, {
          governing_body_id: governingBodyId || null,
          name,
          technical_number: governingBodyId ? technicalNumber || null : null,
          notes: notes || null,
        });
      } else {
        await onCreateSlate({
          organization_id: organization.id,
          show_id: show.id,
          governing_body_id: governingBodyId || null,
          name,
          technical_number: governingBodyId ? technicalNumber || null : null,
          notes: notes || null,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{slate ? uiText(locale, "Modifier la slate", "Edit slate") : uiText(locale, "Nouvelle slate", "New slate")}</h2>
          <p>{show?.name ?? uiText(locale, "Choisis d'abord un concours.", "Choose a show first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom de la slate", "Slate name")}
          <input disabled={!organization || !show} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Organisme de régie", "Governing body")}
            <select
              disabled={!organization || !show}
              value={governingBodyId}
              onChange={(event) => {
                setGoverningBodyId(event.target.value);
                if (!event.target.value) {
                  setTechnicalNumber("");
                }
              }}
            >
              <option value="">{uiText(locale, "Slate maison / interne", "House / internal slate")}</option>
              {sanctioningBodies.map((body) => (
                <option key={body.id} value={body.id}>
                  {body.code} — {body.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {uiText(locale, "Numéro technique", "Technical number")}
            <input
              disabled={!governingBodyId}
              placeholder={uiText(locale, "Ex.: numéro de slate NRHA", "Example: NRHA slate number")}
              value={technicalNumber}
              onChange={(event) => setTechnicalNumber(event.target.value)}
            />
          </label>
        </div>
        <label>
          {uiText(locale, "Notes de production de rapports", "Reporting notes")}
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <FormActions
          busy={busy || !organization || !show}
          cancelLabel={uiText(locale, "Annuler", "Cancel")}
          saveLabel={slate ? uiText(locale, "Sauvegarder", "Save") : uiText(locale, "Créer la slate", "Create slate")}
          onCancel={onCancel}
        />
      </form>
    </section>
  );
}

export { SlateForm };
