import type { Locale } from "../../lib/i18n";
import type { BackNumberPolicy, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { backNumberPolicyLabel } from "./classUtils";
import { toggleGoverningBodyId } from "./classUtils";

function SanctioningFields({
  locale = "fr",
  backNumberPolicy,
  disabled = false,
  hideBackNumberPolicy = false,
  label,
  sanctioningBodies,
  governingBodyIds,
  eligibilityCacheTtlHours,
  sourceUnavailablePolicy,
  onBackNumberPolicyChange,
  onGoverningBodyIdsChange,
  onEligibilityCacheTtlHoursChange,
  onSourceUnavailablePolicyChange,
}: {
  locale?: Locale;
  backNumberPolicy: BackNumberPolicy;
  disabled?: boolean;
  hideBackNumberPolicy?: boolean;
  label?: string;
  sanctioningBodies: SanctioningBody[];
  governingBodyIds: string[];
  eligibilityCacheTtlHours?: number;
  sourceUnavailablePolicy?: "block" | "allow_with_warning";
  onBackNumberPolicyChange: (policy: BackNumberPolicy) => void;
  onGoverningBodyIdsChange: (ids: string[]) => void;
  onEligibilityCacheTtlHoursChange?: (hours: number) => void;
  onSourceUnavailablePolicyChange?: (policy: "block" | "allow_with_warning") => void;
}) {
  const fieldLabel = label ?? uiText(locale, "Sanctions", "Sanctioning");
  const hasNrha = sanctioningBodies.some((body) => body.code.toUpperCase() === "NRHA" && governingBodyIds.includes(body.id));

  return (
    <div className="stack compact-stack">
      <div className="field-group">
        <span className="contact-picker-label">{fieldLabel}</span>
        <div className="checkbox-grid">
          {sanctioningBodies.map((body) => (
            <label className="check-row" key={body.id}>
              <input
                checked={governingBodyIds.includes(body.id)}
                disabled={disabled}
                type="checkbox"
                onChange={() => onGoverningBodyIdsChange(toggleGoverningBodyId(governingBodyIds, body.id))}
              />
              <span>{body.name}</span>
            </label>
          ))}
          {!sanctioningBodies.length ? <span className="muted-line">{uiText(locale, "Aucun organisme de sanction configuré.", "No sanctioning bodies configured.")}</span> : null}
        </div>
      </div>
      {hasNrha && onEligibilityCacheTtlHoursChange && onSourceUnavailablePolicyChange ? (
        <details>
          <summary>{uiText(locale, "Options de vérification externe", "External verification options")}</summary>
          <div className="form-grid compact-stack">
            <label>
              {uiText(locale, "Durée du cache d'admissibilité", "Eligibility cache duration")}
              <select disabled={disabled} value={eligibilityCacheTtlHours ?? 6} onChange={(event) => onEligibilityCacheTtlHoursChange(Number(event.target.value))}>
                <option value={1}>1 h</option>
                <option value={6}>6 h</option>
                <option value={12}>12 h</option>
                <option value={24}>24 h</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Si la source est indisponible", "If the source is unavailable")}
              <select disabled={disabled} value={sourceUnavailablePolicy ?? "block"} onChange={(event) => onSourceUnavailablePolicyChange(event.target.value as "block" | "allow_with_warning")}>
                <option value="block">{uiText(locale, "Bloquer l'inscription", "Block entry")}</option>
                <option value="allow_with_warning">{uiText(locale, "Permettre avec avertissement", "Allow with warning")}</option>
              </select>
            </label>
          </div>
        </details>
      ) : null}
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
