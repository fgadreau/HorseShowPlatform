import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Clock, Plus } from "lucide-react";
import { EmptyState, ModalDialog, SearchSelect, ViewIntro } from "../../components/ui";
import { divisionLabel, findById, formatCurrency, formatDate, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createClass, createClassTemplate, createClassTemplateDivision, createDivision, deleteClass, deleteClassTemplate, deleteClassTemplateDivision, deleteDivision, updateClass, updateClassTemplate, updateClassTemplateDivision, updateDivision } from "../../services/supabaseServices";
import type { ClassRecord, ClassTemplate, ClassTemplateDivision, Division, Entry, EligibilityRules, Organization, SanctioningBody, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { ClassForm } from "./ClassForm";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { ClassTemplateDivisionForm } from "./ClassTemplateDivisionForm";
import { ClassTemplateEditForm } from "./ClassTemplateEditForm";
import { ClassTemplateDivisionEditForm } from "./ClassTemplateDivisionEditForm";
import { DivisionForm } from "./DivisionForm";
import { ClassEditForm } from "./ClassEditForm";
import { DivisionEditForm } from "./DivisionEditForm";
import { EventBlockForm } from "./EventBlockForm";
import { sanctionLabel, payoutDivisionSummary, payoutTemplateDivisionSummary, classScheduleStartLabel, compareScheduleClasses, showDayLabel, classEntriesCloseLabel, showPaymentSummary, showStatusLabel, canManuallyOrderClass, backNumberPolicyLabel, concurrentClassLabel, isNrhaSanctioned, nrhaClassTypeLabel, nrhaClassTypeFromRules } from "./classUtils";

function ClassesView({
  locale,
  classes,
  classTemplateDivisions,
  classTemplates,
  divisions,
  entries,
  organization,
  sanctioningBodies,
  showDays,
  shows,
  onCreateClass,
  onCreateClassTemplate,
  onCreateClassTemplateDivision,
  onCreateDivision,
  onDeleteClass,
  onDeleteClassTemplate,
  onDeleteClassTemplateDivision,
  onDeleteDivision,
  onUpdateClass,
  onUpdateClassTemplate,
  onUpdateClassTemplateDivision,
  onUpdateDivision,
}: {
  locale: Locale;
  classes: ClassRecord[];
  classTemplateDivisions: ClassTemplateDivision[];
  classTemplates: ClassTemplate[];
  divisions: Division[];
  entries: Entry[];
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onDeleteClass: (id: string) => Promise<void>;
  onDeleteClassTemplate: (id: string) => Promise<void>;
  onDeleteClassTemplateDivision: (id: string) => Promise<void>;
  onDeleteDivision: (id: string) => Promise<void>;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [creatingClassTemplate, setCreatingClassTemplate] = useState(false);
  const [creatingClassTemplateDivision, setCreatingClassTemplateDivision] = useState<{ templateId?: string } | null>(null);
  const [creatingClass, setCreatingClass] = useState<{ mode: "preset" | "custom"; classTemplateId?: string; showId?: string; showDayId?: string } | null>(null);
  const [creatingEventBlock, setCreatingEventBlock] = useState<{ showId?: string; showDayId?: string } | null>(null);
  const [creatingDivision, setCreatingDivision] = useState<{ classId?: string } | null>(null);
  const [editingClassTemplate, setEditingClassTemplate] = useState<ClassTemplate | null>(null);
  const [editingClassTemplateDivision, setEditingClassTemplateDivision] = useState<ClassTemplateDivision | null>(null);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
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
    const grouped = new Map<string, ClassRecord[]>();

    for (const classRecord of classes) {
      if (!classRecord.show_day_id) {
        continue;
      }

      const dayClasses = grouped.get(classRecord.show_day_id) ?? [];
      dayClasses.push(classRecord);
      grouped.set(classRecord.show_day_id, dayClasses);
    }

    for (const dayClasses of grouped.values()) {
      dayClasses.sort(compareScheduleClasses);
    }

    return grouped;
  }, [classes]);
  const divisionsByClassId = useMemo(() => {
    const grouped = new Map<string, Division[]>();

    for (const division of divisions) {
      const classDivisions = grouped.get(division.class_id) ?? [];
      classDivisions.push(division);
      grouped.set(division.class_id, classDivisions);
    }

    for (const classDivisions of grouped.values()) {
      classDivisions.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "") || a.name.localeCompare(b.name));
    }

    return grouped;
  }, [divisions]);
  const templateDivisionsByTemplateId = useMemo(() => {
    const grouped = new Map<string, ClassTemplateDivision[]>();

    for (const division of classTemplateDivisions) {
      const templateDivisions = grouped.get(division.class_template_id) ?? [];
      templateDivisions.push(division);
      grouped.set(division.class_template_id, templateDivisions);
    }

    for (const templateDivisions of grouped.values()) {
      templateDivisions.sort((a, b) => a.sort_order - b.sort_order || (a.code ?? "").localeCompare(b.code ?? "") || a.name.localeCompare(b.name));
    }

    return grouped;
  }, [classTemplateDivisions]);
  const unassignedClassesByShowId = useMemo(() => {
    const grouped = new Map<string, ClassRecord[]>();

    for (const classRecord of classes) {
      if (classRecord.show_day_id) {
        continue;
      }

      const showClasses = grouped.get(classRecord.show_id) ?? [];
      showClasses.push(classRecord);
      grouped.set(classRecord.show_id, showClasses);
    }

    for (const showClasses of grouped.values()) {
      showClasses.sort(compareScheduleClasses);
    }

    return grouped;
  }, [classes]);
  const hasActiveClassTemplates = classTemplates.some((template) => template.is_active);

  async function handleDeleteClassTemplate(template: ClassTemplate) {
    const templateClassCount = classTemplateDivisions.filter((division) => division.class_template_id === template.id).length;
    const message = templateClassCount
      ? `Supprimer le bloc récurrent "${template.name}" et ses ${templateClassCount} classe${templateClassCount === 1 ? "" : "s"}?`
      : `Supprimer le bloc récurrent "${template.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteClassTemplate(template.id);
    if (editingClassTemplate?.id === template.id) {
      setEditingClassTemplate(null);
    }
  }

  async function handleDeleteClassTemplateDivision(division: ClassTemplateDivision) {
    if (!window.confirm(`Supprimer la classe récurrente "${division.name}"? Les classes déjà créées depuis ce bloc récurrent resteront dans leurs blocs.`)) {
      return;
    }

    await onDeleteClassTemplateDivision(division.id);
    if (editingClassTemplateDivision?.id === division.id) {
      setEditingClassTemplateDivision(null);
    }
  }

  async function handleDeleteClass(classRecord: ClassRecord) {
    const classDivisions = divisions.filter((division) => division.class_id === classRecord.id);
    const classDivisionIds = new Set(classDivisions.map((division) => division.id));
    const entryCount = entries.filter((entry) => classDivisionIds.has(entry.division_id)).length;
    const message = [
      `Supprimer le bloc "${classRecord.name}"?`,
      classDivisions.length ? `${classDivisions.length} classe${classDivisions.length === 1 ? " sera supprimee" : "s seront supprimees"}.` : null,
      entryCount ? `${entryCount} inscription${entryCount === 1 ? " liee sera aussi supprimee" : "s liees seront aussi supprimees"}.` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteClass(classRecord.id);
    if (editingClass?.id === classRecord.id) {
      setEditingClass(null);
    }
  }

  async function handleDeleteDivision(division: Division) {
    const entryCount = entries.filter((entry) => entry.division_id === division.id).length;
    const message = entryCount
      ? `Supprimer la classe "${division.name}"? ${entryCount} inscription${entryCount === 1 ? " liee sera aussi supprimee" : "s liees seront aussi supprimees"}.`
      : `Supprimer la classe "${division.name}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await onDeleteDivision(division.id);
    if (editingDivision?.id === division.id) {
      setEditingDivision(null);
    }
  }

  async function handleMoveScheduleBlock(classRecord: ClassRecord, dayClasses: ClassRecord[], direction: -1 | 1) {
    if (!canManuallyOrderClass(classRecord)) {
      return;
    }

    const movableClasses = dayClasses.filter(canManuallyOrderClass).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const currentIndex = movableClasses.findIndex((candidate) => candidate.id === classRecord.id);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= movableClasses.length) {
      return;
    }

    const nextOrder = [...movableClasses];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];

    await Promise.all(nextOrder.map((candidate, index) => onUpdateClass(candidate.id, { sort_order: (index + 1) * 10 })));
  }

  function renderScheduleBlock(classRecord: ClassRecord, dayClasses: ClassRecord[]) {
    if (classRecord.is_event_block) {
      return renderEventBlock(classRecord, dayClasses);
    }

    const classDivisions = divisionsByClassId.get(classRecord.id) ?? [];
    const isExpanded = expandedScheduleBlockId === classRecord.id;
    const movableClasses = dayClasses.filter(canManuallyOrderClass).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const movableIndex = movableClasses.findIndex((candidate) => candidate.id === classRecord.id);
    const canMove = canManuallyOrderClass(classRecord) && movableIndex >= 0;

    return (
      <article className={`schedule-block ${isExpanded ? "expanded" : ""}`} key={classRecord.id}>
        <div className="schedule-block-header">
          <button aria-expanded={isExpanded} className="schedule-block-trigger" type="button" onClick={() => setExpandedScheduleBlockId(isExpanded ? null : classRecord.id)}>
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>
              <strong>{classRecord.name}</strong>
              <span className="muted-line">
                {[
                  classDivisions.length ? uiText(locale, `${classDivisions.length} classe${classDivisions.length === 1 ? "" : "s"}`, `${classDivisions.length} class${classDivisions.length === 1 ? "" : "es"}`) : uiText(locale, "Aucune classe", "No classes"),
                  classScheduleStartLabel(classRecord, locale),
                  classRecord.block_label,
                  classRecord.pattern ? `Pattern ${classRecord.pattern}` : null,
                  classRecord.nrha_slate_number ? `Slate / show technique ${classRecord.nrha_slate_number}` : null,
                ]
                  .filter(Boolean)
                  .join(" - ")}
              </span>
            </span>
          </button>
          <div className="row-actions schedule-block-actions">
            {canMove ? (
              <div className="schedule-order-actions">
                <button className="icon-button" disabled={movableIndex <= 0} title={uiText(locale, "Monter", "Move up")} type="button" onClick={() => handleMoveScheduleBlock(classRecord, dayClasses, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="icon-button" disabled={movableIndex >= movableClasses.length - 1} title={uiText(locale, "Descendre", "Move down")} type="button" onClick={() => handleMoveScheduleBlock(classRecord, dayClasses, 1)}>
                  <ArrowDown size={16} />
                </button>
              </div>
            ) : null}
            <button className="text-button" type="button" onClick={() => setEditingClass(classRecord)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button" type="button" onClick={() => setCreatingDivision({ classId: classRecord.id })}>
              {uiText(locale, "+ Classe", "+ Class")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeleteClass(classRecord)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
        <div className="schedule-block-meta">
          <span>{sanctionLabel(classRecord.sanctioning_body_codes, sanctioningBodies, locale)}</span>
          <span>
            {[
              backNumberPolicyLabel(classRecord.back_number_policy, locale),
              classRecord.entry_fee == null ? null : formatCurrency(classRecord.entry_fee, organization?.currency ?? "CAD"),
              concurrentClassLabel(classRecord, classes, locale),
              classEntriesCloseLabel(classRecord),
            ]
              .filter(Boolean)
              .join(" - ") || uiText(locale, "Paramètres du bloc", "Block settings")}
          </span>
        </div>
        {isExpanded ? (
          <div className="schedule-class-list">
            {classDivisions.map((division) => (
              <div className="schedule-class-row" key={division.id}>
                <div>
                  <strong>{division.name}</strong>
                  <span className="muted-line">
                    {[
                      division.code ? `#${division.code}` : null,
                      isNrhaSanctioned(division.sanctioning_body_codes) ? nrhaClassTypeLabel(nrhaClassTypeFromRules(division.eligibility_rules)) || uiText(locale, "Type NRHA à préciser", "NRHA type required") : null,
                      division.entry_fee == null ? uiText(locale, "Frais classe", "Class fee") : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(division.entry_fee, organization?.currency ?? "CAD")}`,
                      division.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                      payoutDivisionSummary(division, locale),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                <span>{sanctionLabel(division.sanctioning_body_codes, sanctioningBodies, locale)}</span>
                <div className="row-actions schedule-class-actions">
                  <button className="text-button" type="button" onClick={() => setEditingDivision(division)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteDivision(division)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            ))}
            {!classDivisions.length ? <EmptyState label={uiText(locale, "Clique + Classe pour ajouter une classe dans ce bloc.", "Click + Class to add a class to this block.")} /> : null}
          </div>
        ) : null}
      </article>
    );
  }

  function renderEventBlock(classRecord: ClassRecord, dayClasses: ClassRecord[]) {
    const movableClasses = dayClasses.filter(canManuallyOrderClass).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const movableIndex = movableClasses.findIndex((candidate) => candidate.id === classRecord.id);
    const canMove = canManuallyOrderClass(classRecord) && movableIndex >= 0;
    const timeLabel = classRecord.scheduled_time ? classRecord.scheduled_time.slice(0, 5) : null;

    return (
      <article className="schedule-block schedule-event-block" key={classRecord.id}>
        <div className="schedule-block-header">
          <div className="schedule-block-trigger schedule-event-trigger">
            <Clock size={18} />
            <span>
              <strong>{classRecord.name}</strong>
              <span className="muted-line">
                {[
                  classRecord.block_label,
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
                <button className="icon-button" disabled={movableIndex <= 0} title={uiText(locale, "Monter", "Move up")} type="button" onClick={() => handleMoveScheduleBlock(classRecord, dayClasses, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="icon-button" disabled={movableIndex >= movableClasses.length - 1} title={uiText(locale, "Descendre", "Move down")} type="button" onClick={() => handleMoveScheduleBlock(classRecord, dayClasses, 1)}>
                  <ArrowDown size={16} />
                </button>
              </div>
            ) : null}
            <button className="text-button" type="button" onClick={() => setEditingClass(classRecord)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeleteClass(classRecord)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderRecurringBlock(template: ClassTemplate) {
    const templateDivisions = templateDivisionsByTemplateId.get(template.id) ?? [];
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
                  templateDivisions.length ? uiText(locale, `${templateDivisions.length} classe${templateDivisions.length === 1 ? "" : "s"}`, `${templateDivisions.length} class${templateDivisions.length === 1 ? "" : "es"}`) : uiText(locale, "Aucune classe", "No classes"),
                  template.block_label,
                  template.category,
                  template.default_pattern ? `Pattern ${template.default_pattern}` : null,
                ]
                  .filter(Boolean)
                  .join(" - ") || template.code || uiText(locale, "Bloc récurrent", "Recurring block")}
              </span>
            </span>
          </button>
          <div className="row-actions recurring-block-actions">
            <button className="text-button" disabled={!organization || !shows.length || !template.is_active} type="button" onClick={() => setCreatingClass({ mode: "preset", classTemplateId: template.id })}>
              {uiText(locale, "Utiliser", "Use")}
            </button>
            <button className="text-button" type="button" onClick={() => setEditingClassTemplate(template)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
            <button className="text-button" type="button" onClick={() => setCreatingClassTemplateDivision({ templateId: template.id })}>
              {uiText(locale, "+ Classe", "+ Class")}
            </button>
            <button className="text-button danger-text" type="button" onClick={() => handleDeleteClassTemplate(template)}>
              {uiText(locale, "Supprimer", "Delete")}
            </button>
          </div>
        </div>
        <div className="recurring-block-meta">
          <span>{sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale)}</span>
          <span>{backNumberPolicyLabel(template.back_number_policy, locale)}</span>
        </div>
        {isExpanded ? (
          <div className="schedule-class-list">
            {templateDivisions.map((division) => (
              <div className="schedule-class-row recurring-class-row" key={division.id}>
                <div>
                  <strong>{division.name}</strong>
                  <span className="muted-line">
                    {[
                      division.code ? `#${division.code}` : uiText(locale, "Sans code", "No code"),
                      isNrhaSanctioned(division.sanctioning_body_codes) ? nrhaClassTypeLabel(nrhaClassTypeFromRules(division.eligibility_rules)) || uiText(locale, "Type NRHA à préciser", "NRHA type required") : null,
                      division.default_entry_fee == null ? null : `${uiText(locale, "Insc.", "Entry")} ${formatCurrency(division.default_entry_fee, organization?.currency ?? "CAD")}`,
                      division.default_judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.default_judge_fee, organization?.currency ?? "CAD")}`,
                      payoutTemplateDivisionSummary(division, locale),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </div>
                <span>{sanctionLabel(division.sanctioning_body_codes, sanctioningBodies, locale)}</span>
                <div className="row-actions schedule-class-actions">
                  <button className="text-button" type="button" onClick={() => setEditingClassTemplateDivision(division)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteClassTemplateDivision(division)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            ))}
            {!templateDivisions.length ? <EmptyState label={uiText(locale, "Ajoute les classes qui reviennent avec ce bloc.", "Add the classes that recur with this block.")} /> : null}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Horaire", "Schedule")}
        title={uiText(locale, "Horaire par journées", "Schedule by day")}
        description={uiText(locale, "Place les blocs dans les journées du concours, puis gère les classes directement dans chaque bloc.", "Place blocks inside show days, then manage the classes directly inside each block.")}
        stats={[
          { label: uiText(locale, "Journées", "Days"), value: String(showDays.length) },
          { label: uiText(locale, "Blocs", "Blocks"), value: String(classes.length) },
          { label: uiText(locale, "Classes", "Classes"), value: String(divisions.length) },
          { label: uiText(locale, "Récurrents", "Recurring"), value: String(classTemplates.length) },
        ]}
      />

      {creatingClassTemplate ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Catalogue réutilisable de l'association.", "Reusable association catalog.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouveau bloc récurrent", "New recurring block")} onClose={() => setCreatingClassTemplate(false)}>
          <ClassTemplateForm
            locale={locale}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            onCreateClassTemplate={onCreateClassTemplate}
            onCreated={() => setCreatingClassTemplate(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingClassTemplateDivision ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Classe régulière rattachée à un bloc récurrent.", "Reusable class attached to a recurring block.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Classe de bloc récurrent", "Recurring block class")} onClose={() => setCreatingClassTemplateDivision(null)}>
          <ClassTemplateDivisionForm
            locale={locale}
            classTemplates={classTemplates}
            defaultTemplateId={creatingClassTemplateDivision.templateId}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            onCreateClassTemplateDivision={onCreateClassTemplateDivision}
            onCreated={() => setCreatingClassTemplateDivision(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingClass ? (
        <ModalDialog className="class-program-modal" description={creatingClass.mode === "preset" ? uiText(locale, "Choisis un bloc récurrent de l'association.", "Choose an association recurring block.") : uiText(locale, "Crée un bloc libre pour une journée du concours.", "Create a custom block for a show day.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={creatingClass.mode === "preset" ? uiText(locale, "Nouveau bloc depuis un bloc récurrent", "New block from recurring block") : uiText(locale, "Nouveau bloc libre", "New custom block")} onClose={() => setCreatingClass(null)}>
          <ClassForm
            locale={locale}
            classes={classes}
            classTemplateDivisions={classTemplateDivisions}
            classTemplates={classTemplates}
            defaultMode={creatingClass.mode}
            defaultTemplateId={creatingClass.classTemplateId}
            defaultShowDayId={creatingClass.showDayId}
            defaultShowId={creatingClass.showId}
            organization={organization}
            sanctioningBodies={sanctioningBodies}
            showDays={showDays}
            shows={shows}
            onCreateClass={onCreateClass}
            onCreateDivision={onCreateDivision}
            onCreated={() => setCreatingClass(null)}
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
            onCreateClass={onCreateClass}
            onCreated={() => setCreatingEventBlock(null)}
          />
        </ModalDialog>
      ) : null}

      {creatingDivision ? (
        <ModalDialog className="class-program-modal" description={uiText(locale, "Ajoute une classe d'inscription sous un bloc existant.", "Add an entry class under an existing block.")} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Nouvelle classe", "New class")} onClose={() => setCreatingDivision(null)}>
          <DivisionForm locale={locale} classes={classes} defaultClassId={creatingDivision.classId} organization={organization} sanctioningBodies={sanctioningBodies} shows={shows} onCreateDivision={onCreateDivision} onCreated={() => setCreatingDivision(null)} />
        </ModalDialog>
      ) : null}

      {editingClassTemplate ? (
        <ModalDialog className="class-program-modal" description={editingClassTemplate.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le bloc récurrent", "Edit recurring block")} onClose={() => setEditingClassTemplate(null)}>
          <ClassTemplateEditForm
            locale={locale}
            classTemplate={editingClassTemplate}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClassTemplate(null)}
            onUpdateClassTemplate={async (id, input) => {
              await onUpdateClassTemplate(id, input);
              setEditingClassTemplate(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingClassTemplateDivision ? (
        <ModalDialog className="class-program-modal" description={editingClassTemplateDivision.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier la classe récurrente", "Edit recurring class")} onClose={() => setEditingClassTemplateDivision(null)}>
          <ClassTemplateDivisionEditForm
            locale={locale}
            classTemplates={classTemplates}
            classTemplateDivision={editingClassTemplateDivision}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingClassTemplateDivision(null)}
            onUpdateClassTemplateDivision={async (id, input) => {
              await onUpdateClassTemplateDivision(id, input);
              setEditingClassTemplateDivision(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingClass ? (
        <ModalDialog className="class-program-modal" description={editingClass.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier le bloc", "Edit block")} onClose={() => setEditingClass(null)}>
          <ClassEditForm
            locale={locale}
            classes={classes}
            classRecord={editingClass}
            sanctioningBodies={sanctioningBodies}
            showDays={showDays}
            onCancel={() => setEditingClass(null)}
            onUpdateClass={async (id, input) => {
              await onUpdateClass(id, input);
              setEditingClass(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingDivision ? (
        <ModalDialog className="class-program-modal" description={editingDivision.name} eyebrow={uiText(locale, "Horaire", "Schedule")} title={uiText(locale, "Modifier la classe", "Edit class")} onClose={() => setEditingDivision(null)}>
          <DivisionEditForm
            locale={locale}
            classes={classes}
            division={editingDivision}
            sanctioningBodies={sanctioningBodies}
            onCancel={() => setEditingDivision(null)}
            onUpdateDivision={async (id, input) => {
              await onUpdateDivision(id, input);
              setEditingDivision(null);
            }}
          />
        </ModalDialog>
      ) : null}

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
                                <button className="primary-button" disabled={!organization || !hasActiveClassTemplates} type="button" onClick={() => setCreatingClass({ mode: "preset", showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  {uiText(locale, "Bloc récurrent", "Recurring block")}
                                </button>
                                <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingClass({ mode: "custom", showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  {uiText(locale, "Bloc libre", "Custom block")}
                                </button>
                                <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingEventBlock({ showId: show.id, showDayId: day.id })}>
                                  <Plus size={18} />
                                  {uiText(locale, "Événement", "Event")}
                                </button>
                              </div>
                            </div>
                            <div className="schedule-block-list">
                              {dayClasses.map((classRecord) => renderScheduleBlock(classRecord, dayClasses))}
                              {!dayClasses.length ? <EmptyState label={uiText(locale, "Aucun bloc dans cette journée.", "No block in this day.")} /> : null}
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
                          <div className="schedule-block-list">{unassignedClasses.map((classRecord) => renderScheduleBlock(classRecord, unassignedClasses))}</div>
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
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingClassTemplate(true)}>
              <Plus size={18} />
              {uiText(locale, "Bloc récurrent", "Recurring block")}
            </button>
            <button className="ghost-button" disabled={!organization || !classTemplates.length} type="button" onClick={() => setCreatingClassTemplateDivision({})}>
              <Plus size={18} />
              {uiText(locale, "Classe récurrente", "Recurring class")}
            </button>
          </div>
        </div>
        <div className="recurring-block-list">
          {classTemplates.map(renderRecurringBlock)}
          {!classTemplates.length ? <EmptyState label={uiText(locale, "Crée le premier bloc récurrent de cette association.", "Create the first recurring block for this association.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { ClassesView };
