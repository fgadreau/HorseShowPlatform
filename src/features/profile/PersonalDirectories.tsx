import { useState } from "react";
import type { Contact, DirectoryContact, Discipline, Organization, OrganizationDiscipline } from "../../types/domain";
import type { Locale } from "../../lib/i18n";
import { errorMessage } from "../../lib/display";
import { joinPublicDirectory } from "../../services/supabaseServices";
import { uiText } from "../dashboard/shared";

export function PersonalDirectories({ locale, organization, directories, disciplines, contacts, directoryContacts, profileId, onRefresh }: {
  locale: Locale;
  organization: Organization | null;
  directories: OrganizationDiscipline[];
  disciplines: Discipline[];
  contacts: Contact[];
  directoryContacts: DirectoryContact[];
  profileId: string;
  onRefresh: () => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const ownContactIds = new Set(contacts.filter((contact) => contact.linked_user_id === profileId).map((contact) => contact.id));
  async function join(directoryId: string) {
    setBusyId(directoryId);
    setMessage("");
    try {
      await joinPublicDirectory(directoryId);
      setJoinedIds((current) => new Set([...current, directoryId]));
      setMessage(uiText(locale, "Ton profil est lié à ce répertoire.", "Your profile is linked to this directory."));
      await onRefresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyId("");
    }
  }
  return <section className="panel span-2" aria-label={uiText(locale, "Mes répertoires", "My directories")}>
    <h2>{uiText(locale, "Mes répertoires", "My directories")}</h2>
    <p>{organization?.name}</p>
    <p>{uiText(locale, "Choisis l’association en haut de la page, puis les répertoires avec lesquels tu souhaites faire affaire. Tu peux en choisir plusieurs. Ce lien n’achète pas de carte de membre.", "Choose the association at the top of the page, then the directories you want to use. You can choose several. Linking does not purchase a membership card.")}</p>
    <div className="horse-chip-row">
      {directories.map((directory) => {
        const linked = joinedIds.has(directory.id) || directoryContacts.some((link) => link.organization_discipline_id === directory.id && ownContactIds.has(link.contact_id));
        const name = disciplines.find((discipline) => discipline.id === directory.discipline_id)?.name ?? uiText(locale, "Répertoire", "Directory");
        return <button key={directory.id} type="button" className="ghost-button" aria-pressed={linked} disabled={linked || Boolean(busyId)} onClick={() => void join(directory.id)}>
          {name} — {linked ? uiText(locale, "Ajouté", "Added") : busyId === directory.id ? "…" : uiText(locale, "Choisir", "Choose")}
        </button>;
      })}
    </div>
    {!directories.length ? <p>{uiText(locale, "Aucun répertoire actif accessible. Choisis une autre association ou contacte son personnel.", "No active directory is accessible. Choose another association or contact its staff.")}</p> : null}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
