import { useEffect, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { errorMessage, numericValue } from "../../lib/display";
import { listShowHorseFees, saveShowHorseFee } from "../../services/supabaseServices";
import type { ShowHorseFee } from "../../types/domain";
import { uiText } from "../dashboard/shared";

type EditableFee = Pick<ShowHorseFee, "id" | "name_fr" | "name_en" | "taxable" | "is_active" | "sort_order"> & { amount: string };

const blankFee = (): EditableFee => ({
  id: "",
  name_fr: "",
  name_en: "",
  amount: "",
  taxable: true,
  is_active: true,
  sort_order: 0,
});

function editableFee(fee: ShowHorseFee): EditableFee {
  return { ...fee, amount: String(fee.amount) };
}

export function ShowHorseFeesSettings({ showId, locale }: { showId: string; locale: Locale }) {
  const [fees, setFees] = useState<EditableFee[]>([]);
  const [draft, setDraft] = useState(blankFee);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let active = true;
    listShowHorseFees(showId)
      .then((rows) => { if (active) setFees(rows.map(editableFee)); })
      .catch((error) => { if (active) setFailure(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showId]);

  function updateFee(id: string, patch: Partial<EditableFee>) {
    setFees((current) => current.map((fee) => fee.id === id ? { ...fee, ...patch } : fee));
  }

  async function persist(fee: EditableFee, isNew = false) {
    const amount = numericValue(fee.amount);
    if (!fee.name_fr.trim() || !fee.name_en.trim() || amount == null || amount <= 0) {
      setFailure(uiText(locale, "Entre les deux noms et un montant supérieur à 0.", "Enter both names and an amount greater than 0."));
      return;
    }
    setSavingId(fee.id || "new");
    setFailure("");
    setMessage("");
    try {
      const saved = await saveShowHorseFee({
        show_id: showId,
        id: fee.id || null,
        name_fr: fee.name_fr.trim(),
        name_en: fee.name_en.trim(),
        amount,
        taxable: fee.taxable,
        is_active: fee.is_active,
        sort_order: fee.sort_order,
      });
      if (isNew) {
        setFees((current) => [...current, editableFee(saved)]);
        setDraft(blankFee());
      } else {
        setFees((current) => current.map((row) => row.id === saved.id ? editableFee(saved) : row));
      }
      setMessage(uiText(locale, "Frais par cheval enregistrés.", "Per-horse fee saved."));
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="show-settings-horse-fees" aria-labelledby="show-horse-fees-title">
      <div>
        <h3 id="show-horse-fees-title">{uiText(locale, "Frais par cheval", "Per-horse fees")}</h3>
        <p className="show-settings-help">
          {uiText(locale,
            "Chaque frais actif est ajouté une seule fois par cheval et par compte du concours, peu importe le nombre de classes. Le même cheval sur deux factures distinctes est facturé sur chacune. Un scratch conserve ces frais.",
            "Each active fee is added once per horse and show account, regardless of class count. The same horse on two separate invoices is charged on each. Scratching retains these fees.")}
        </p>
      </div>
      {loading ? <p>{uiText(locale, "Chargement…", "Loading…")}</p> : null}
      <div className="show-horse-fee-list">
        {fees.map((fee) => (
          <FeeEditor key={fee.id} fee={fee} locale={locale} busy={savingId === fee.id} onChange={(patch) => updateFee(fee.id, patch)} onSave={() => persist(fee)} />
        ))}
        <FeeEditor fee={draft} locale={locale} busy={savingId === "new"} isNew onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} onSave={() => persist(draft, true)} />
      </div>
      {failure ? <p className="show-horse-fee-error" role="alert">{failure}</p> : null}
      {message ? <p className="show-horse-fee-success" role="status">{message}</p> : null}
    </section>
  );
}

function FeeEditor({ fee, locale, busy, isNew = false, onChange, onSave }: {
  fee: EditableFee;
  locale: Locale;
  busy: boolean;
  isNew?: boolean;
  onChange: (patch: Partial<EditableFee>) => void;
  onSave: () => void;
}) {
  return (
    <article className="show-horse-fee-row">
      <div className="show-horse-fee-fields">
        <label>{uiText(locale, "Nom français", "French name")}<input maxLength={120} placeholder="Frais de secrétariat" value={fee.name_fr} onChange={(event) => onChange({ name_fr: event.target.value })} /></label>
        <label>{uiText(locale, "Nom anglais", "English name")}<input maxLength={120} placeholder="Office fee" value={fee.name_en} onChange={(event) => onChange({ name_en: event.target.value })} /></label>
        <label>{uiText(locale, "Montant", "Amount")}<input min="0.01" step="0.01" type="number" inputMode="decimal" value={fee.amount} onChange={(event) => onChange({ amount: event.target.value })} /></label>
      </div>
      <div className="show-horse-fee-actions">
        <label className="check-row"><input type="checkbox" checked={fee.taxable} onChange={(event) => onChange({ taxable: event.target.checked })} /><span>{uiText(locale, "Taxable", "Taxable")}</span></label>
        {!isNew ? <label className="check-row"><input type="checkbox" checked={fee.is_active} onChange={(event) => onChange({ is_active: event.target.checked })} /><span>{uiText(locale, "Actif", "Active")}</span></label> : null}
        <button className="secondary-button" disabled={busy} type="button" onClick={onSave}>{busy ? uiText(locale, "Enregistrement…", "Saving…") : isNew ? uiText(locale, "Ajouter le frais", "Add fee") : uiText(locale, "Enregistrer", "Save")}</button>
      </div>
    </article>
  );
}
