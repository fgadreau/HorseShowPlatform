import { ModalDialog } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import type { Show } from "../../types/domain";
import type { updateShow } from "../../services/supabaseServices";
import { ShowEditForm } from "./ShowEditForm";
import "./showSettings.css";

export function ShowSettingsDialog({ show, locale, onClose, onUpdateShow }: {
  show: Show; locale: Locale; onClose: () => void;
  onUpdateShow: (id: string, input: Parameters<typeof updateShow>[1]) => Promise<void>;
}) {
  return <ModalDialog className="show-settings-modal" title={locale === "fr" ? "Paramètres du concours" : "Show settings"} description={show.name} onClose={onClose}>
    <ShowEditForm key={show.id} locale={locale} show={show} paymentsFirst embedded onCancel={onClose} onUpdateShow={async (id, input) => { await onUpdateShow(id, input); onClose(); }} />
  </ModalDialog>;
}
