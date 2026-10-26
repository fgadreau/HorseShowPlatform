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
  const [chosenDirectoryId, setChosenDirectoryId] = useState("");
  const ownContactIds = new Set(contacts.filter((contact) => contact.linked_user_id === profileId).map((contact) => contact.id));
  const activeDirectories = directories.filter((directory) => directory.is_active);
  const reiningId = disciplines.find((discipline) => discipline.is_active && discipline.code.toLowerCase() === "reining")?.id;
  const defaultDirectory = activeDirectories.find((directory) => directory.discipline_id === reiningId)
    ?? activeDirectories.find((directory) => directory.is_default) ?? activeDirectories[0];
  const selectedDirectoryId = activeDirectories.some((directory) => directory.id === chosenDirectoryId) ? chosenDirectoryId : defaultDirectory?.id ?? "";
  const hasLinkedDirectory = activeDirectories.some((directory) => joinedIds.has(directory.id)
    || directoryContacts.some((link) => link.organization_discipline_id === directory.id && ownContactIds.has(link.contact_id)));
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
    {!hasLinkedDirectory && activeDirectories.length > 0 ? <form className="stack" onSubmit={(event) => { event.preventDefault(); void join(selectedDirectoryId); }}>
      <label>{uiText(locale, "Répertoire", "Directory")}
        <select aria-label={uiText(locale, "Répertoire", "Directory")} value={selectedDirectoryId} onChange={(event) => setChosenDirectoryId(event.target.value)}>
          {activeDirectories.map((directory) => <option key={directory.id} value={directory.id}>{disciplines.find((discipline) => discipline.id === directory.discipline_id)?.name}</option>)}
        </select>
      </label>
      <p>{uiText(locale,
        `En confirmant, tu autorises ${organization?.name ?? "cette association"} à accéder aux fiches de contacts et de chevaux ainsi qu'aux documents liés à ce répertoire.`,
        `By confirming, you allow ${organization?.name ?? "this association"} to access the contact and horse records and documents linked to this directory.`)}</p>
      <button className="primary-button" disabled={Boolean(busyId) || !selectedDirectoryId} type="submit">{uiText(locale, "Confirmer mon répertoire", "Confirm my directory")}</button>
    </form> : <div className="horse-chip-row">
      {activeDirectories.map((directory) => {
        const linked = joinedIds.has(directory.id) || directoryContacts.some((link) => link.organization_discipline_id === directory.id && ownContactIds.has(link.contact_id));
        const name = disciplines.find((discipline) => discipline.id === directory.discipline_id)?.name ?? uiText(locale, "Répertoire", "Directory");
        return <button key={directory.id} type="button" className="ghost-button" aria-pressed={linked} disabled={linked || Boolean(busyId)} onClick={() => void join(directory.id)}>
          {name} — {linked ? uiText(locale, "Ajouté", "Added") : busyId === directory.id ? "…" : uiText(locale, "Choisir", "Choose")}
        </button>;
      })}
    </div>}
    {!directories.length ? <p>{uiText(locale, "Aucun répertoire actif accessible. Choisis une autre association ou contacte son personnel.", "No active directory is accessible. Choose another association or contact its staff.")}</p> : null}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
