import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, FileCheck2, RefreshCw, Send } from "lucide-react";
import { EmptyState, ViewIntro } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatCurrency, showLabel } from "../../lib/display";
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
import { payoutScheduleLabel } from "../classes/classUtils";
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
  const [actionError, setActionError] = useState("");
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Record<string, boolean>>({});
  const [collapsedDivisionIds, setCollapsedDivisionIds] = useState<Record<string, boolean>>({});
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
      group.sort((a, b) => numberValue(a.rank) - numberValue(b.rank) || numberValue(b.amount) - numberValue(a.amount));
    }

    return grouped;
  }, [payoutAwards]);
  const publishedCount = payoutCalculations.filter((calculation) => calculation.status === "published").length;
  const reviewedCount = payoutCalculations.filter((calculation) => calculation.status === "reviewed").length;

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setActionError("");

    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyKey("");
    }
  }

  function toggleBlock(id: string) {
    setCollapsedBlockIds((current) => ({ ...current, [id]: !(current[id] ?? true) }));
  }

  function toggleDivision(id: string) {
    setCollapsedDivisionIds((current) => ({ ...current, [id]: !(current[id] ?? true) }));
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

      {actionError ? (
        <div className="inline-alert">
          <AlertCircle size={16} />
          {actionError}
        </div>
      ) : null}

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
                const blockCollapsed = collapsedBlockIds[classRecord.id] ?? true;

                return (
                  <section className="results-block" key={classRecord.id}>
                    <button
                      aria-expanded={!blockCollapsed}
                      className="results-block-header results-collapse-button"
                      type="button"
                      onClick={() => toggleBlock(classRecord.id)}
                    >
                      <span className={`results-chevron ${blockCollapsed ? "" : "open"}`}>
                        <ChevronDown size={16} />
                      </span>
                      <span className="results-block-title">
                        <strong>{classRecord.name}</strong>
                        <span>{[classRecord.block_label, classRecord.code].filter(Boolean).join(" - ")}</span>
                      </span>
                      <span className="results-collapse-count">
                        {classDivisions.length} {uiText(locale, "classes", "classes")}
                      </span>
                    </button>
                    {!blockCollapsed && classDivisions.length ? (
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
                          const statusTone = payoutStatusTone(calculation, inSync);
                          const divisionCollapsed = collapsedDivisionIds[division.id] ?? true;

                          return (
                            <section className="results-division" key={division.id}>
                              <div className="results-division-header">
                                <div className="results-division-title">
                                  <div className="results-title-row">
                                    <button
                                      aria-expanded={!divisionCollapsed}
                                      className="icon-button results-collapse-icon"
                                      title={divisionCollapsed ? uiText(locale, "Ouvrir", "Open") : uiText(locale, "Replier", "Collapse")}
                                      type="button"
                                      onClick={() => toggleDivision(division.id)}
                                    >
                                      <ChevronDown className={`results-chevron ${divisionCollapsed ? "" : "open"}`} size={16} />
                                    </button>
                                    <h3>{division.name}</h3>
                                    <span className={`status-chip ${statusTone}`}>
                                      {calculation?.status === "published" ? <Send size={14} /> : calculation?.status === "reviewed" ? <FileCheck2 size={14} /> : <AlertCircle size={14} />}
                                      {statusLabel}
                                    </span>
                                  </div>
                                  <div className="results-division-meta">
                                    <span>{payoutScheduleLabel(division.payout_schedule_type, locale)}</span>
                                    <span>{draft.calculation.currency}</span>
                                    <span>
                                      {draft.awards.length} {uiText(locale, "payouts", "payouts")}
                                    </span>
                                    <span>{formatCurrency(draft.calculation.net_purse, draft.calculation.currency)}</span>
                                    {!inSync && calculation ? <span className="warning">{uiText(locale, "À recalculer", "Recalculation needed")}</span> : null}
                                  </div>
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

                              {!divisionCollapsed ? (
                                <div className="results-division-body">
                                  <div className="results-worksheet">
                                    <div className="results-worksheet-item">
                                      <span>{uiText(locale, "Entrées", "Entries")}</span>
                                      <strong>{draft.calculation.entry_count}</strong>
                                    </div>
                                    <div className="results-worksheet-item">
                                      <span>{uiText(locale, "Brut", "Gross")}</span>
                                      <strong>{formatCurrency(draft.calculation.gross_entry_fees, draft.calculation.currency)}</strong>
                                    </div>
                                    <div className="results-worksheet-item">
                                      <span>{uiText(locale, "Après trophée", "After trophy")}</span>
                                      <strong>{formatCurrency(draft.calculation.base_after_trophy_fee, draft.calculation.currency)}</strong>
                                    </div>
                                    <div className="results-worksheet-item">
                                      <span>{uiText(locale, "Frais NRHA", "NRHA fee")}</span>
                                      <strong>{formatCurrency(draft.calculation.nrha_fee_amount, draft.calculation.currency)}</strong>
                                    </div>
                                    <div className="results-worksheet-item">
                                      <span>{uiText(locale, "Retenue", "Retainage")}</span>
                                      <strong>{formatCurrency(draft.calculation.retainage_amount, draft.calculation.currency)}</strong>
                                    </div>
                                    <div className="results-worksheet-item emph">
                                      <span>{uiText(locale, "Bourse nette", "Net purse")}</span>
                                      <strong>{formatCurrency(draft.calculation.net_purse, draft.calculation.currency)}</strong>
                                    </div>
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
                                    disabled={!calculation || calculation.status !== "draft" || divisionBusy}
                                    locale={locale}
                                    rows={rows}
                                    savedAwards={savedAwards}
                                    onUpdatePayoutAwardPayee={onUpdatePayoutAwardPayee}
                                  />
                                </div>
                              ) : null}
                            </section>
                          );
                        })}
                      </div>
                    ) : !blockCollapsed ? (
                      <EmptyState label={uiText(locale, "Aucune classe dans ce bloc.", "No classes in this block.")} />
                    ) : null}
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
  const [payeeBusyId, setPayeeBusyId] = useState("");
  const [payeeError, setPayeeError] = useState("");
  const awardByEntryId = new Map(savedAwards.map((award) => [award.entry_id, award]));

  if (!rows.length) {
    return <EmptyState label={uiText(locale, "Aucune inscription à afficher pour cette classe.", "No entries to display for this class.")} />;
  }

  async function handlePayeeChange(award: PayoutAward, payeeContactId: string) {
    if (!calculation) {
      return;
    }

    const nextContact = findById(contacts, payeeContactId);

    setPayeeBusyId(award.id);
    setPayeeError("");

    try {
      await onUpdatePayoutAwardPayee(award.id, {
        calculation_id: calculation.id,
        payee_contact_id: nextContact?.id ?? null,
        payee_name: nextContact ? contactLabel(nextContact) : null,
        payee_override_note: nextContact ? uiText(locale, "Override manuel dans Résultats", "Manual override in Results") : null,
      });
    } catch (error) {
      setPayeeError(errorMessage(error));
    } finally {
      setPayeeBusyId("");
    }
  }

  return (
    <div className="table-wrap results-table-wrap">
      {payeeError ? (
        <div className="inline-alert">
          <AlertCircle size={16} />
          {payeeError}
        </div>
      ) : null}
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
            const payoutAmount = numberValue(row.payout_amount);
            const payoutPercentage = numberValue(row.payout_percentage);
            const payeeName = award?.payee_name ?? row.payee_name;
            const payeeChanged = Boolean(payeeName && payeeName !== row.owner_name);

            return (
              <tr className={`results-row ${row.status !== "scored" ? "is-unpaid" : ""}`} key={row.entry_id}>
                <td className="rank-cell">
                  <span className="rank-pill">{row.rank ?? "-"}</span>
                </td>
                <td>
                  <span className="back-number-pill">{row.back_number ?? "-"}</span>
                </td>
                <td>
                  <strong className="results-primary-text">{row.rider_name}</strong>
                </td>
                <td>{row.horse_name}</td>
                <td>
                  <div className="results-payee-cell">
                    <span>{row.owner_name}</span>
                    {payeeChanged ? <small>{payeeName}</small> : null}
                    {award && calculation ? (
                      <select
                        disabled={disabled || payeeBusyId === award.id}
                        value={award.payee_contact_id ?? ""}
                        onChange={(event) => void handlePayeeChange(award, event.target.value)}
                      >
                        <option value="">{uiText(locale, "Owner par défaut", "Default owner")}</option>
                        {contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contactLabel(contact)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </td>
                <td className="score-cell">{formatScore(row.final_score)}</td>
                <td>
                  <span className={`status-chip ${row.status === "scored" ? "success" : row.status === "pending" ? "" : "warning"}`}>
                    {row.status === "scored" ? <CheckCircle2 size={14} /> : null}
                    {resultStatusLabel(row.status, locale)}
                  </span>
                </td>
                <td className="payout-cell">
                  {payoutAmount > 0 ? (
                    <>
                      <strong>{formatCurrency(payoutAmount, currency)}</strong>
                      <small>{formatPercent(payoutPercentage, locale)}</small>
                    </>
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

function payoutStatusTone(calculation: PayoutCalculation | null, inSync: boolean) {
  if (!calculation || !inSync || calculation.status === "draft") {
    return "warning";
  }

  return calculation.status === "published" ? "success" : "neutral";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value: number | null) {
  if (value == null) {
    return "-";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(3).replace(/\.?0+$/, "") : "-";
}

function formatPercent(value: number, locale: Locale) {
  const language = locale === "fr" ? "fr-CA" : "en-CA";
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(value)} %`;
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
