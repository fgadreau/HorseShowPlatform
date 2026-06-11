import { SearchSelect } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import type { BackNumberPolicy, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { backNumberPolicyLabel } from "./classUtils";
import { toggleSanctioningBodyCode, sanctionLabel } from "./classUtils";

function SanctioningFields({
  locale = "fr",
  backNumberPolicy,
  disabled = false,
  hideBackNumberPolicy = false,
  label,
  sanctioningBodies,
  sanctioningBodyCodes,
  onBackNumberPolicyChange,
  onSanctioningBodyCodesChange,
}: {
  locale?: Locale;
  backNumberPolicy: BackNumberPolicy;
  disabled?: boolean;
  hideBackNumberPolicy?: boolean;
  label?: string;
  sanctioningBodies: SanctioningBody[];
  sanctioningBodyCodes: string[];
  onBackNumberPolicyChange: (policy: BackNumberPolicy) => void;
  onSanctioningBodyCodesChange: (codes: string[]) => void;
}) {
  const fieldLabel = label ?? uiText(locale, "Sanctions", "Sanctioning");

  return (
    <div className="stack compact-stack">
      <div className="field-group">
        <span className="contact-picker-label">{fieldLabel}</span>
        <div className="checkbox-grid">
          {sanctioningBodies.map((body) => (
            <label className="check-row" key={body.code}>
              <input
                checked={sanctioningBodyCodes.includes(body.code)}
                disabled={disabled}
                type="checkbox"
                onChange={() => onSanctioningBodyCodesChange(toggleSanctioningBodyCode(sanctioningBodyCodes, body.code))}
              />
              <span>{body.name}</span>
            </label>
          ))}
          {!sanctioningBodies.length ? <span className="muted-line">{uiText(locale, "Aucun organisme de sanction configuré.", "No sanctioning bodies configured.")}</span> : null}
        </div>
      </div>
      {hideBackNumberPolicy ? null : (
        <label>
          {uiText(locale, "Politique de dossard", "Back number policy")}
          <select disabled={disabled} value={backNumberPolicy} onChange={(event) => onBackNumberPolicyChange(event.target.value as BackNumberPolicy)}>
            <option value="horse">{uiText(locale, "Par cheval", "By horse")}</option>
            <option value="rider">{uiText(locale, "Par cavalier", "By rider")}</option>
            <option value="horse_rider_team">{uiText(locale, "Par équipe cheval / cavalier", "By horse / rider team")}</option>
            <option value="entry">{uiText(locale, "Par inscription", "By entry")}</option>
            <option value="custom">{uiText(locale, "Personnalisée", "Custom")}</option>
          </select>
        </label>
      )}
    </div>
  );
}

export { SanctioningFields };
