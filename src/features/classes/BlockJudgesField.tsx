import type { Locale } from "../../lib/i18n";
import type { BlockJudgeAssignment } from "../../types/domain";
import { uiText } from "../dashboard/shared";

const MAX_BLOCK_JUDGES = 10;

function blockJudgeNames(assignments: BlockJudgeAssignment[], legacyDisplayName: string | null | undefined) {
  const assignedNames = [...assignments]
    .sort((left, right) => left.sort_order - right.sort_order || left.display_name.localeCompare(right.display_name))
    .map((assignment) => assignment.display_name.trim())
    .filter(Boolean);

  if (assignedNames.length) {
    return assignedNames;
  }

  return (legacyDisplayName ?? "")
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function serializeBlockJudgeNames(names: string[]) {
  return names.map((name) => name.trim()).filter(Boolean).join("; ");
}

function BlockJudgesField({
  disabled = false,
  locale,
  names,
  onChange,
}: {
  disabled?: boolean;
  locale: Locale;
  names: string[];
  onChange: (names: string[]) => void;
}) {
  function handleCountChange(count: number) {
    onChange(Array.from({ length: count }, (_, index) => names[index] ?? ""));
  }

  function handleNameChange(index: number, name: string) {
    onChange(names.map((currentName, currentIndex) => currentIndex === index ? name : currentName));
  }

  return (
    <fieldset className="stack nested-fieldset block-judges-field">
      <legend>{uiText(locale, "Juges du bloc", "Block judges")}</legend>
      <label>
        {uiText(locale, "Nombre de juges", "Number of judges")}
        <select disabled={disabled} value={names.length} onChange={(event) => handleCountChange(Number(event.target.value))}>
          <option value={0}>{uiText(locale, "À préciser", "To be determined")}</option>
          {Array.from({ length: MAX_BLOCK_JUDGES }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count}</option>
          ))}
        </select>
      </label>
      {names.length ? (
        <div className="form-grid block-judge-names">
          {names.map((name, index) => (
            <label key={index}>
              {uiText(locale, `Juge ${index + 1}`, `Judge ${index + 1}`)}
              <input
                disabled={disabled}
                required
                value={name}
                onChange={(event) => handleNameChange(index, event.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <span className="input-help">{uiText(locale, "Choisis le nombre de juges pour saisir chaque nom séparément. Tous les juges s'appliquent au bloc.", "Choose the number of judges to enter each name separately. Every judge applies to the block.")}</span>
      )}
    </fieldset>
  );
}

export { BlockJudgesField, blockJudgeNames, serializeBlockJudgeNames };
