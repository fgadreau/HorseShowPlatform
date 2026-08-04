import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Discipline, OrganizationDiscipline } from "../../types/domain";
import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";

function DirectoryDisciplinePicker({
  locale,
  disciplines,
  organizationDisciplines,
  linkedOrganizationDisciplineIds,
  onLink,
  onUnlink,
}: {
  locale: Locale;
  disciplines: Discipline[];
  organizationDisciplines: OrganizationDiscipline[];
  linkedOrganizationDisciplineIds: Set<string>;
  onLink: (organizationDisciplineId: string) => Promise<void>;
  onUnlink: (organizationDisciplineId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState("");

  async function handleToggle(organizationDisciplineId: string, linked: boolean) {
    setBusyId(organizationDisciplineId);

    try {
      if (linked) {
        await onUnlink(organizationDisciplineId);
      } else {
        await onLink(organizationDisciplineId);
      }
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="directory-discipline-picker">
      <span className="directory-discipline-label">{uiText(locale, "Répertoires", "Directories")}</span>
      <div className="horse-chip-row">
        {organizationDisciplines.map((organizationDiscipline) => {
          const discipline = disciplines.find((candidate) => candidate.id === organizationDiscipline.discipline_id);
          const linked = linkedOrganizationDisciplineIds.has(organizationDiscipline.id);
          const busy = busyId === organizationDiscipline.id;

          return (
            <button
              aria-pressed={linked}
              className={`directory-discipline-toggle ${linked ? "linked" : ""}`}
              disabled={Boolean(busyId)}
              key={organizationDiscipline.id}
              title={linked ? uiText(locale, "Retirer de ce répertoire", "Remove from this directory") : uiText(locale, "Ajouter à ce répertoire", "Add to this directory")}
              type="button"
              onClick={() => void handleToggle(organizationDiscipline.id, linked)}
            >
              {linked ? <Check size={14} /> : <Plus size={14} />}
              {discipline?.name ?? discipline?.code ?? uiText(locale, "Discipline", "Discipline")}
              {busy ? "…" : ""}
            </button>
          );
        })}
        {!organizationDisciplines.length ? <span className="muted-line">{uiText(locale, "Aucun répertoire actif", "No active directory")}</span> : null}
      </div>
    </div>
  );
}

export { DirectoryDisciplinePicker };

function DirectoryCreationPicker({
  locale,
  disciplines,
  organizationDisciplines,
  selectedIds,
  onChange,
}: {
  locale: Locale;
  disciplines: Discipline[];
  organizationDisciplines: OrganizationDiscipline[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  function toggle(id: string) {
    const next = new Set(selectedIds);

    if (next.has(id)) {
      if (next.size === 1) {
        return;
      }
      next.delete(id);
    } else {
      next.add(id);
    }

    onChange(next);
  }

  return (
    <fieldset className="stack nested-fieldset">
      <legend>{uiText(locale, "Ajouter aux répertoires", "Add to directories")}</legend>
      <div className="horse-chip-row">
        {organizationDisciplines.map((organizationDiscipline) => {
          const discipline = disciplines.find((candidate) => candidate.id === organizationDiscipline.discipline_id);
          const selected = selectedIds.has(organizationDiscipline.id);

          return (
            <button
              aria-pressed={selected}
              className={`directory-discipline-toggle ${selected ? "linked" : ""}`}
              key={organizationDiscipline.id}
              type="button"
              onClick={() => toggle(organizationDiscipline.id)}
            >
              {selected ? <Check size={14} /> : <Plus size={14} />}
              {discipline?.name ?? discipline?.code ?? uiText(locale, "Discipline", "Discipline")}
            </button>
          );
        })}
      </div>
      <span className="input-help">{uiText(locale, "Choisis au moins un répertoire. La fiche pourra être liée à d'autres disciplines plus tard.", "Choose at least one directory. The record can be linked to other disciplines later.")}</span>
    </fieldset>
  );
}

export { DirectoryCreationPicker };
