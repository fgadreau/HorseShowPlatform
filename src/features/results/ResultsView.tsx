import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileCheck2, RefreshCw, Send } from "lucide-react";
import { EmptyState, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import {
  buildPayoutDraft,
  payoutDraftMatchesCalculation,
  payoutNeedsScheduleBHint,
  type PayoutAwardDraft,
  type PayoutCalculationDraft,
} from "../../lib/payouts";
import type {
  ClassRecord,
  Contact,
  Division,
  Entry,
  EntryResult,
  Horse,
  Organization,
  PayoutAward,
  PayoutCalculation,
  PayoutResultSnapshotRow,
  PayoutSchedule,
  PayoutScheduleBracket,
  Show,
} from "../../types/domain";
import { uiText } from "../dashboard/shared";

function ResultsView({
  locale = "fr",
  classes,
  contacts,
  divisions,
  entries,
  entryResults,
  horses,
  organization,
  payoutAwards,
  payoutCalculations,
  payoutScheduleBrackets,
  payoutSchedules,
  profileId,
  shows,
  onSavePayoutCalculationDraft,
  onUpdatePayoutAwardPayee,
  onUpdatePayoutCalculationStatus,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  entryResults: EntryResult[];
  horses: Horse[];
  organization: Organization | null;
  payoutAwards: PayoutAward[];
  payoutCalculations: PayoutCalculation[];
  payoutScheduleBrackets: PayoutScheduleBracket[];
  payoutSchedules: PayoutSchedule[];
  profileId: string;
  shows: Show[];
  onSavePayoutCalculationDraft: (input: { awards: PayoutAwardDraft[]; calculatedByUserId?: string | null; calculation: PayoutCalculationDraft }) => Promise<void>;
  onUpdatePayoutAwardPayee: (id: string, input: Pick<PayoutAward, "calculation_id" | "payee_contact_id" | "payee_name" | "payee_override_note">) => Promise<void>;
  onUpdatePayoutCalculationStatus: (id: string, status: "reviewed" | "published") => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState("");
  const classesByShow = useMemo(() => {
    const grouped = new Map<string, ClassRecord[]>();

    for (const classRecord of classes) {
      const group = grouped.get(classRecord.show_id) ?? [];
      group.push(classRecord);
      grouped.set(classRecord.show_id, group);
    }

    for (const group of grouped.values()) {
      group.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }

    return grouped;
  }, [classes]);
  const divisionsByClass = useMemo(() => {
    const grouped = new Map<string, Division[]>();

    for (const division of divisions) {
      const group = grouped.get(division.class_id) ?? [];
      group.push(division);
      grouped.set(division.class_id, group);
    }

    return grouped;
  }, [divisions]);
  const latestCalculationByDivision = useMemo(() => {
    const mapped = new Map<string, PayoutCalculation>();

    for (const calculation of payoutCalculations) {
      const existing = mapped.get(calculation.division_id);

      if (!existing || calculation.calculated_at > existing.calculated_at) {
        mapped.set(calculation.division_id, calculation);
      }
    }

    return mapped;
  }, [payoutCalculations]);
  const awardsByCalculation = useMemo(() => {
    const grouped = new Map<string, PayoutAward[]>();

    for (const award of payoutAwards) {
      const group = grouped.get(award.calculation_id) ?? [];
      group.push(award);
      grouped.set(award.calculation_id, group);
    }

    for (const group of grouped.values()) {
      group.sort((a, b) => a.rank - b.rank || b.amount - a.amount);
    }

    return grouped;
  }, [payoutAwards]);
  const publishedCount = payoutCalculations.filter((calculation) => calculation.status === "published").length;
  const reviewedCount = payoutCalculations.filter((calculation) => calculation.status === "reviewed").length;

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);

    try {
      await action();
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="stack">
      <ViewIntro
        eyebrow={uiText(locale, "Résultats", "Results")}
        title={uiText(locale, "Résultats officiels et bourses", "Official results and payouts")}
        description={uiText(
          locale,
          "Révise les résultats synchronisés, recalcule les bourses et publie les résultats finaux avec les montants de payout.",
          "Review synced results, recalculate purses, and publish final results together with payout amounts.",
        )}
        stats={[
          { label: uiText(locale, "classes", "classes"), value: String(divisions.length) },
          { label: uiText(locale, "révisées", "reviewed"), value: String(reviewedCount) },
          { label: uiText(locale, "publiées", "published"), value: String(publishedCount) },
        ]}
      />

      {!shows.length ? <EmptyState label={uiText(locale, "Aucun show sélectionné.", "No show selected.")} /> : null}

      {shows.map((show) => {
        const showClasses = classesByShow.get(show.id) ?? [];

        return (
          <section className="panel results-show-panel" key={show.id}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">{organization?.name ?? uiText(locale, "Association", "Association")}</p>
                <h2>{showLabel(show)}</h2>
              </div>
            </div>
            <div className="results-block-list">
              {showClasses.map((classRecord) => {
                const classDivisions = divisionsByClass.get(classRecord.id) ?? [];

                return (
                  <section className="results-block" key={classRecord.id}>
                    <div className="results-block-header">
                      <div>
                        <strong>{classRecord.name}</strong>
                        {[classRecord.block_label, classRecord.code].filter(Boolean).join(" - ")}
                      </div>
                    </div>
                    {classDivisions.length ? (
                      <div className="results-division-list">
                        {classDivisions.map((division) => {
                          const calculation = latestCalculationByDivision.get(division.id) ?? null;
                          const savedAwards = calculation ? awardsByCalculation.get(calculation.id) ?? [] : [];
                          const draft = buildPayoutDraft({
                            contacts,
                            division,
                            entries,
                            entryResults,
                            existingAwards: savedAwards,
                            horses,
                            organization,
                            payoutScheduleBrackets,
                            payoutSchedules,
                            show,
                          });
                          const inSync = payoutDraftMatchesCalculation(draft, calculation);
                          const statusLabel = calculation ? payoutStatusLabel(calculation.status, locale) : uiText(locale, "Non calculé", "Not calculated");
                          const needsReview = !calculation || !inSync || calculation.status === "draft";
                          const canReview = Boolean(calculation && inSync && calculation.status === "draft");
                          const canPublish = Boolean(calculation && inSync && calculation.status === "reviewed");
                          const rows = mergeSavedPayees(draft.calculation.result_snapshot, savedAwards);
                          const divisionBusy = busyKey.endsWith(`:${division.id}`);

                          return (
                            <section className="results-division" key={division.id}>
                              <div className="results-division-header">
                                <div>
                                  <h3>{division.name}</h3>
                                  <p>
                                    {statusLabel}
                                    {!inSync && calculation ? ` - ${uiText(locale, "à recalculer", "recalculation needed")}` : ""}
                                  </p>
                                </div>
                                <div className="results-division-actions">
                                  {payoutNeedsScheduleBHint(division) ? (
                                    <span className="status-chip warning">
                                      <AlertCircle size={14} />
                                      {uiText(locale, "Schedule B suggéré", "Schedule B suggested")}
                                    </span>
                                  ) : null}
                                  <button
                                    className="ghost-button"
                                    disabled={divisionBusy}
                                    type="button"
                                    onClick={() =>
                                      runAction(`recalculate:${division.id}`, () =>
                                        onSavePayoutCalculationDraft({
                                          awards: draft.awards,
                                          calculatedByUserId: profileId,
                                          calculation: draft.calculation,
                                        }),
                                      )
                                    }
                                  >
                                    <RefreshCw size={16} />
                                    {uiText(locale, "Recalculer", "Recalculate")}
                                  </button>
                                  <button
                                    className="ghost-button"
                                    disabled={!canReview || divisionBusy}
                                    type="button"
                                    onClick={() => calculation && runAction(`review:${division.id}`, () => onUpdatePayoutCalculationStatus(calculation.id, "reviewed"))}
                                  >
                                    <FileCheck2 size={16} />
                                    {uiText(locale, "Marquer révisé", "Mark reviewed")}
                                  </button>
                                  <button
                                    className="primary-button"
                                    disabled={!canPublish || divisionBusy}
                                    type="button"
                                    onClick={() => calculation && runAction(`publish:${division.id}`, () => onUpdatePayoutCalculationStatus(calculation.id, "published"))}
                                  >
                                    <Send size={16} />
                                    {uiText(locale, "Publier", "Publish")}
                                  </button>
                                </div>
                              </div>

                              <div className="results-worksheet">
                                <span>{uiText(locale, "Entrées", "Entries")}: <strong>{draft.calculation.entry_count}</strong></span>
                                <span>{uiText(locale, "Brut", "Gross")}: <strong>{formatCurrency(draft.calculation.gross_entry_fees, draft.calculation.currency)}</strong></span>
                                <span>{uiText(locale, "Après trophée", "After trophy")}: <strong>{formatCurrency(draft.calculation.base_after_trophy_fee, draft.calculation.currency)}</strong></span>
                                <span>{uiText(locale, "Frais NRHA", "NRHA fee")}: <strong>{formatCurrency(draft.calculation.nrha_fee_amount, draft.calculation.currency)}</strong></span>
                                <span>{uiText(locale, "Retenue", "Retainage")}: <strong>{formatCurrency(draft.calculation.retainage_amount, draft.calculation.currency)}</strong></span>
                                <span>{uiText(locale, "Bourse nette", "Net purse")}: <strong>{formatCurrency(draft.calculation.net_purse, draft.calculation.currency)}</strong></span>
                              </div>

                              {needsReview ? (
                                <div className="inline-alert">
                                  <AlertCircle size={16} />
                                  {uiText(
                                    locale,
                                    "Recalcule et révise cette division avant de publier. Les drafts ne sont jamais publics.",
                                    "Recalculate and review this division before publishing. Drafts are never public.",
                                  )}
                                </div>
                              ) : null}

                              <ResultsTable
                                calculation={calculation}
                                contacts={contacts}
                                currency={draft.calculation.currency}
                                disabled={!calculation || calculation.status === "published" || divisionBusy}
                                locale={locale}
                                rows={rows}
                                savedAwards={savedAwards}
                                onUpdatePayoutAwardPayee={onUpdatePayoutAwardPayee}
                              />
                            </section>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState label={uiText(locale, "Aucune classe dans ce bloc.", "No classes in this block.")} />
                    )}
                  </section>
                );
              })}
              {!showClasses.length ? <EmptyState label={uiText(locale, "Aucun bloc à afficher pour ce show.", "No blocks to show for this show.")} /> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ResultsTable({
  calculation,
  contacts,
  currency,
  disabled,
  locale,
  rows,
  savedAwards,
  onUpdatePayoutAwardPayee,
}: {
  calculation: PayoutCalculation | null;
  contacts: Contact[];
  currency: string;
  disabled: boolean;
  locale: Locale;
  rows: PayoutResultSnapshotRow[];
  savedAwards: PayoutAward[];
  onUpdatePayoutAwardPayee: (id: string, input: Pick<PayoutAward, "calculation_id" | "payee_contact_id" | "payee_name" | "payee_override_note">) => Promise<void>;
}) {
  const awardByEntryId = new Map(savedAwards.map((award) => [award.entry_id, award]));

  if (!rows.length) {
    return <EmptyState label={uiText(locale, "Aucune inscription à afficher pour cette classe.", "No entries to display for this class.")} />;
  }

  return (
    <div className="table-wrap results-table-wrap">
      <table className="data-table results-table">
        <thead>
          <tr>
            <th>{uiText(locale, "Rang", "Rank")}</th>
            <th>{uiText(locale, "Dossard", "Back #")}</th>
            <th>{uiText(locale, "Cavalier", "Rider")}</th>
            <th>{uiText(locale, "Cheval", "Horse")}</th>
            <th>{uiText(locale, "Owner / Payee", "Owner / Payee")}</th>
            <th>{uiText(locale, "Score", "Score")}</th>
            <th>{uiText(locale, "Statut", "Status")}</th>
            <th>{uiText(locale, "Payout", "Payout")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const award = awardByEntryId.get(row.entry_id);

            return (
              <tr key={row.entry_id}>
                <td>{row.rank ?? "-"}</td>
                <td>{row.back_number ?? "-"}</td>
                <td>{row.rider_name}</td>
                <td>{row.horse_name}</td>
                <td>
                  <div className="results-payee-cell">
                    <span>{row.owner_name}</span>
                    {award && calculation ? (
                      <select
                        disabled={disabled}
                        value={award.payee_contact_id ?? ""}
                        onChange={(event) => {
                          const nextContact = findById(contacts, event.target.value);
                          void onUpdatePayoutAwardPayee(award.id, {
                            calculation_id: calculation.id,
                            payee_contact_id: nextContact?.id ?? null,
                            payee_name: nextContact ? contactLabel(nextContact) : null,
                            payee_override_note: nextContact ? uiText(locale, "Override manuel dans Résultats", "Manual override in Results") : null,
                          });
                        }}
                      >
                        {contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contactLabel(contact)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </td>
                <td>{row.final_score == null ? "-" : row.final_score.toFixed(3).replace(/\.?0+$/, "")}</td>
                <td>
                  <span className={`status-chip ${row.status === "scored" ? "success" : row.status === "pending" ? "" : "warning"}`}>
                    {row.status === "scored" ? <CheckCircle2 size={14} /> : null}
                    {resultStatusLabel(row.status, locale)}
                  </span>
                </td>
                <td>
                  {row.payout_amount > 0 ? (
                    <strong>{formatCurrency(row.payout_amount, currency)}</strong>
                  ) : (
                    <span className="muted">{uiText(locale, "Aucun", "None")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function mergeSavedPayees(rows: PayoutResultSnapshotRow[], savedAwards: PayoutAward[]) {
  const awardByEntryId = new Map(savedAwards.map((award) => [award.entry_id, award]));

  return rows.map((row) => {
    const award = awardByEntryId.get(row.entry_id);

    if (!award) {
      return row;
    }

    return {
      ...row,
      payee_contact_id: award.payee_contact_id,
      payee_name: award.payee_name ?? row.payee_name,
    };
  });
}

function payoutStatusLabel(status: PayoutCalculation["status"], locale: Locale) {
  switch (status) {
    case "published":
      return uiText(locale, "Publié", "Published");
    case "reviewed":
      return uiText(locale, "Révisé", "Reviewed");
    case "draft":
    default:
      return "Draft";
  }
}

function resultStatusLabel(status: PayoutResultSnapshotRow["status"], locale: Locale) {
  switch (status) {
    case "scored":
      return uiText(locale, "Pointé", "Scored");
    case "scratch":
      return "Scratch";
    case "no_score":
      return uiText(locale, "No score", "No score");
    case "disqualified":
      return "DQ";
    case "pending":
    default:
      return uiText(locale, "En attente", "Pending");
  }
}

export { ResultsView };
