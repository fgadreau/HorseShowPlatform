import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Clock, Plus } from "lucide-react";
import { EmptyState, ModalDialog, SearchSelect, ViewIntro } from "../../components/ui";
import { classLabel, findById, formatCurrency, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createBlock, createBlockTemplate, createClassTemplate, createClass, createSlate, deleteBlock, deleteBlockTemplate, deleteClassTemplate, deleteClass, deleteSlate, saveShowScorePaidWarmup, updateBlock, updateBlockTemplate, updateClassTemplate, updateClass, updateShowScorePaidWarmup, updateSlate } from "../../services/supabaseServices";
import type { Block, BlockConcurrencyGroupMember, BlockJudgeAssignment, BlockTemplate, ClassTemplate, Contact, ClassRecord, Discipline, DisciplineCredentialIssuer, EligibilityRequirement, Entry, EligibilityRules, ExternalCredentialIssuer, ExternalCredentialProduct, Horse, Organization, OrganizationDiscipline, OrganizationDisciplineGoverningBody, SanctioningBody, Show, ShowDay, ShowScorePaidWarmup, Slate } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { BlockForm } from "./BlockForm";
import { BlockTemplateForm } from "./BlockTemplateForm";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { BlockTemplateEditForm } from "./BlockTemplateEditForm";
import { ClassTemplateEditForm } from "./ClassTemplateEditForm";
import { ClassForm } from "./ClassForm";
import { BlockEditForm } from "./BlockEditForm";
import { ClassEditForm } from "./ClassEditForm";
import { SlateForm } from "./SlateForm";
import { EventBlockForm } from "./EventBlockForm";
import { PaidWarmupForm } from "./PaidWarmupForm";
import { sanctionLabel, payoutClassSummary, payoutTemplateClassSummary, classScheduleStartLabel, compareScheduleClasses, showDayLabel, classEntriesCloseLabel, showPaymentSummary, showStatusLabel, canManuallyOrderClass, hasGoverningBodyCode, nrhaClassTypeLabel, nrhaClassTypeFromAssignments } from "./classUtils";
import { showScorePatternLabel } from "./showScorePatterns";
import { EligibilityRequirementsEditor } from "./EligibilityRequirementsEditor";

