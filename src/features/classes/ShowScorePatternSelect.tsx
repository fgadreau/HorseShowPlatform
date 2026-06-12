import { SearchSelect } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";
import { normalizeShowScorePatternId, showScorePatternItems, showScorePatternSelectValue } from "./showScorePatterns";

function ShowScorePatternSelect({
  disabled = false,
  locale = "fr",
  value,
  onChange,
}: {
  disabled?: boolean;
  locale?: Locale;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SearchSelect
      allowEmpty
      clearLabel={uiText(locale, "Effacer le patron", "Clear pattern")}
      disabled={disabled}
      emptyLabel={uiText(locale, "Aucun patron", "No pattern")}
      items={showScorePatternItems(value)}
      placeholder={uiText(locale, "Rechercher un patron ShowScore", "Search ShowScore pattern")}
      value={showScorePatternSelectValue(value)}
      onChange={(nextValue) => onChange(normalizeShowScorePatternId(nextValue) || nextValue)}
    />
  );
}

export { ShowScorePatternSelect };
