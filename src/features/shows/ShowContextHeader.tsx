import { useState } from "react";
import { Settings2 } from "lucide-react";
import { formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Show } from "../../types/domain";
import type { updateShow } from "../../services/supabaseServices";
import { ShowSettingsDialog } from "./ShowSettingsDialog";
import "./showSettings.css";

export function ShowContextHeader({ show, locale, canEdit, onUpdateShow }: {
  show: Show; locale: Locale; canEdit: boolean;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const fr = locale === "fr";
  const manual = show.entry_payment_policy === "manual";
  const status = { draft: fr ? "Brouillon" : "Draft", open: fr ? "Ouvert" : "Open", closed: fr ? "Fermé" : "Closed", archived: fr ? "Archivé" : "Archived" }[show.status] ?? show.status;
  return <>
    <header className="show-context-heading">
      <div className="show-context-information"><strong>{show.name}</strong><span>{formatDate(show.start_date)} — {formatDate(show.end_date)} · {status}</span>
        <div className="show-entry-policy"><span>{fr ? "Inscriptions" : "Entries"}</span><strong>{manual ? (fr ? "Gestion manuelle" : "Manual handling") : (fr ? "Carte · paiement ou préautorisation" : "Card · payment or authorization")}</strong>
          {canEdit && <button type="button" className="text-button" aria-label={fr ? "Modifier la gestion des inscriptions" : "Change entry handling"} onClick={() => setEditing(true)}>{fr ? "Modifier" : "Change"}</button>}
        </div>
      </div>
      {canEdit && <button className="show-settings-button" type="button" onClick={() => setEditing(true)}><Settings2 size={18} aria-hidden="true" />{fr ? "Paramètres du concours" : "Show settings"}</button>}
    </header>
    {editing && <ShowSettingsDialog show={show} locale={locale} onClose={() => setEditing(false)} onUpdateShow={onUpdateShow} />}
  </>;
}