function ClassesView({
  locale,
  blocks,
  blockConcurrencyGroupMembers,
  blockJudgeAssignments,
  classTemplates,
  blockTemplates,
  contacts,
  disciplines,
  disciplineCredentialIssuers,
  eligibilityRequirements,
  externalCredentialIssuers,
  externalCredentialProducts,
  classes,
  entries,
  horses,
  organization,
  organizationDisciplines,
  organizationDisciplineGoverningBodies,
  sanctioningBodies,
  showDays,
  showScorePaidWarmups,
  slates,
  shows,
  onCreateBlock,
  onCreateBlockTemplate,
  onCreateClassTemplate,
  onCreateClass,
  onCreateSlate,
  onDeleteBlock,
  onDeleteBlockTemplate,
  onDeleteClassTemplate,
  onDeleteClass,
  onDeleteSlate,
  onDeleteShowScorePaidWarmup,
  onSaveShowScorePaidWarmup,
  onUpdateBlock,
  onUpdateBlockTemplate,
  onUpdateClassTemplate,
  onUpdateClass,
  onUpdateSlate,
  onUpdateShowScorePaidWarmup,
  currentUserProfileId,
  onRefresh,
}: {
  locale: Locale;
  blocks: Block[];
  blockConcurrencyGroupMembers: BlockConcurrencyGroupMember[];
  blockJudgeAssignments: BlockJudgeAssignment[];
  classTemplates: ClassTemplate[];
  blockTemplates: BlockTemplate[];
  contacts: Contact[];
  disciplines: Discipline[];
  disciplineCredentialIssuers: DisciplineCredentialIssuer[];
  eligibilityRequirements: EligibilityRequirement[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  externalCredentialProducts: ExternalCredentialProduct[];
  classes: ClassRecord[];
  entries: Entry[];
  horses: Horse[];
  organization: Organization | null;
  organizationDisciplines: OrganizationDiscipline[];
  organizationDisciplineGoverningBodies: OrganizationDisciplineGoverningBody[];
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  showScorePaidWarmups: ShowScorePaidWarmup[];
  slates: Slate[];
  shows: Show[];
  onCreateBlock: (input: Parameters<typeof createBlock>[0]) => Promise<Block>;
  onCreateBlockTemplate: (input: Parameters<typeof createBlockTemplate>[0]) => Promise<void>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreateSlate: (input: Parameters<typeof createSlate>[0]) => Promise<void>;
  onDeleteBlock: (id: string) => Promise<void>;
  onDeleteBlockTemplate: (id: string) => Promise<void>;
  onDeleteClassTemplate: (id: string) => Promise<void>;
  onDeleteClass: (id: string) => Promise<void>;
  onDeleteSlate: (id: Parameters<typeof deleteSlate>[0]) => Promise<void>;
  onDeleteShowScorePaidWarmup: (id: string) => Promise<void>;
  onSaveShowScorePaidWarmup: (input: Parameters<typeof saveShowScorePaidWarmup>[0]) => Promise<void>;
  onUpdateBlock: (id: string, input: Parameters<typeof updateBlock>[1]) => Promise<void>;
  onUpdateBlockTemplate: (id: string, input: Parameters<typeof updateBlockTemplate>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateSlate: (id: string, input: Parameters<typeof updateSlate>[1]) => Promise<void>;
  onUpdateShowScorePaidWarmup: (id: string, input: Parameters<typeof updateShowScorePaidWarmup>[1]) => Promise<void>;
  currentUserProfileId: string;
  onRefresh: () => Promise<void> | void;
}) {
  const [creatingBlockTemplate, setCreatingBlockTemplate] = useState(false);
  const [creatingClassTemplate, setCreatingClassTemplate] = useState<{ templateId?: string } | null>(null);
  const [creatingBlock, setCreatingBlock] = useState<{ mode: "preset" | "custom"; blockTemplateId?: string; showId?: string; showDayId?: string } | null>(null);
  const [creatingEventBlock, setCreatingEventBlock] = useState<{ showId?: string; showDayId?: string } | null>(null);
  const [creatingPaidWarmup, setCreatingPaidWarmup] = useState<{ showId?: string; showDayId?: string } | null>(null);
  const [creatingClass, setCreatingClass] = useState<{ blockId?: string } | null>(null);
  const [creatingSlate, setCreatingSlate] = useState(false);
  const [editingBlockTemplate, setEditingBlockTemplate] = useState<BlockTemplate | null>(null);
  const [editingClassTemplate, setEditingClassTemplate] = useState<ClassTemplate | null>(null);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [editingSlate, setEditingSlate] = useState<Slate | null>(null);
  const [editingPaidWarmup, setEditingPaidWarmup] = useState<ShowScorePaidWarmup | null>(null);
  const [editingRequirements, setEditingRequirements] = useState<{ scopeType: "block" | "class" | "block_template" | "class_template"; id: string; name: string } | null>(null);
  const [expandedShowId, setExpandedShowId] = useState<string | null>(null);
  const [expandedScheduleBlockId, setExpandedScheduleBlockId] = useState<string | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const sortedShows = useMemo(() => [...shows].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name)), [shows]);
  const showDaysByShowId = useMemo(() => {
    const grouped = new Map<string, ShowDay[]>();

    for (const day of showDays) {
      const days = grouped.get(day.show_id) ?? [];
      days.push(day);
      grouped.set(day.show_id, days);
    }

    for (const days of grouped.values()) {
      days.sort((a, b) => a.sort_order - b.sort_order || a.day_date.localeCompare(b.day_date));
    }

    return grouped;
  }, [showDays]);
  const classesByShowDayId = useMemo(() => {
    const grouped = new Map<string, Block[]>();

    for (const block of blocks) {
      if (!block.show_day_id) {
        continue;
      }

      const dayClasses = grouped.get(block.show_day_id) ?? [];
      dayClasses.push(block);
      grouped.set(block.show_day_id, dayClasses);
    }

    for (const dayClasses of grouped.values()) {
      dayClasses.sort(compareScheduleClasses);
    }

    return grouped;
  }, [blocks]);
  const paidWarmupsByShowDayId = useMemo(() => {
    const grouped = new Map<string, ShowScorePaidWarmup[]>();

    for (const warmup of showScorePaidWarmups) {
      if (!warmup.show_day_id) {
        continue;
      }

      const dayWarmups = grouped.get(warmup.show_day_id) ?? [];
      dayWarmups.push(warmup);
      grouped.set(warmup.show_day_id, dayWarmups);
    }

    for (const dayWarmups of grouped.values()) {
      dayWarmups.sort(comparePaidWarmupsForSchedule);
    }

    return grouped;
  }, [showScorePaidWarmups]);
  const classesByBlockId = useMemo(() => {
    const grouped = new Map<string, ClassRecord[]>();

    for (const classRecord of classes) {
      const blockClasses = grouped.get(classRecord.block_id) ?? [];
      blockClasses.push(classRecord);
      grouped.set(classRecord.block_id, blockClasses);
    }

    for (const blockClasses of grouped.values()) {
      blockClasses.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "") || a.name.localeCompare(b.name));
    }

    return grouped;
  }, [classes]);
  const classesByTemplateId = useMemo(() => {
    const grouped = new Map<string, ClassTemplate[]>();

    for (const classRecord of classTemplates) {
      const templateClasses = grouped.get(classRecord.block_template_id) ?? [];
      templateClasses.push(classRecord);
      grouped.set(classRecord.block_template_id, templateClasses);
    }

    for (const templateClasses of grouped.values()) {
      templateClasses.sort((a, b) => a.sort_order - b.sort_order || (a.code ?? "").localeCompare(b.code ?? "") || a.name.localeCompare(b.name));
    }

    return grouped;
  }, [classTemplates]);
  const unassignedClassesByShowId = useMemo(() => {
    const grouped = new Map<string, Block[]>();

    for (const block of blocks) {
      if (block.show_day_id) {
        continue;
      }

      const showClasses = grouped.get(block.show_id) ?? [];
      showClasses.push(block);
      grouped.set(block.show_id, showClasses);
    }

    for (const showClasses of grouped.values()) {
      showClasses.sort(compareScheduleClasses);
    }

    return grouped;
  }, [blocks]);
  const hasActiveBlockTemplates = blockTemplates.some((template) => template.is_active);
  const activeShow = shows[0] ?? null;
  const disciplineLabel = (organizationDisciplineId: string) => {
    const organizationDiscipline = findById(organizationDisciplines, organizationDisciplineId);
    return organizationDiscipline ? findById(disciplines, organizationDiscipline.discipline_id)?.name ?? null : null;
  };

  async function handleDeleteBlockTemplate(template: BlockTemplate) {
    const templateClassCount = classTemplates.filter((classRecord) => classRecord.block_template_id === template.id).length;
    const message = templateClassCount
      ? `Supprimer le bloc récurrent "${template.name}" et ses ${templateClassCount} classe${templateClassCount === 1 ? "" : "s"}?`
      : `Supprimer le bloc récurrent "${template.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteBlockTemplate(template.id);
    if (editingBlockTemplate?.id === template.id) {
      setEditingBlockTemplate(null);
    }
  }

  async function handleDeleteClassTemplate(classRecord: ClassTemplate) {
    if (!window.confirm(`Supprimer la classe récurrente "${classRecord.name}"? Les blocks déjà créées depuis ce bloc récurrent resteront dans leurs blocs.`)) {
      return;
    }

    await onDeleteClassTemplate(classRecord.id);
    if (editingClassTemplate?.id === classRecord.id) {
      setEditingClassTemplate(null);
    }
  }

  async function handleDeleteBlock(block: Block) {
    const blockClasses = classes.filter((classRecord) => classRecord.block_id === block.id);
    const blockClassIds = new Set(blockClasses.map((classRecord) => classRecord.id));
    const entryCount = entries.filter((entry) => blockClassIds.has(entry.class_id)).length;
    const message = [
      `Supprimer le bloc "${block.name}"?`,
      blockClasses.length ? `${blockClasses.length} classe${blockClasses.length === 1 ? " sera supprimee" : "s seront supprimees"}.` : null,
      entryCount ? `${entryCount} inscription${entryCount === 1 ? " liee sera aussi supprimee" : "s liees seront aussi supprimees"}.` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteBlock(block.id);
    if (editingBlock?.id === block.id) {
      setEditingBlock(null);
    }
  }

  async function handleDeletePaidWarmup(warmup: ShowScorePaidWarmup) {
    if (!window.confirm(`Supprimer le paid warmup "${warmup.name}"?`)) {
      return;
    }

    await onDeleteShowScorePaidWarmup(warmup.id);
    if (editingPaidWarmup?.id === warmup.id) {
      setEditingPaidWarmup(null);
    }
  }

  async function handleDeleteClass(classRecord: ClassRecord) {
    const entryCount = entries.filter((entry) => entry.class_id === classRecord.id).length;
    const message = entryCount
      ? `Supprimer la classe "${classRecord.name}"? ${entryCount} inscription${entryCount === 1 ? " liee sera aussi supprimee" : "s liees seront aussi supprimees"}.`
      : `Supprimer la classe "${classRecord.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteClass(classRecord.id);
    if (editingClass?.id === classRecord.id) {
      setEditingClass(null);
    }
  }

  async function handleDeleteSlate(slate: Slate) {
    const linkedBlockCount = blocks.filter((block) => block.slate_id === slate.id).length;
    const message = linkedBlockCount
      ? `Supprimer la slate "${slate.name}"? Ses ${linkedBlockCount} bloc${linkedBlockCount === 1 ? "" : "s"} resteront au programme sans slate.`
      : `Supprimer la slate "${slate.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteSlate(slate.id);
    if (editingSlate?.id === slate.id) {
      setEditingSlate(null);
    }
  }

  async function handleMoveScheduleBlock(block: Block, dayClasses: Block[], direction: -1 | 1) {
    if (!canManuallyOrderClass(block)) {
      return;
    }

    const movableClasses = dayClasses.filter(canManuallyOrderClass).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const currentIndex = movableClasses.findIndex((candidate) => candidate.id === block.id);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= movableClasses.length) {
      return;
    }

    const nextOrder = [...movableClasses];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];

    await Promise.all(nextOrder.map((candidate, index) => onUpdateBlock(candidate.id, { sort_order: (index + 1) * 10 })));
  }

  function renderScheduleBlock(block: Block, dayClasses: Block[]) {
    if (block.block_type !== "competition") {
      return renderEventBlock(block, dayClasses);
    }

    const blockClasses = classesByBlockId.get(block.id) ?? [];
    const isExpanded = expandedScheduleBlockId === block.id;
    const movableClasses = dayClasses.filter(canManuallyOrderClass).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const movableIndex = movableClasses.findIndex((candidate) => candidate.id === block.id);
    const canMove = canManuallyOrderClass(block) && movableIndex >= 0;
    const blockJudges = blockJudgeAssignments.filter((assignment) => assignment.block_id === block.id);
    const concurrencyMembership = blockConcurrencyGroupMembers.find((member) => member.block_id === block.id);
    const concurrentBlockNames = concurrencyMembership
      ? blockConcurrencyGroupMembers
          .filter((member) => member.group_id === concurrencyMembership.group_id && member.block_id !== block.id)
          .map((member) => findById(blocks, member.block_id)?.name)
          .filter(Boolean)
      : [];

    return (
      <article className={`schedule-block ${isExpanded ? "expanded" : ""}`} key={block.id}>
        <div className="schedule-block-header">
          <button aria-expanded={isExpanded} className="schedule-block-trigger" type="button" onClick={() => setExpandedScheduleBlockId(isExpanded ? null : block.id)}>
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>
              <strong>{block.name}</strong>
              <span className="muted-line">
                {[
                  blockClasses.length ? uiText(locale, `${blockClasses.length} classe${blockClasses.length === 1 ? "" : "s"}`, `${blockClasses.length} class${blockClasses.length === 1 ? "" : "es"}`) : uiText(locale, "Aucune classe", "No blocks"),
                  classScheduleStartLabel(block, locale),
                  block.display_label,
                  block.slate_id ? `${uiText(locale, "Slate", "Slate")}: ${findById(slates, block.slate_id)?.name ?? uiText(locale, "inconnue", "unknown")}` : null,
                  block.pattern ? `Pattern ${showScorePatternLabel(block.pattern)}` : null,
                ]
                  .filter(Boolean)
                  .join(" - ")}
              </span>
            </span>
          </button>
          <div className="row-actions schedule-block-actions">
            {canMove ? (
              <div className="schedule-order-actions">
                <button className="icon-button" disabled={movableIndex <= 0} title={uiText(locale, "Monter", "Move up")} type="button" onClick={() => handleMoveScheduleBlock(block, dayClasses, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="icon-button" disabled={movableIndex >= movableClasses.length - 1} title={uiText(locale, "Descendre", "Move down")} type="button" onClick={() => handleMoveScheduleBlock(block, dayClasses, 1)}>
                  <ArrowDown size={16} />
                </button>
              </div>
            ) : null}
            <button className="text-button" type="button" onClick={() => setEditingBlock(block)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button" type="button" onClick={() => setEditingRequirements({ scopeType: "block", id: block.id, name: block.name })}>
              {uiText(locale, "Exigences", "Requirements")}
            </button>
            <button className="text-button" type="button" onClick={() => setCreatingClass({ blockId: block.id })}>
              {uiText(locale, "+ Classe", "+ Class")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeleteBlock(block)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
        <div className="schedule-block-meta">
          <span>
            {[
              classEntriesCloseLabel(block),
              block.arena,
              concurrentBlockNames.length ? `${uiText(locale, "Concurrent avec", "Concurrent with")}: ${concurrentBlockNames.join(", ")}` : null,
              blockJudges.length
                ? `${uiText(locale, blockJudges.length === 1 ? "Juge" : "Juges", blockJudges.length === 1 ? "Judge" : "Judges")}: ${blockJudges.map((assignment) => assignment.display_name).join(", ")}`
                : block.judge_display_name
                  ? `${uiText(locale, "Juge", "Judge")}: ${block.judge_display_name}`
                  : null,
            ]
              .filter(Boolean)
              .join(" - ") || uiText(locale, "Paramètres du bloc", "Block settings")}
          </span>
        </div>
        {isExpanded ? (
          <div className="schedule-class-list">
            {blockClasses.map((classRecord) => (
              <div className="schedule-class-row" key={classRecord.id}>
                <div>
                  <strong>{classRecord.name}</strong>
                  <span className="muted-line">
                    {[
                      classRecord.code ? `#${classRecord.code}` : null,
                      disciplineLabel(classRecord.organization_discipline_id),
                      hasGoverningBodyCode(classRecord.governing_body_assignments, "NRHA") ? nrhaClassTypeLabel(nrhaClassTypeFromAssignments(classRecord.governing_body_assignments)) || uiText(locale, "Type NRHA à préciser", "NRHA type required") : null,
                      classRecord.entry_fee == null ? uiText(locale, "Frais classe", "Class fee") : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(classRecord.entry_fee, organization?.currency ?? "CAD")}`,
                      classRecord.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(classRecord.judge_fee, organization?.currency ?? "CAD")}`,
                      payoutClassSummary(classRecord, locale),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                <span>{sanctionLabel(classRecord.governing_body_assignments, locale)}</span>
                <div className="row-actions schedule-class-actions">
                  <button className="text-button" type="button" onClick={() => setEditingClass(classRecord)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button" type="button" onClick={() => setEditingRequirements({ scopeType: "class", id: classRecord.id, name: classRecord.name })}>
                    {uiText(locale, "Exigences", "Requirements")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteClass(classRecord)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            ))}
            {!blockClasses.length ? <EmptyState label={uiText(locale, "Clique + Classe pour ajouter une classe dans ce bloc.", "Click + Class to add a class to this block.")} /> : null}
          </div>
        ) : null}
      </article>
    );
  }

  function renderEventBlock(block: Block, dayClasses: Block[]) {
    const movableClasses = dayClasses.filter(canManuallyOrderClass).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const movableIndex = movableClasses.findIndex((candidate) => candidate.id === block.id);
    const canMove = canManuallyOrderClass(block) && movableIndex >= 0;
    const timeLabel = block.scheduled_time ? block.scheduled_time.slice(0, 5) : null;

    return (
      <article className="schedule-block schedule-event-block" key={block.id}>
        <div className="schedule-block-header">
          <div className="schedule-block-trigger schedule-event-trigger">
            <Clock size={18} />
            <span>
              <strong>{block.name}</strong>
              <span className="muted-line">
                {[
                  block.display_label,
                  timeLabel,
                ]
                  .filter(Boolean)
                  .join(" - ") || uiText(locale, "Événement", "Event")}
              </span>
            </span>
          </div>
          <div className="row-actions schedule-block-actions">
            {canMove ? (
              <div className="schedule-order-actions">
                <button className="icon-button" disabled={movableIndex <= 0} title={uiText(locale, "Monter", "Move up")} type="button" onClick={() => handleMoveScheduleBlock(block, dayClasses, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="icon-button" disabled={movableIndex >= movableClasses.length - 1} title={uiText(locale, "Descendre", "Move down")} type="button" onClick={() => handleMoveScheduleBlock(block, dayClasses, 1)}>
                  <ArrowDown size={16} />
                </button>
              </div>
            ) : null}
            <button className="text-button" type="button" onClick={() => setEditingBlock(block)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeleteBlock(block)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderPaidWarmupBlock(warmup: ShowScorePaidWarmup) {
    const timeLabel = formatPaidWarmupSchedule(warmup, locale);

    return (
      <article className="schedule-block schedule-event-block paid-warmup-schedule-block" key={warmup.id}>
        <div className="schedule-block-header">
          <div className="schedule-block-trigger schedule-event-trigger">
            <Clock size={18} />
            <span>
              <strong>{warmup.name}</strong>
              <span className="muted-line">
                {[
                  "Paid warmup",
                  warmup.arena,
                  timeLabel,
                  uiText(locale, `${warmup.entries.length} inscription${warmup.entries.length === 1 ? "" : "s"}`, `${warmup.entries.length} entr${warmup.entries.length === 1 ? "y" : "ies"}`),
                ]
                  .filter(Boolean)
                  .join(" - ")}
              </span>
            </span>
          </div>
          <div className="row-actions schedule-block-actions">
            <button className="text-button" type="button" onClick={() => setEditingPaidWarmup(warmup)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeletePaidWarmup(warmup)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
        <div className="schedule-block-meta">
          <span>{warmup.is_public_live ? uiText(locale, "Live public", "Public live") : uiText(locale, "Privé ShowScore", "Private ShowScore")}</span>
          <span>{formatPaidWarmupPacing(warmup, locale)}</span>
        </div>
      </article>
    );
  }

  function renderRecurringBlock(template: BlockTemplate) {
    const templateClasses = classesByTemplateId.get(template.id) ?? [];
    const isExpanded = expandedTemplateId === template.id;

    return (
      <article className={`recurring-block ${isExpanded ? "expanded" : ""}`} key={template.id}>
        <div className="recurring-block-header">
          <button aria-expanded={isExpanded} className="recurring-block-trigger" type="button" onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}>
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>
              <strong>{template.name}</strong>
              <span className="muted-line">
                {[
                  templateClasses.length ? uiText(locale, `${templateClasses.length} classe${templateClasses.length === 1 ? "" : "s"}`, `${templateClasses.length} class${templateClasses.length === 1 ? "" : "es"}`) : uiText(locale, "Aucune classe", "No blocks"),
                  template.block_label,
                  template.category,
                  template.pattern ? `Pattern ${showScorePatternLabel(template.pattern)}` : null,
                ]
                  .filter(Boolean)
                  .join(" - ") || template.code || uiText(locale, "Bloc récurrent", "Recurring block")}
              </span>
            </span>
          </button>
          <div className="row-actions recurring-block-actions">
            <button className="text-button" disabled={!organization || !shows.length || !template.is_active} type="button" onClick={() => setCreatingBlock({ mode: "preset", blockTemplateId: template.id })}>
              {uiText(locale, "Utiliser", "Use")}
            </button>
            <button className="text-button" type="button" onClick={() => setEditingBlockTemplate(template)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button" type="button" onClick={() => setEditingRequirements({ scopeType: "block_template", id: template.id, name: template.name })}>
              {uiText(locale, "Exigences", "Requirements")}
            </button>
            <button className="text-button" type="button" onClick={() => setCreatingClassTemplate({ templateId: template.id })}>
              {uiText(locale, "+ Classe", "+ Class")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeleteBlockTemplate(template)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
        {isExpanded ? (
          <div className="schedule-class-list">
            {templateClasses.map((classRecord) => (
              <div className="schedule-class-row recurring-class-row" key={classRecord.id}>
                <div>
                  <strong>{classRecord.name}</strong>
                  <span className="muted-line">
                    {[
                      classRecord.code ? `#${classRecord.code}` : uiText(locale, "Sans code", "No code"),
                      disciplineLabel(classRecord.organization_discipline_id),
                      hasGoverningBodyCode(classRecord.governing_body_assignments, "NRHA") ? nrhaClassTypeLabel(nrhaClassTypeFromAssignments(classRecord.governing_body_assignments)) || uiText(locale, "Type NRHA à préciser", "NRHA type required") : null,
                      classRecord.default_entry_fee == null ? null : `${uiText(locale, "Insc.", "Entry")} ${formatCurrency(classRecord.default_entry_fee, organization?.currency ?? "CAD")}`,
                      classRecord.default_judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(classRecord.default_judge_fee, organization?.currency ?? "CAD")}`,
                      payoutTemplateClassSummary(classRecord, locale),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                <span>{sanctionLabel(classRecord.governing_body_assignments, locale)}</span>
                <div className="row-actions schedule-class-actions">
                  <button className="text-button" type="button" onClick={() => setEditingClassTemplate(classRecord)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button" type="button" onClick={() => setEditingRequirements({ scopeType: "class_template", id: classRecord.id, name: classRecord.name })}>
                    {uiText(locale, "Exigences", "Requirements")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteClassTemplate(classRecord)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            ))}
            {!templateClasses.length ? <EmptyState label={uiText(locale, "Ajoute les blocks qui reviennent avec ce bloc.", "Add the blocks that recur with this block.")} /> : null}
          </div>
        ) : null}
      </article>
    );
  }

  function requirementEditorContext(target: { scopeType: "block" | "class" | "block_template" | "class_template"; id: string }) {
    const targetClasses = target.scopeType === "block"
      ? classes.filter((classRecord) => classRecord.block_id === target.id)
      : target.scopeType === "class"
        ? classes.filter((classRecord) => classRecord.id === target.id)
        : target.scopeType === "block_template"
          ? classTemplates.filter((classRecord) => classRecord.block_template_id === target.id)
          : classTemplates.filter((classRecord) => classRecord.id === target.id);
    const directoryIds = Array.from(new Set(targetClasses.map((classRecord) => classRecord.organization_discipline_id)));
    const disciplineIds = Array.from(new Set(directoryIds.map((directoryId) => organizationDisciplines.find((directory) => directory.id === directoryId)?.discipline_id).filter((id): id is string => Boolean(id))));
    const blockId = target.scopeType === "class" ? (targetClasses[0] as ClassRecord | undefined)?.block_id : target.scopeType === "block" ? target.id : null;
    const blockTemplateId = target.scopeType === "class_template" ? (targetClasses[0] as ClassTemplate | undefined)?.block_template_id : target.scopeType === "block_template" ? target.id : null;
    const inheritedRequirements = eligibilityRequirements.filter((requirement) =>
      requirement.is_active && requirement.is_required && (
        (requirement.scope_type === "organization_discipline" && Boolean(requirement.organization_discipline_id) && directoryIds.includes(requirement.organization_discipline_id!))
        || (target.scopeType === "class" && requirement.scope_type === "block" && requirement.block_id === blockId)
        || (target.scopeType === "class_template" && requirement.scope_type === "block_template" && requirement.block_template_id === blockTemplateId)
      ));
    const ownRequirements = eligibilityRequirements.filter((requirement) =>
      (target.scopeType === "block" && requirement.scope_type === "block" && requirement.block_id === target.id)
      || (target.scopeType === "class" && requirement.scope_type === "class" && requirement.class_id === target.id)
      || (target.scopeType === "block_template" && requirement.scope_type === "block_template" && requirement.block_template_id === target.id)
      || (target.scopeType === "class_template" && requirement.scope_type === "class_template" && requirement.class_template_id === target.id));
    return { disciplineIds, inheritedRequirements, ownRequirements };
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Horaire", "Schedule")}
        title={uiText(locale, "Horaire par journées", "Schedule by day")}
        description={uiText(locale, "Place les blocs dans les journées du concours, puis gère les classes directement dans chaque bloc.", "Place blocks inside show days, then manage the classes directly inside each block.")}
        stats={[
          { label: uiText(locale, "Journées", "Days"), value: String(showDays.length) },
          { label: uiText(locale, "Blocs", "Blocks"), value: String(blocks.length) },
          { label: uiText(locale, "Classes", "Classes"), value: String(classes.length) },
          { label: "Slates", value: String(slates.length) },
          { label: "Paid warmups", value: String(showScorePaidWarmups.length) },
        ]}
      />

      {creatingBlockTemplate ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Catalogue réutilisable de l'association.", "Reusable association catalog.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouveau bloc récurrent", "New recurring block")} onClose={() => setCreatingBlockTemplate(false)}>
          <BlockTemplateForm
            locale={locale}
            organization={organization}
            onCreateBlockTemplate={onCreateBlockTemplate}
            onCreated={() => setCreatingBlockTemplate(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingClassTemplate ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Classe régulière rattachée à un bloc récurrent.", "Reusable class attached to a recurring block.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Classe de bloc récurrent", "Recurring block class")} onClose={() => setCreatingClassTemplate(null)}>
          <ClassTemplateForm
            locale={locale}
            blockTemplates={blockTemplates}
            defaultTemplateId={creatingClassTemplate.templateId}
            disciplines={disciplines}
            organization={organization}
            organizationDisciplines={organizationDisciplines}
            organizationDisciplineGoverningBodies={organizationDisciplineGoverningBodies}
            sanctioningBodies={sanctioningBodies}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreated={() => setCreatingClassTemplate(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingBlock ? (
        <ModalDialog className="class-program-modal" description={creatingBlock.mode === "preset" ? uiText(locale, "Choisis un bloc récurrent de l'association.", "Choose an association recurring block.") : uiText(locale, "Crée un bloc libre pour une journée du concours.", "Create a custom block for a show day.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={creatingBlock.mode === "preset" ? uiText(locale, "Nouveau bloc depuis un bloc récurrent", "New block from recurring block") : uiText(locale, "Nouveau bloc libre", "New custom block")} onClose={() => setCreatingBlock(null)}>
          <BlockForm
            locale={locale}
            blocks={blocks}
            classTemplates={classTemplates}
            blockTemplates={blockTemplates}
            defaultMode={creatingBlock.mode}
            defaultTemplateId={creatingBlock.blockTemplateId}
            defaultShowDayId={creatingBlock.showDayId}
            defaultShowId={creatingBlock.showId}
            organization={organization}
            showDays={showDays}
            slates={slates}
            shows={shows}
            onCreateBlock={onCreateBlock}
            onCreateClass={onCreateClass}
            onCreated={() => setCreatingBlock(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingEventBlock ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Ajoute un bloc non-classe dans l'horaire.", "Add a non-class event to the schedule.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouvel événement", "New event")} onClose={() => setCreatingEventBlock(null)}>
          <EventBlockForm
            locale={locale}
            defaultShowDayId={creatingEventBlock.showDayId}
            defaultShowId={creatingEventBlock.showId}
            organization={organization}
            showDays={showDays}
            shows={shows}
            onCreateBlock={onCreateBlock}
            onCreated={() => setCreatingEventBlock(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingPaidWarmup ? (
        <ModalDialog className="class-program-modal paid-warmup-program-modal" description={uiText(locale, "Ajoute un paid warmup ShowScore directement à la journée, sans créer de classe.", "Add a ShowScore paid warmup directly to the day without creating a class.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouveau paid warmup", "New paid warmup")} onClose={() => setCreatingPaidWarmup(null)}>
          <PaidWarmupForm
            blocks={blocks}
            contacts={contacts}
            defaultShowDayId={creatingPaidWarmup.showDayId}
            defaultShowId={creatingPaidWarmup.showId}
            classes={classes}
            entries={entries}
            horses={horses}
            locale={locale}
            organization={organization}
            showDays={showDays}
            showScorePaidWarmups={showScorePaidWarmups}
            shows={shows}
            onCancel={() => setCreatingPaidWarmup(null)}
            onSaveShowScorePaidWarmup={onSaveShowScorePaidWarmup}
            onSaved={() => setCreatingPaidWarmup(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingClass ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Ajoute une classe d'inscription sous un bloc existant.", "Add an entry class under an existing block.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouvelle classe", "New class")} onClose={() => setCreatingClass(null)}>
          <ClassForm locale={locale} blocks={blocks} defaultBlockId={creatingClass.blockId} disciplines={disciplines} organization={organization} organizationDisciplines={organizationDisciplines} organizationDisciplineGoverningBodies={organizationDisciplineGoverningBodies} sanctioningBodies={sanctioningBodies} shows={shows} onCreateClass={onCreateClass} onCreated={() => setCreatingClass(null)} />
        </ModalDialog>
      ) : null}

      {creatingSlate ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Regroupe les blocs transmis ensemble à un organisme de régie.", "Group blocks reported together to a governing body.")} eyebrow={uiText(locale, "Programme", "Program")} title={uiText(locale, "Nouvelle slate", "New slate")} onClose={() => setCreatingSlate(false)}>
          <SlateForm
            locale={locale}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            show={activeShow}
            onCancel={() => setCreatingSlate(false)}
            onCreateSlate={async (input) => {
              await onCreateSlate(input);
              setCreatingSlate(false);
            }}
            onUpdateSlate={onUpdateSlate}
          />
        </ModalDialog>
      ) : null}

      {editingBlockTemplate ? (
        <ModalDialog className="class-program-modal" description={editingBlockTemplate.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le bloc récurrent", "Edit recurring block")} onClose={() => setEditingBlockTemplate(null)}>
          <BlockTemplateEditForm
            locale={locale}
            blockTemplate={editingBlockTemplate}
            onCancel={() => setEditingBlockTemplate(null)}
            onUpdateBlockTemplate={async (id, input) => {
              await onUpdateBlockTemplate(id, input);
              setEditingBlockTemplate(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingClassTemplate ? (
        <ModalDialog className="class-program-modal" description={editingClassTemplate.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier la classe récurrente", "Edit recurring class")} onClose={() => setEditingClassTemplate(null)}>
          <ClassTemplateEditForm
            locale={locale}
            blockTemplates={blockTemplates}
            classTemplate={editingClassTemplate}
            disciplines={disciplines}
            organizationDisciplines={organizationDisciplines}
            organizationDisciplineGoverningBodies={organizationDisciplineGoverningBodies}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClassTemplate(null)}
            onUpdateClassTemplate={async (id, input) => {
              await onUpdateClassTemplate(id, input);
              setEditingClassTemplate(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingBlock ? (
        <ModalDialog className="class-program-modal" description={editingBlock.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le bloc", "Edit block")} onClose={() => setEditingBlock(null)}>
          <BlockEditForm
            locale={locale}
            block={editingBlock}
            blocks={blocks}
            blockConcurrencyGroupMembers={blockConcurrencyGroupMembers}
            showDays={showDays}
            slates={slates}
            onCancel={() => setEditingBlock(null)}
            onUpdateBlock={async (id, input) => {
              await onUpdateBlock(id, input);
              setEditingBlock(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingRequirements && organization ? (() => {
        const editorContext = requirementEditorContext(editingRequirements);
        return <ModalDialog className="class-program-modal" description={editingRequirements.name} eyebrow={uiText(locale, "Admissibilité", "Eligibility")} title={editingRequirements.scopeType === "block" || editingRequirements.scopeType === "block_template" ? uiText(locale, "Exigences du bloc", "Block requirements") : uiText(locale, "Exigences de la classe", "Class requirements")} onClose={() => setEditingRequirements(null)}>
          <EligibilityRequirementsEditor
            createdByUserId={currentUserProfileId}
            disciplineCredentialIssuers={disciplineCredentialIssuers}
            disciplineIds={editorContext.disciplineIds}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={externalCredentialProducts}
            inheritedRequirements={editorContext.inheritedRequirements}
            organization={organization}
            ownRequirements={editorContext.ownRequirements}
            scopeId={editingRequirements.id}
            scopeType={editingRequirements.scopeType}
            onRefresh={onRefresh}
          />
        </ModalDialog>;
      })() : null}

      {editingClass ? (
        <ModalDialog className="class-program-modal" description={editingClass.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier la classe", "Edit class")} onClose={() => setEditingClass(null)}>
          <ClassEditForm
            locale={locale}
            blocks={blocks}
            classRecord={editingClass}
            disciplines={disciplines}
            organizationDisciplines={organizationDisciplines}
            organizationDisciplineGoverningBodies={organizationDisciplineGoverningBodies}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClass(null)}
            onUpdateClass={async (id, input) => {
              await onUpdateClass(id, input);
              setEditingClass(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingSlate ? (
        <ModalDialog className="class-program-modal" description={editingSlate.name} eyebrow={uiText(locale, "Programme", "Program")} title={uiText(locale, "Modifier la slate", "Edit slate")} onClose={() => setEditingSlate(null)}>
          <SlateForm
            locale={locale}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            show={findById(shows, editingSlate.show_id) ?? null}
            slate={editingSlate}
            onCancel={() => setEditingSlate(null)}
            onCreateSlate={onCreateSlate}
            onUpdateSlate={async (id, input) => {
              await onUpdateSlate(id, input);
              setEditingSlate(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingPaidWarmup ? (
        <ModalDialog className="class-program-modal paid-warmup-program-modal" description={editingPaidWarmup.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le paid warmup", "Edit paid warmup")} onClose={() => setEditingPaidWarmup(null)}>
          <PaidWarmupForm
            blocks={blocks}
            contacts={contacts}
            classes={classes}
            entries={entries}
            horses={horses}
            locale={locale}
            organization={organization}
            showDays={showDays}
            showScorePaidWarmups={showScorePaidWarmups}
            shows={shows}
            warmup={editingPaidWarmup}
            onCancel={() => setEditingPaidWarmup(null)}
            onSaveShowScorePaidWarmup={onSaveShowScorePaidWarmup}
            onUpdateShowScorePaidWarmup={onUpdateShowScorePaidWarmup}
            onSaved={() => setEditingPaidWarmup(null)}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Slates</h2>
            <p>{uiText(locale, "Une slate regroupe les blocs déclarés ensemble à un organisme de régie; elle ne change pas l'horaire ShowScore.", "A slate groups blocks reported together to a governing body; it does not change the ShowScore schedule.")}</p>
          </div>
          <button className="primary-button" disabled={!organization || !activeShow} type="button" onClick={() => setCreatingSlate(true)}>
            <Plus size={18} />
            {uiText(locale, "Nouvelle slate", "New slate")}
          </button>
        </div>
        <div className="recurring-block-list">
          {slates.map((slate) => {
            const governingBody = sanctioningBodies.find((body) => body.id === slate.governing_body_id);
            const linkedBlockCount = blocks.filter((block) => block.slate_id === slate.id).length;

            return (
              <article className="recurring-block" key={slate.id}>
                <div>
                  <strong>{slate.name}</strong>
                  <span className="muted-line">
                    {[
                      governingBody ? `${governingBody.code} — ${governingBody.name}` : uiText(locale, "Slate maison / interne", "House / internal slate"),
                      slate.technical_number ? `${uiText(locale, "No technique", "Technical no.")} ${slate.technical_number}` : null,
                      uiText(locale, `${linkedBlockCount} bloc${linkedBlockCount === 1 ? "" : "s"}`, `${linkedBlockCount} block${linkedBlockCount === 1 ? "" : "s"}`),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="text-button" type="button" onClick={() => setEditingSlate(slate)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteSlate(slate)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </article>
            );
          })}
          {!slates.length ? <EmptyState label={uiText(locale, "Aucune slate pour ce concours. Les blocs peuvent rester sans slate.", "No slate for this show. Blocks may remain without a slate.")} /> : null}
        </div>
      </section>

      <section className="panel span-2 schedule-days-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Journées du concours", "Show days")}</h2>
            <p>{uiText(locale, "Chaque show garde ses journées issues des dates; les blocs se placent ensuite dans la bonne journée.", "Each show keeps the days generated from its dates; blocks are then placed in the right day.")}</p>
          </div>
        </div>
        <div className="show-schedule-list">
          {sortedShows.map((show) => {
            const showDaysForShow = showDaysByShowId.get(show.id) ?? [];
            const unassignedClasses = unassignedClassesByShowId.get(show.id) ?? [];
            const showClassCount = showDaysForShow.reduce((total, day) => total + (classesByShowDayId.get(day.id)?.length ?? 0), unassignedClasses.length);
            const isShowExpanded = expandedShowId === show.id;

            return (
              <div className={`show-schedule-group ${isShowExpanded ? "expanded" : ""}`} key={show.id}>
                <div className="show-schedule-header">
                  <button aria-expanded={isShowExpanded} className="show-schedule-trigger" type="button" onClick={() => setExpandedShowId(isShowExpanded ? null : show.id)}>
                    {isShowExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span>
                      <strong>{show.name}</strong>
                      <span className="muted-line">
                        {[
                          uiText(locale, `${showDaysForShow.length} journée${showDaysForShow.length === 1 ? "" : "s"}`, `${showDaysForShow.length} day${showDaysForShow.length === 1 ? "" : "s"}`),
                          uiText(locale, `${showClassCount} bloc${showClassCount === 1 ? "" : "s"}`, `${showClassCount} block${showClassCount === 1 ? "" : "s"}`),
                        ].join(" - ")}
                      </span>
                    </span>
                  </button>
                  <span className="schedule-count-pill">
                    {showStatusLabel(show.status, locale)}
                  </span>
                </div>
                {isShowExpanded ? (
                  <div className="show-schedule-body">
                    <div className="show-schedule-details">
                      <span>{show.start_date === show.end_date ? formatDate(show.start_date) : `${formatDate(show.start_date)} - ${formatDate(show.end_date)}`}</span>
                      {show.venue ? <span>{show.venue}</span> : null}
                      {show.location ? <span>{show.location}</span> : null}
                    </div>
                    <div className="schedule-day-list">
                      {showDaysForShow.map((day) => {
                        const dayClasses = classesByShowDayId.get(day.id) ?? [];
                        const dayPaidWarmups = paidWarmupsByShowDayId.get(day.id) ?? [];
                        const dayScheduleItems = buildDayScheduleItems(dayClasses, dayPaidWarmups);

                        return (
                          <article className="schedule-day" key={day.id}>
                            <div className="schedule-day-header">
                              <div>
                                <span className="schedule-day-date">
                                  <CalendarDays size={18} />
                                  {showDayLabel(day)}
                                </span>
                                <span className="muted-line">
                                  {day.start_time ? `${uiText(locale, "Début", "Start")} ${day.start_time.slice(0, 5)}` : uiText(locale, "Début à préciser", "Start to confirm")}
                                </span>
                              </div>
                              <div className="row-actions schedule-day-actions">
                                <button className="primary-button" disabled={!organization || !hasActiveBlockTemplates} type="button" onClick={() => setCreatingBlock({ mode: "preset", showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  {uiText(locale, "Bloc récurrent", "Recurring block")}
                                </button>
                                <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingBlock({ mode: "custom", showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  {uiText(locale, "Bloc libre", "Custom block")}
                                </button>
                                <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingEventBlock({ showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  {uiText(locale, "Événement", "Event")}
                                </button>
                                <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingPaidWarmup({ showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  Paid warmup
                                </button>
                              </div>
                            </div>
                            <div className="schedule-block-list">
                              {dayScheduleItems.map((item) =>
                                item.type === "class"
                                  ? renderScheduleBlock(item.block, dayClasses)
                                  : renderPaidWarmupBlock(item.warmup)
                              )}
                              {!dayScheduleItems.length ? <EmptyState label={uiText(locale, "Aucun bloc dans cette journée.", "No block in this day.")} /> : null}
                            </div>
                          </article>
                        );
                      })}
                      {!showDaysForShow.length ? <EmptyState label={uiText(locale, "Aucune journée n'est générée pour ce show.", "No day has been generated for this show.")} /> : null}
                      {unassignedClasses.length ? (
                        <article className="schedule-day schedule-day-unassigned">
                          <div className="schedule-day-header">
                            <div>
                              <span className="schedule-day-date">{uiText(locale, "Blocs à placer", "Blocks to place")}</span>
                              <span className="muted-line">{uiText(locale, "Ces blocs existent, mais ne sont pas encore rattachés à une journée.", "These blocks exist, but are not attached to a day yet.")}</span>
                            </div>
                          </div>
                          <div className="schedule-block-list">{unassignedClasses.map((block) => renderScheduleBlock(block, unassignedClasses))}</div>
                        </article>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!sortedShows.length ? <EmptyState label={uiText(locale, "Crée un show pour générer ses journées.", "Create a show to generate its days.")} /> : null}
        </div>
      </section>

      <section className="panel span-2 recurring-catalog-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Blocs de classes récurrents", "Recurring class blocks")}</h2>
            <p>{uiText(locale, "Catalogue de l'association, réutilisable dans n'importe quel show.", "Association catalog, reusable in any show.")}</p>
          </div>
          <div className="row-actions">
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingBlockTemplate(true)}>
              <Plus size={18} />
              {uiText(locale, "Bloc récurrent", "Recurring block")}
            </button>
            <button className="ghost-button" disabled={!organization || !blockTemplates.length} type="button" onClick={() => setCreatingClassTemplate({})}>
              <Plus size={18} />
              {uiText(locale, "Classe récurrente", "Recurring class")}
            </button>
          </div>
        </div>
        <div className="recurring-block-list">
          {blockTemplates.map(renderRecurringBlock)}
          {!blockTemplates.length ? <EmptyState label={uiText(locale, "Crée le premier bloc récurrent de cette association.", "Create the first recurring block for this association.")} /> : null}
        </div>
      </section>
    </div>
  );
}

type DayScheduleItem =
  | { type: "class"; block: Block }
  | { type: "paidWarmup"; warmup: ShowScorePaidWarmup };

function buildDayScheduleItems(blocks: Block[], paidWarmups: ShowScorePaidWarmup[]): DayScheduleItem[] {
  return [
    ...blocks.map((block) => ({ type: "class" as const, block })),
    ...paidWarmups.map((warmup) => ({ type: "paidWarmup" as const, warmup })),
  ].sort(compareDayScheduleItems);
}

function compareDayScheduleItems(first: DayScheduleItem, second: DayScheduleItem) {
  const firstTime = scheduleItemTime(first);
  const secondTime = scheduleItemTime(second);

  if (firstTime && secondTime && firstTime !== secondTime) {
    return firstTime.localeCompare(secondTime);
  }

  if (firstTime && !secondTime) {
    return -1;
  }

  if (!firstTime && secondTime) {
    return 1;
  }

  return scheduleItemSortOrder(first) - scheduleItemSortOrder(second) || scheduleItemName(first).localeCompare(scheduleItemName(second));
}

function scheduleItemTime(item: DayScheduleItem) {
  return item.type === "class" ? item.block.scheduled_time : item.warmup.schedule_start_time;
}

function scheduleItemSortOrder(item: DayScheduleItem) {
  return item.type === "class" ? item.block.sort_order : item.warmup.sort_order;
}

function scheduleItemName(item: DayScheduleItem) {
  return item.type === "class" ? item.block.name : item.warmup.name;
}

function comparePaidWarmupsForSchedule(first: ShowScorePaidWarmup, second: ShowScorePaidWarmup) {
  return (
    (first.schedule_start_time || "").localeCompare(second.schedule_start_time || "") ||
    first.sort_order - second.sort_order ||
    first.name.localeCompare(second.name)
  );
}

function formatPaidWarmupSchedule(warmup: ShowScorePaidWarmup, locale: Locale) {
  if (warmup.schedule_start_mode === "after_previous") {
    return uiText(locale, "Après le bloc précédent", "After previous block");
  }

  return warmup.schedule_start_time || uiText(locale, "Départ à préciser", "Start to confirm");
}

function formatPaidWarmupPacing(warmup: ShowScorePaidWarmup, locale: Locale) {
  const drag = warmup.drag_interval ? uiText(locale, `drag aux ${warmup.drag_interval}`, `drag every ${warmup.drag_interval}`) : uiText(locale, "drag manuel", "manual drag");
  return `${warmup.duration_minutes_per_rider} min / rider - ${drag} - ${warmup.drag_duration_minutes} min`;
}

export { ClassesView };
