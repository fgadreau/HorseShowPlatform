import { useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { PayoutScheduleType } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { payoutScheduleOptions, payoutScheduleOption, payoutScheduleUsesCustomTable, payoutRuleRows, payoutPercentageTotal, payoutRulesHaveStoredRows, payoutPreview, parseNullableRuleNumber, parsePayoutPercentages, defaultPayoutRulesFor, type PayoutRuleBracket } from "./classUtils";

function PayoutSettingsFields({
  locale = "fr",
  addedMoney,
  currency = "CAD",
  disabled = false,
  entryFee,
  payoutNotes,
  payoutRules,
  payoutScheduleType,
  retainagePercent,
  sanctioningFeePercent,
  trophyOrPlaqueFee,
  onAddedMoneyChange,
  onPayoutNotesChange,
  onPayoutRulesChange,
  onPayoutScheduleTypeChange,
  onRetainagePercentChange,
  onSanctioningFeePercentChange,
  onTrophyOrPlaqueFeeChange,
}: {
  locale?: Locale;
  addedMoney: string;
  currency?: string;
  disabled?: boolean;
  entryFee: string;
  payoutNotes: string;
  payoutRules: Record<string, unknown>;
  payoutScheduleType: PayoutScheduleType;
  retainagePercent: string;
  sanctioningFeePercent: string;
  trophyOrPlaqueFee: string;
  onAddedMoneyChange: (value: string) => void;
  onPayoutNotesChange: (value: string) => void;
  onPayoutRulesChange: (value: Record<string, unknown>) => void;
  onPayoutScheduleTypeChange: (value: PayoutScheduleType) => void;
  onRetainagePercentChange: (value: string) => void;
  onSanctioningFeePercentChange: (value: string) => void;
  onTrophyOrPlaqueFeeChange: (value: string) => void;
}) {
  const payoutOptions = payoutScheduleOptions(locale);
  const selectedPayout = payoutScheduleOption(payoutScheduleType, locale);
  const [previewEntryCount, setPreviewEntryCount] = useState("10");
  const customRows = payoutRuleRows(payoutRules);
  const preview = payoutPreview({
    addedMoney,
    entryCount: previewEntryCount,
    entryFee,
    payoutRules,
    retainagePercent,
    sanctioningFeePercent,
    trophyOrPlaqueFee,
  });

  function handlePayoutScheduleTypeChange(nextType: PayoutScheduleType) {
    onPayoutScheduleTypeChange(nextType);

    if (payoutScheduleUsesCustomTable(nextType) && !payoutRulesHaveStoredRows(payoutRules)) {
      onPayoutRulesChange(defaultPayoutRulesFor(nextType));
    }
  }

  function handleLoadPreset(nextType = payoutScheduleType) {
    onPayoutRulesChange(defaultPayoutRulesFor(nextType));
  }

  function handleRowChange(index: number, key: keyof PayoutRuleBracket, value: string) {
    onPayoutRulesChange({
      ...payoutRules,
      custom_brackets: customRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    });
  }

  function handleAddRow() {
    onPayoutRulesChange({
      ...payoutRules,
      custom_brackets: [...customRows, { min_entries: "", max_entries: "", percentages: "" }],
    });
  }

  function handleRemoveRow(index: number) {
    onPayoutRulesChange({
      ...payoutRules,
      custom_brackets: customRows.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  return (
    <fieldset className="stack nested-fieldset">
      <legend>{uiText(locale, "Bourses et paiements", "Purses and payouts")}</legend>
      <label>
        {uiText(locale, "Type de paiement", "Payout type")}
        <select disabled={disabled} value={payoutScheduleType} onChange={(event) => handlePayoutScheduleTypeChange(event.target.value as PayoutScheduleType)}>
          {payoutOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="input-help">{selectedPayout.description}</span>
      </label>
      <div className="form-grid">
        <label>
          {uiText(locale, "Added money", "Added money")}
          <input disabled={disabled} min="0" step="0.01" type="number" value={addedMoney} onChange={(event) => onAddedMoneyChange(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Trophée / plaque", "Trophy / plaque")}
          <input disabled={disabled} min="0" step="0.01" type="number" value={trophyOrPlaqueFee} onChange={(event) => onTrophyOrPlaqueFeeChange(event.target.value)} />
        </label>
      </div>
      <div className="form-grid">
        <label>
          {uiText(locale, "Retenue personnalisée (%)", "Retainage override (%)")}
          <input disabled={disabled} max="100" min="0" step="0.01" type="number" value={retainagePercent} onChange={(event) => onRetainagePercentChange(event.target.value)} />
          <span className="input-help">{uiText(locale, "Vide = utilise le réglage du concours ou de l'association.", "Blank = uses the show or association setting.")}</span>
        </label>
        <label>
          {uiText(locale, "Frais d'organisme (%)", "Sanctioning body fee (%)")}
          <input disabled={disabled} max="100" min="0" step="0.01" type="number" value={sanctioningFeePercent} onChange={(event) => onSanctioningFeePercentChange(event.target.value)} />
          <span className="input-help">{uiText(locale, "Ex.: NRHA 5 %. Vide = aucun frais défini ici.", "Example: NRHA 5%. Blank = no fee defined here.")}</span>
        </label>
      </div>
      {payoutScheduleUsesCustomTable(payoutScheduleType) ? (
        <div className="payout-editor">
          <div className="payout-editor-header">
            <span className="contact-picker-label">{uiText(locale, "Tableau maison", "House table")}</span>
            <button className="text-button" disabled={disabled} type="button" onClick={() => handleLoadPreset()}>
              {uiText(locale, "Charger un modèle", "Load preset")}
            </button>
          </div>
          <div className="payout-rule-table">
            <div className="payout-rule-row payout-rule-head">
              <span>Min</span>
              <span>Max</span>
              <span>{uiText(locale, "Places %", "Places %")}</span>
              <span>Total</span>
              <span />
            </div>
            {customRows.map((row, index) => {
              const total = payoutPercentageTotal(row);

              return (
                <div className="payout-rule-row" key={index}>
                  <input disabled={disabled} min="1" type="number" value={String(row.min_entries ?? "")} onChange={(event) => handleRowChange(index, "min_entries", event.target.value)} />
                  <input disabled={disabled} min="1" placeholder="+" type="number" value={String(row.max_entries ?? "")} onChange={(event) => handleRowChange(index, "max_entries", event.target.value)} />
                  <input
                    disabled={disabled}
                    placeholder={uiText(locale, "Ex.: 50, 30, 20", "Example: 50, 30, 20")}
                    value={Array.isArray(row.percentages) ? row.percentages.join(", ") : String(row.percentages ?? "")}
                    onChange={(event) => handleRowChange(index, "percentages", event.target.value)}
                  />
                  <span className={Math.abs(total - 100) < 0.01 ? "payout-total-ok" : "payout-total-warning"}>{total ? `${total}%` : "-"}</span>
                  <button aria-label={uiText(locale, "Supprimer la tranche", "Remove bracket")} className="text-button danger" disabled={disabled || customRows.length <= 1} type="button" onClick={() => handleRemoveRow(index)}>
                    X
                  </button>
                </div>
              );
            })}
          </div>
          <button className="ghost-button" disabled={disabled} type="button" onClick={handleAddRow}>
            <Plus size={16} />
            {uiText(locale, "Ajouter une tranche", "Add bracket")}
          </button>
          <label>
            {uiText(locale, "Aperçu avec", "Preview with")}
            <input disabled={disabled} min="1" step="1" type="number" value={previewEntryCount} onChange={(event) => setPreviewEntryCount(event.target.value)} />
          </label>
          <div className="payout-preview">
            <span>{uiText(locale, "Inscriptions", "Entries")}: {preview.entryCount}</span>
            <span>{uiText(locale, "Brut", "Gross")}: {formatCurrency(preview.grossEntryFees, currency)}</span>
            <span>{uiText(locale, "Bourse", "Purse")}: {formatCurrency(preview.purse, currency)}</span>
            <span>{uiText(locale, "Places payées", "Paid places")}: {preview.paidPlaces || uiText(locale, "aucune", "none")}</span>
            {preview.payouts.length ? (
              <ol>
                {preview.payouts.map((payout) => (
                  <li key={payout.place}>
                    {payout.place}. {payout.percent}% - {formatCurrency(payout.amount, currency)}
                  </li>
                ))}
              </ol>
            ) : (
              <span className="input-help">{uiText(locale, "Aucune tranche ne correspond au nombre d'inscriptions choisi.", "No bracket matches the selected number of entries.")}</span>
            )}
          </div>
        </div>
      ) : null}
      <label>
        {uiText(locale, "Notes de paiement", "Payout notes")}
        <textarea disabled={disabled} rows={2} value={payoutNotes} onChange={(event) => onPayoutNotesChange(event.target.value)} />
      </label>
    </fieldset>
  );
}

export { PayoutSettingsFields };
