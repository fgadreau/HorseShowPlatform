import type { Discipline, OrganizationDiscipline } from "../../types/domain";
import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";

function defaultOrganizationDisciplineId(organizationDisciplines: OrganizationDiscipline[]) {
  return organizationDisciplines.find((discipline) => discipline.is_default)?.id ?? organizationDisciplines[0]?.id ?? "";
}

function DisciplineSelect({
  locale,
  disciplines,
  organizationDisciplines,
  value,
  disabled,
  onChange,
}: {
  locale: Locale;
  disciplines: Discipline[];
  organizationDisciplines: OrganizationDiscipline[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {uiText(locale, "Discipline", "Discipline")}
      <select disabled={disabled || !organizationDisciplines.length} required value={value} onChange={(event) => onChange(event.target.value)}>
        {!organizationDisciplines.length ? <option value="">{uiText(locale, "Aucune discipline active", "No active discipline")}</option> : null}
        {organizationDisciplines.map((organizationDiscipline) => {
          const discipline = disciplines.find((candidate) => candidate.id === organizationDiscipline.discipline_id);

          return (
            <option key={organizationDiscipline.id} value={organizationDiscipline.id}>
              {discipline?.name ?? discipline?.code ?? uiText(locale, "Discipline inconnue", "Unknown discipline")}
              {organizationDiscipline.is_default ? ` — ${uiText(locale, "par défaut", "default")}` : ""}
            </option>
          );
        })}
      </select>
      <span className="input-help">{uiText(locale, "La discipline détermine le répertoire utilisé par cette classe.", "The discipline determines the directory used by this class.")}</span>
    </label>
  );
}

export { DisciplineSelect, defaultOrganizationDisciplineId };
