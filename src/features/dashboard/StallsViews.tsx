import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ComponentType } from "react";
import { ClipboardList, Plus, Warehouse } from "lucide-react";
import { ContactPicker, EmptyState, FormActions, Metric, ModalDialog, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import { getHorseCogginsValidity, getHorseVaccineValidity, organizationRequiresHealthVerification, type HorseCogginsValidity, type HorseVaccineValidity } from "../../lib/health";
import {
  createContact,
  createStallBooking,
  createStallOption,
  deleteStallBooking,
  ensureContactRoles,
  updateStallBooking,
  updateStallOption,
} from "../../services/supabaseServices";
import type { Contact, ContactRole, ContactRoleName, Horse, HorseHealthDocument, Invoice, InvoiceLineItem, Organization, Show, ShowDay, StallBooking, StallOption } from "../../types/domain";

const stallPresets = [
  { key: "stall", label: "Stall", name: "Stall", category: "stall" },
  { key: "tack-stall", label: "Tack stall", name: "Tack stall", category: "stall" },
  { key: "shavings", label: "Ripe / shavings", name: "Ripe / shavings", category: "extra" },
  { key: "hay", label: "Foin / hay", name: "Foin / hay", category: "extra" },
  { key: "camping", label: "Camping", name: "Camping", category: "camping" },
  { key: "custom", label: "Custom", name: "", category: "extra" },
] as const;

const bookingStatuses: StallBooking["status"][] = ["requested", "reserved", "active", "cancelled", "completed"];
const requiredReservationContactRoles: ContactRoleName[] = ["booker"];
const reservationContactRoleChoices: Array<{ detail: string; label: string; role: ContactRoleName }> = [
  { detail: "Personne qui fait la demande.", label: "Booker", role: "booker" },
  { detail: "Personne liee a la facture.", label: "Payer", role: "payer" },
  { detail: "Role ajoute au contact, sans changer le proprietaire du cheval.", label: "Owner", role: "owner" },
];
type ReservationPeriodMode = "full_show" | "daily";
type TackBillingMode = "split_horses" | "single_contact";

type AssociationReservationTab = "reservations" | "new-reservation" | "options";
type PersonalReservationTab = "my-reservations" | "new-reservation" | "available-options";

type StallHorseHealthValidity = {
  coggins: HorseCogginsValidity;
  vaccine: HorseVaccineValidity;
  valid: boolean;
};

export function StallsView({
  bookings,
  contacts,
  contactRoles,
  currency,
  horseHealthDocuments,
  horses,
  invoiceLineItems,
  invoices,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  onCreateContact,
  onCreateStallBooking,
  onCreateStallOption,
  onDeleteStallBooking,
  onUpdateStallBooking,
  onUpdateStallOption,
}: {
  bookings: StallBooking[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  invoiceLineItems: InvoiceLineItem[];
  invoices: Invoice[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onDeleteStallBooking: (id: Parameters<typeof deleteStallBooking>[0]) => Promise<void>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
  onUpdateStallOption: (id: string, input: Parameters<typeof updateStallOption>[1]) => Promise<void>;
}) {
  const [creatingOption, setCreatingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<StallOption | null>(null);
  const [editingBooking, setEditingBooking] = useState<StallBooking | null>(null);
  const [activeTab, setActiveTab] = useState<AssociationReservationTab>("reservations");
  const reservedQuantity = bookings
    .filter((booking) => booking.status !== "cancelled" && booking.affects_inventory !== false)
    .reduce((sum, booking) => sum + Number(booking.quantity ?? 1), 0);
  const billableTotal = bookings.reduce((sum, booking) => sum + Number(booking.total_price ?? 0), 0);
  const associationTabs: Array<ReservationTabItem<AssociationReservationTab>> = [
    {
      count: bookings.length,
      detail: "Demandes, reservations et statuts.",
      icon: ClipboardList,
      key: "reservations",
      label: "Reservations",
    },
    {
      detail: "Ajouter une demande pour un compétiteur.",
      icon: Plus,
      key: "new-reservation",
      label: "Nouvelle reservation",
    },
    {
      count: stallOptions.length,
      detail: "Stalls, camping et extras disponibles.",
      icon: Warehouse,
      key: "options",
      label: "Options reservables",
    },
  ];

  async function handleDeleteBooking(booking: StallBooking) {
    if (!window.confirm("Supprimer cette reservation et la ligne de facture liee?")) {
      return;
    }

    await onDeleteStallBooking(booking.id);
    if (editingBooking?.id === booking.id) {
      setEditingBooking(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Reservations"
        title="Reservations et options reservables"
        description="Gere les demandes de stalls, camping et extras, puis garde l'inventaire disponible a jour."
        stats={[
          { label: "Reservations", value: String(bookings.length) },
          { label: "Options", value: String(stallOptions.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label="Options reservables" value={String(stallOptions.length)} />
        <Metric label="Unites reservees" value={String(reservedQuantity)} />
        <Metric label="Facturable" value={formatCurrency(billableTotal, currency)} />
      </section>

      <ReservationTabs
        activeTab={activeTab}
        items={associationTabs}
        onChange={(tab) => {
          setActiveTab(tab);
          setCreatingOption(false);
          setEditingBooking(null);
          setEditingOption(null);
        }}
      />

      {activeTab === "reservations" ? (
        <>
          {editingBooking ? (
            <ModalDialog className="reservation-form-modal" description={horseLabel(findById(horses, editingBooking.horse_id))} eyebrow="Reservations" title="Modifier la reservation" onClose={() => setEditingBooking(null)}>
              <StallBookingEditForm
                booking={editingBooking}
                contacts={contacts}
                contactRoles={contactRoles}
                currency={currency}
                horseHealthDocuments={horseHealthDocuments}
                horses={horses}
                invoices={invoices}
                organization={organization}
                profileId={profileId}
                showDays={showDays}
                shows={shows}
                stallOptions={stallOptions}
                onCancel={() => setEditingBooking(null)}
                onCreateContact={onCreateContact}
                onUpdateStallBooking={async (id, input) => {
                  await onUpdateStallBooking(id, input);
                  setEditingBooking(null);
                }}
              />
            </ModalDialog>
          ) : null}

          <StallBookingsTable bookings={bookings} contacts={contacts} currency={currency} horses={horses} invoiceLineItems={invoiceLineItems} invoices={invoices} options={stallOptions} onDelete={handleDeleteBooking} onEdit={setEditingBooking} />
        </>
      ) : null}

      {activeTab === "new-reservation" ? (
        <ModalDialog className="reservation-form-modal" description="Creer une demande sans quitter la gestion des reservations." eyebrow="Reservations" title="Nouvelle reservation" onClose={() => setActiveTab("reservations")}>
          <StallBookingForm
            bookings={bookings}
            contacts={contacts}
            contactRoles={contactRoles}
            currency={currency}
            defaultStatus="reserved"
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            invoices={invoices}
            organization={organization}
            profileId={profileId}
            showDays={showDays}
            shows={shows}
            stallOptions={stallOptions}
            title="Nouvelle reservation"
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onCreated={() => setActiveTab("reservations")}
          />
        </ModalDialog>
      ) : null}

      {activeTab === "options" ? (
        <>
          <section className="panel span-2 form-launch-panel">
            <div className="panel-header">
              <div>
                <h2>Options reservables</h2>
                <p>Ajoute un produit de reservation sans quitter la liste d'inventaire.</p>
              </div>
              <button className="primary-button" disabled={!organization || !shows.length} type="button" onClick={() => setCreatingOption(true)}>
                <Plus size={18} />
                Option
              </button>
            </div>
          </section>

          {creatingOption ? (
            <ModalDialog className="reservation-form-modal" description="Stall, tack, ripe, foin, camping ou extra." eyebrow="Reservations" title="Nouvelle option" onClose={() => setCreatingOption(false)}>
              <StallOptionForm
                organization={organization}
                showDays={showDays}
                shows={shows}
                onCreateStallOption={onCreateStallOption}
                onCreated={() => setCreatingOption(false)}
              />
            </ModalDialog>
          ) : null}

          {editingOption ? (
            <ModalDialog className="reservation-form-modal" description={editingOption.name} eyebrow="Reservations" title="Modifier l'option" onClose={() => setEditingOption(null)}>
              <StallOptionEditForm
                currency={currency}
                option={editingOption}
                showDays={showDays}
                shows={shows}
                onCancel={() => setEditingOption(null)}
                onUpdateStallOption={async (id, input) => {
                  await onUpdateStallOption(id, input);
                  setEditingOption(null);
                }}
              />
            </ModalDialog>
          ) : null}

          <StallOptionsTable currency={currency} options={stallOptions} shows={shows} onEdit={setEditingOption} />
        </>
      ) : null}
    </div>
  );
}

export function MyStallsView({
  bookings,
  contacts,
  contactRoles,
  currency,
  horseHealthDocuments,
  horses,
  invoiceLineItems,
  invoices,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  onCreateContact,
  onCreateStallBooking,
  onDeleteStallBooking,
  onUpdateStallBooking,
}: {
  bookings: StallBooking[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  invoiceLineItems: InvoiceLineItem[];
  invoices: Invoice[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onDeleteStallBooking: (id: Parameters<typeof deleteStallBooking>[0]) => Promise<void>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
}) {
  const [editingBooking, setEditingBooking] = useState<StallBooking | null>(null);
  const [activeTab, setActiveTab] = useState<PersonalReservationTab>("my-reservations");
  const billableTotal = bookings.reduce((sum, booking) => sum + Number(booking.total_price ?? 0), 0);
  const availableOptions = stallOptions.filter((option) => option.available_quantity > 0);
  const personalTabs: Array<ReservationTabItem<PersonalReservationTab>> = [
    {
      count: bookings.length,
      detail: "Mes demandes et reservations actives.",
      icon: ClipboardList,
      key: "my-reservations",
      label: "Mes reservations",
    },
    {
      detail: "Demander un stall, camping ou extra.",
      icon: Plus,
      key: "new-reservation",
      label: "Nouvelle reservation",
    },
    {
      count: availableOptions.length,
      detail: "Ce qui peut etre reserve.",
      icon: Warehouse,
      key: "available-options",
      label: "Options disponibles",
    },
  ];

  async function handleDeleteBooking(booking: StallBooking) {
    if (!window.confirm("Supprimer cette reservation et la ligne de facture liee?")) {
      return;
    }

    await onDeleteStallBooking(booking.id);
    if (editingBooking?.id === booking.id) {
      setEditingBooking(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Mon espace"
        title="Mes reservations"
        description="Reserve les options disponibles pour tes chevaux et suis les demandes liees a ton compte."
        stats={[
          { label: "Reservations", value: String(bookings.length) },
          { label: "Disponibles", value: String(availableOptions.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label="Reservations" value={String(bookings.length)} />
        <Metric label="Options disponibles" value={String(availableOptions.length)} />
        <Metric label="Facturable" value={formatCurrency(billableTotal, currency)} />
      </section>

      <ReservationTabs
        activeTab={activeTab}
        items={personalTabs}
        onChange={(tab) => {
          setActiveTab(tab);
          setEditingBooking(null);
        }}
      />

      {activeTab === "my-reservations" ? (
        <>
          {editingBooking ? (
            <ModalDialog className="reservation-form-modal" description={horseLabel(findById(horses, editingBooking.horse_id))} eyebrow="Mon espace" title="Modifier la reservation" onClose={() => setEditingBooking(null)}>
              <StallBookingEditForm
                booking={editingBooking}
                contacts={contacts}
                contactRoles={contactRoles}
                currency={currency}
                horseHealthDocuments={horseHealthDocuments}
                horses={horses}
                invoices={invoices}
                organization={organization}
                profileId={profileId}
                showDays={showDays}
                shows={shows}
                stallOptions={stallOptions}
                onCancel={() => setEditingBooking(null)}
                onCreateContact={onCreateContact}
                onUpdateStallBooking={async (id, input) => {
                  await onUpdateStallBooking(id, input);
                  setEditingBooking(null);
                }}
              />
            </ModalDialog>
          ) : null}

          <StallBookingsTable
            bookings={bookings}
            contacts={contacts}
            currency={currency}
            horses={horses}
            invoiceLineItems={invoiceLineItems}
            invoices={invoices}
            options={stallOptions}
            title="Mes reservations"
            onDelete={handleDeleteBooking}
            onEdit={setEditingBooking}
          />
        </>
      ) : null}

      {activeTab === "new-reservation" ? (
        <ModalDialog className="reservation-form-modal" description="Demande un stall, camping ou extra sans quitter tes reservations." eyebrow="Mon espace" title="Nouvelle reservation" onClose={() => setActiveTab("my-reservations")}>
          <StallBookingForm
            allowStatusEdit={false}
            bookings={bookings}
            contacts={contacts}
            contactRoles={contactRoles}
            currency={currency}
            defaultStatus="requested"
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            invoices={invoices}
            organization={organization}
            profileId={profileId}
            showDays={showDays}
            shows={shows}
            stallOptions={stallOptions}
            title="Nouvelle reservation"
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onCreated={() => setActiveTab("my-reservations")}
          />
        </ModalDialog>
      ) : null}

      {activeTab === "available-options" ? <StallOptionsTable currency={currency} options={availableOptions} shows={shows} /> : null}
    </div>
  );
}

type ReservationTabItem<T extends string> = {
  count?: number;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  key: T;
  label: string;
};

function ReservationTabs<T extends string>({
  activeTab,
  items,
  onChange,
}: {
  activeTab: T;
  items: Array<ReservationTabItem<T>>;
  onChange: (tab: T) => void;
}) {
  return (
    <section className="reservation-tabs span-2" aria-label="Reservation sections">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button className={activeTab === item.key ? "active" : ""} key={item.key} type="button" onClick={() => onChange(item.key)}>
            <Icon size={18} />
            <span>
              <strong>
                {item.label}
                {typeof item.count === "number" ? <small>{item.count}</small> : null}
              </strong>
              <em>{item.detail}</em>
            </span>
          </button>
        );
      })}
    </section>
  );
}

function StallOptionsTable({
  currency,
  options,
  shows,
  onEdit,
}: {
  currency: string;
  options: StallOption[];
  shows: Show[];
  onEdit?: (option: StallOption) => void;
}) {
  const title = onEdit ? "Options reservables" : "Options disponibles";

  return (
    <section className="panel span-2">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{options.length ? `${options.length} option${options.length === 1 ? "" : "s"} available for reservations.` : "Create stalls, tack stalls, bedding, hay or camping."}</p>
        </div>
      </div>
      <div className={`table stalls-table ${onEdit ? "" : "read-only-table"}`}>
        <div className="table-row table-head">
          <span>Option</span>
          <span>Show</span>
          <span>Availability</span>
          {onEdit ? <span>Action</span> : null}
        </div>
        {options.map((option) => (
          <div className="table-row" key={option.id}>
            <div>
              <strong>{option.name}</strong>
              <span className="muted-line">
                {categoryLabel(option.category)} / {formatCurrency(option.price, currency)} / {stallOptionAssignmentLabel(option)}
              </span>
            </div>
            <span>{showLabel(findById(shows, option.show_id))}</span>
            <span>
              {option.available_quantity} / {option.total_quantity}
            </span>
            {onEdit ? (
              <button className="text-button" type="button" onClick={() => onEdit(option)}>
                Modifier
              </button>
            ) : null}
          </div>
        ))}
        {!options.length ? <EmptyState label="Add the first reservable option." /> : null}
      </div>
    </section>
  );
}

function StallBookingsTable({
  bookings,
  contacts,
  currency,
  horses,
  invoiceLineItems,
  invoices,
  options,
  title = "Reservations",
  onDelete,
  onEdit,
}: {
  bookings: StallBooking[];
  contacts: Contact[];
  currency: string;
  horses: Horse[];
  invoiceLineItems: InvoiceLineItem[];
  invoices: Invoice[];
  options: StallOption[];
  title?: string;
  onDelete: (booking: StallBooking) => void;
  onEdit: (booking: StallBooking) => void;
}) {
  return (
    <section className="panel span-2">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{bookings.length ? `${bookings.length} reservation${bookings.length === 1 ? "" : "s"} linked to billing drafts.` : "Reservations will create draft invoice lines."}</p>
        </div>
      </div>
      <div className="table stalls-table">
        <div className="table-row table-head">
          <span>Reservation</span>
          <span>Booker</span>
          <span>Statuts</span>
          <span>Action</span>
        </div>
        {bookings.map((booking) => {
          const option = findById(options, booking.stall_option_id);
          const invoice = invoiceForBooking(booking, invoices, invoiceLineItems);
          const invoiceState = reservationInvoiceState(invoice, currency);
          return (
            <div className="table-row" key={booking.id}>
              <div>
                <strong>{option?.name ?? "Unknown option"}</strong>
                <span className="muted-line">
                  {booking.quantity} x {formatCurrency(booking.unit_price ?? option?.price ?? 0, currency)} = {formatCurrency(booking.total_price ?? 0, currency)}
                  {booking.horse_id ? ` / ${horseLabel(findById(horses, booking.horse_id))}` : ""}
                </span>
              </div>
              <span>{contactLabel(findById(contacts, booking.booker_contact_id))}</span>
              <div className="reservation-status-stack">
                <span className={`badge ${booking.status}`}>{bookingStatusLabel(booking.status)}</span>
                <span className={`badge ${invoiceState.badgeClass}`}>{invoiceState.confirmationLabel}</span>
                <small>{invoiceState.detail}</small>
              </div>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => onEdit(booking)}>
                  Modifier
                </button>
                <button className="text-button danger-text" type="button" onClick={() => onDelete(booking)}>
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
        {!bookings.length ? <EmptyState label="No reservations yet." /> : null}
      </div>
    </section>
  );
}

function StallOptionForm({
  organization,
  showDays,
  shows,
  onCreateStallOption,
  onCreated,
}: {
  organization: Organization | null;
  showDays: ShowDay[];
  shows: Show[];
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [showId, setShowId] = useState("");
  const [presetKey, setPresetKey] = useState("stall");
  const [name, setName] = useState("Stall");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NonNullable<StallOption["category"]>>("stall");
  const [price, setPrice] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("1");
  const [availableQuantity, setAvailableQuantity] = useState("");
  const [requiresHorseAssignment, setRequiresHorseAssignment] = useState(true);
  const [limitPerHorseStalls, setLimitPerHorseStalls] = useState("");
  const [reservationPeriodMode, setReservationPeriodMode] = useState<ReservationPeriodMode>("full_show");
  const [durationDays, setDurationDays] = useState("");
  const [startDayId, setStartDayId] = useState("");
  const [endDayId, setEndDayId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const dayOptions = showDays.filter((day) => day.show_id === selectedShowId);
  const usesDailyReservations = reservationPeriodMode === "daily";
  const selectedStartDayId = usesDailyReservations ? validDayId(startDayId, dayOptions) || dayOptions[0]?.id || "" : "";
  const selectedEndDayId = usesDailyReservations ? validDayId(endDayId, dayOptions) || selectedStartDayId || dayOptions[dayOptions.length - 1]?.id || "" : "";
  const canCreate = Boolean(organization && selectedShowId && (!usesDailyReservations || dayOptions.length));

  function handlePresetChange(nextPresetKey: string) {
    setPresetKey(nextPresetKey);
    const preset = stallPresets.find((candidate) => candidate.key === nextPresetKey);

    if (preset && preset.key !== "custom") {
      setName(preset.name);
      setCategory(preset.category);
      setRequiresHorseAssignment(preset.key !== "tack-stall");
      setLimitPerHorseStalls("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedShowId) {
      return;
    }

    const total = integerValue(totalQuantity, 1);
    const optionRequiresHorseAssignment = category === "stall" ? requiresHorseAssignment : false;
    setBusy(true);

    try {
      await onCreateStallOption({
        organization_id: organization.id,
        show_id: selectedShowId,
        name,
        description,
        price: numericValue(price) ?? 0,
        total_quantity: total,
        available_quantity: Math.min(integerValue(availableQuantity, total), total),
        duration_days: usesDailyReservations ? integerValue(durationDays, 0) || undefined : undefined,
        show_day_start_id: usesDailyReservations ? selectedStartDayId || null : null,
        show_day_end_id: usesDailyReservations ? selectedEndDayId || null : null,
        requires_horse_assignment: optionRequiresHorseAssignment,
        limit_per_horse_stalls: optionRequiresHorseAssignment ? null : integerValue(limitPerHorseStalls, 0) || null,
        category,
        notes,
      });
      setName(stallPresets[0].name);
      setDescription("");
      setCategory("stall");
      setPrice("");
      setTotalQuantity("1");
      setAvailableQuantity("");
      setRequiresHorseAssignment(true);
      setLimitPerHorseStalls("");
      setReservationPeriodMode("full_show");
      setDurationDays("");
      setStartDayId("");
      setEndDayId("");
      setNotes("");
      setPresetKey("stall");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Nouvelle option reservable</h2>
          <p>{shows.length ? "Creer l'inventaire reservable: stall, tack, ripe, foin ou camping." : "Create a show first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Show
          <select
            disabled={!organization || !shows.length}
            value={selectedShowId}
            onChange={(event) => {
              setShowId(event.target.value);
              setStartDayId("");
              setEndDayId("");
            }}
          >
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preset
          <select disabled={!canCreate} value={presetKey} onChange={(event) => handlePresetChange(event.target.value)}>
            {stallPresets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input disabled={!canCreate} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select disabled={!canCreate} value={category} onChange={(event) => setCategory(event.target.value as NonNullable<StallOption["category"]>)}>
              <option value="stall">Stall</option>
              <option value="camping">Camping</option>
              <option value="parking">Parking</option>
              <option value="extra">Extra</option>
            </select>
          </label>
          <label>
            Price
            <input disabled={!canCreate} min="0" required step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Total quantity
            <input disabled={!canCreate} min="0" required step="1" type="number" value={totalQuantity} onChange={(event) => setTotalQuantity(event.target.value)} />
          </label>
          <label>
            Available now
            <input disabled={!canCreate} min="0" step="1" type="number" value={availableQuantity} onChange={(event) => setAvailableQuantity(event.target.value)} />
          </label>
        </div>
        {category === "stall" ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>Assignation</strong>
              <span>{requiresHorseAssignment ? "Chaque reservation sera liee a un cheval." : "Reservation non attitree a un cheval."}</span>
            </div>
            <div className="segmented-control">
              <button className={requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(true)}>
                Par cheval
              </button>
              <button className={!requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(false)}>
                Non attitree
              </button>
            </div>
            {!requiresHorseAssignment ? (
              <label>
                Limite optionnelle
                <input
                  min="0"
                  placeholder="1 tack stall par X stalls chevaux"
                  step="1"
                  type="number"
                  value={limitPerHorseStalls}
                  onChange={(event) => setLimitPerHorseStalls(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="form-section">
          <div className="form-section-header">
            <strong>Periode offerte</strong>
            <span>{usesDailyReservations ? "Les compétiteurs choisiront les journees." : "Reservation pour tout le show, sans choix de journee."}</span>
          </div>
          <div className="segmented-control">
            <button className={reservationPeriodMode === "full_show" ? "active" : ""} type="button" onClick={() => setReservationPeriodMode("full_show")}>
              Show complet
            </button>
            <button className={reservationPeriodMode === "daily" ? "active" : ""} disabled={!dayOptions.length} type="button" onClick={() => setReservationPeriodMode("daily")}>
              A la journee
            </button>
          </div>
          {usesDailyReservations ? (
            <>
              <div className="form-grid">
                <label>
                  Jour debut
                  <select disabled={!canCreate || !dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                    {dayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Jour fin
                  <select disabled={!canCreate || !dayOptions.length} value={selectedEndDayId} onChange={(event) => setEndDayId(event.target.value)}>
                    {dayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Duree jours
                <input disabled={!canCreate} min="0" step="1" type="number" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
        <div className="form-grid">
          <label>
            Notes
            <input disabled={!canCreate} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <label>
          Description
          <input disabled={!canCreate} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          Creer option
        </button>
      </form>
    </section>
  );
}

function StallOptionEditForm({
  currency,
  option,
  showDays,
  shows,
  onCancel,
  onUpdateStallOption,
}: {
  currency: string;
  option: StallOption;
  showDays: ShowDay[];
  shows: Show[];
  onCancel: () => void;
  onUpdateStallOption: (id: string, input: Parameters<typeof updateStallOption>[1]) => Promise<void>;
}) {
  const [name, setName] = useState(option.name);
  const [description, setDescription] = useState(option.description ?? "");
  const [category, setCategory] = useState<NonNullable<StallOption["category"]>>(option.category ?? "extra");
  const [price, setPrice] = useState(String(option.price));
  const [totalQuantity, setTotalQuantity] = useState(String(option.total_quantity));
  const [availableQuantity, setAvailableQuantity] = useState(String(option.available_quantity));
  const [requiresHorseAssignment, setRequiresHorseAssignment] = useState(option.requires_horse_assignment !== false && !isTackStallName(option));
  const [limitPerHorseStalls, setLimitPerHorseStalls] = useState(option.limit_per_horse_stalls == null ? "" : String(option.limit_per_horse_stalls));
  const [reservationPeriodMode, setReservationPeriodMode] = useState<ReservationPeriodMode>(option.show_day_start_id || option.show_day_end_id ? "daily" : "full_show");
  const [durationDays, setDurationDays] = useState(option.duration_days == null ? "" : String(option.duration_days));
  const [startDayId, setStartDayId] = useState(option.show_day_start_id ?? "");
  const [endDayId, setEndDayId] = useState(option.show_day_end_id ?? "");
  const [notes, setNotes] = useState(option.notes ?? "");
  const [busy, setBusy] = useState(false);
  const dayOptions = showDays.filter((day) => day.show_id === option.show_id);
  const usesDailyReservations = reservationPeriodMode === "daily";
  const selectedStartDayId = usesDailyReservations ? validDayId(startDayId, dayOptions) || dayOptions[0]?.id || "" : "";
  const selectedEndDayId = usesDailyReservations ? validDayId(endDayId, dayOptions) || selectedStartDayId || dayOptions[dayOptions.length - 1]?.id || "" : "";
  const show = findById(shows, option.show_id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = integerValue(totalQuantity, option.total_quantity);
    const optionRequiresHorseAssignment = category === "stall" ? requiresHorseAssignment : false;
    setBusy(true);

    try {
      await onUpdateStallOption(option.id, {
        name,
        description: description || null,
        category,
        price: numericValue(price) ?? option.price,
        total_quantity: total,
        available_quantity: Math.min(integerValue(availableQuantity, option.available_quantity), total),
        duration_days: usesDailyReservations ? integerValue(durationDays, 0) || null : null,
        show_day_start_id: usesDailyReservations ? selectedStartDayId || null : null,
        show_day_end_id: usesDailyReservations ? selectedEndDayId || null : null,
        requires_horse_assignment: optionRequiresHorseAssignment,
        limit_per_horse_stalls: optionRequiresHorseAssignment ? null : integerValue(limitPerHorseStalls, 0) || null,
        notes: notes || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Modifier option</h2>
          <p>
            {showLabel(show)} / {formatCurrency(option.price, currency)}
          </p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as NonNullable<StallOption["category"]>)}>
              <option value="stall">Stall</option>
              <option value="camping">Camping</option>
              <option value="parking">Parking</option>
              <option value="extra">Extra</option>
            </select>
          </label>
          <label>
            Price
            <input min="0" required step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Total quantity
            <input min="0" required step="1" type="number" value={totalQuantity} onChange={(event) => setTotalQuantity(event.target.value)} />
          </label>
          <label>
            Available now
            <input min="0" required step="1" type="number" value={availableQuantity} onChange={(event) => setAvailableQuantity(event.target.value)} />
          </label>
        </div>
        {category === "stall" ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>Assignation</strong>
              <span>{requiresHorseAssignment ? "Chaque reservation sera liee a un cheval." : "Reservation non attitree a un cheval."}</span>
            </div>
            <div className="segmented-control">
              <button className={requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(true)}>
                Par cheval
              </button>
              <button className={!requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(false)}>
                Non attitree
              </button>
            </div>
            {!requiresHorseAssignment ? (
              <label>
                Limite optionnelle
                <input
                  min="0"
                  placeholder="1 tack stall par X stalls chevaux"
                  step="1"
                  type="number"
                  value={limitPerHorseStalls}
                  onChange={(event) => setLimitPerHorseStalls(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="form-section">
          <div className="form-section-header">
            <strong>Periode offerte</strong>
            <span>{usesDailyReservations ? "Reservation a la journee." : "Reservation pour tout le show."}</span>
          </div>
          <div className="segmented-control">
            <button className={reservationPeriodMode === "full_show" ? "active" : ""} type="button" onClick={() => setReservationPeriodMode("full_show")}>
              Show complet
            </button>
            <button className={reservationPeriodMode === "daily" ? "active" : ""} disabled={!dayOptions.length} type="button" onClick={() => setReservationPeriodMode("daily")}>
              A la journee
            </button>
          </div>
          {usesDailyReservations ? (
            <>
              <div className="form-grid">
                <label>
                  Jour debut
                  <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                    {dayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Jour fin
                  <select disabled={!dayOptions.length} value={selectedEndDayId} onChange={(event) => setEndDayId(event.target.value)}>
                    {dayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Duree jours
                <input min="0" step="1" type="number" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
        <div className="form-grid">
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </section>
  );
}

function StallBookingForm({
  allowStatusEdit = true,
  bookings,
  contacts,
  contactRoles,
  currency,
  defaultStatus,
  horseHealthDocuments,
  horses,
  invoices,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  title,
  onCreateContact,
  onCreateStallBooking,
  onCreated,
}: {
  allowStatusEdit?: boolean;
  bookings: StallBooking[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  defaultStatus: StallBooking["status"];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  invoices: Invoice[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  title: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const firstStallOption = stallOptions.find((option) => isStallReservationOption(option));
  const [showId, setShowId] = useState("");
  const [stallOptionId, setStallOptionId] = useState("");
  const [tackOptionId, setTackOptionId] = useState("");
  const [tackQuantity, setTackQuantity] = useState("0");
  const [tackBillingMode, setTackBillingMode] = useState<TackBillingMode>("split_horses");
  const [tackPayerContactId, setTackPayerContactId] = useState("");
  const [beddingOptionId, setBeddingOptionId] = useState("");
  const [hayOptionId, setHayOptionId] = useState("");
  const [hayQuantity, setHayQuantity] = useState("0");
  const [campingOptionId, setCampingOptionId] = useState("");
  const [campingQuantity, setCampingQuantity] = useState("0");
  const [campingPayerContactIds, setCampingPayerContactIds] = useState<Record<string, string>>({});
  const [selectedHorseIds, setSelectedHorseIds] = useState<string[]>([]);
  const [horsePayerContactIds, setHorsePayerContactIds] = useState<Record<string, string>>({});
  const [beddingHorseIds, setBeddingHorseIds] = useState<string[]>([]);
  const [beddingQuantities, setBeddingQuantities] = useState<Record<string, string>>({});
  const [responsibleContactId, setResponsibleContactId] = useState("");
  const [selectedContactRoles, setSelectedContactRoles] = useState<ContactRoleName[]>(requiredReservationContactRoles);
  const [status, setStatus] = useState<StallBooking["status"]>(defaultStatus);
  const [startDayId, setStartDayId] = useState("");
  const [endDayId, setEndDayId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || firstStallOption?.show_id || shows[0]?.id || "";
  const selectedShow = findById(shows, selectedShowId) ?? null;
  const healthRequired = organizationRequiresHealthVerification(organization);

  function horseHealthValidity(horseId: string): StallHorseHealthValidity {
    const coggins = getHorseCogginsValidity({
      documents: horseHealthDocuments,
      horseId,
      organization,
      referenceDate: selectedShow?.start_date ?? null,
    });
    const vaccine = getHorseVaccineValidity({
      documents: horseHealthDocuments,
      horseId,
      organization,
      referenceDate: selectedShow?.start_date ?? null,
    });

    return {
      coggins,
      vaccine,
      valid: coggins.valid && vaccine.valid,
    };
  }

  const stallChoices = stallOptions.filter((option) => option.show_id === selectedShowId && isStallReservationOption(option));
  const tackChoices = stallOptions.filter((option) => option.show_id === selectedShowId && isTackStallOption(option));
  const beddingChoices = stallOptions.filter((option) => option.show_id === selectedShowId && isBeddingOption(option));
  const hayChoices = stallOptions.filter((option) => option.show_id === selectedShowId && isHayOption(option));
  const campingChoices = stallOptions.filter((option) => option.show_id === selectedShowId && isCampingOption(option));
  const selectedStallOption = findById(stallChoices, stallOptionId) ?? null;
  const selectedTackOption = findById(tackChoices, tackOptionId) ?? null;
  const selectedBeddingOption = findById(beddingChoices, beddingOptionId) ?? (beddingChoices.length === 1 ? beddingChoices[0] : null);
  const selectedHayOption = findById(hayChoices, hayOptionId) ?? null;
  const selectedCampingOption = findById(campingChoices, campingOptionId) ?? null;
  const contactItems = contacts.map((contact) => ({
    id: contact.id,
    label: contactLabel(contact),
    detail: [contact.type, contact.email].filter(Boolean).join(" / "),
  }));
  const reservedHorseBookingById = new Map<string, StallBooking>();
  bookings.forEach((booking) => {
    if (booking.horse_id && isActiveHorseStallBookingForShow(booking, selectedShowId, stallOptions)) {
      reservedHorseBookingById.set(booking.horse_id, booking);
    }
  });
  const reservedHorseIdsKey = Array.from(reservedHorseBookingById.keys()).sort().join("|");
  const selectedReservedHorseCount = selectedHorseIds.filter((horseId) => reservedHorseBookingById.has(horseId)).length;
  const availableHorseCount = horses.filter((horse) => !reservedHorseBookingById.has(horse.id) && (!healthRequired || horseHealthValidity(horse.id).valid)).length;
  const selectedHorses = selectedHorseIds
    .filter((horseId) => !reservedHorseBookingById.has(horseId))
    .map((horseId) => findById(horses, horseId))
    .filter((horse): horse is Horse => Boolean(horse));
  const selectedInvalidHealth = selectedHorses
    .map((horse) => ({ horse, validity: horseHealthValidity(horse.id) }))
    .filter((item) => healthRequired && !item.validity.valid);
  const selectedHorseBillingTargets = selectedHorses.map((horse) => ({
    horse,
    payerContactId: horsePayerContactIds[horse.id] || horse.primary_owner_contact_id,
  }));
  const dailyReservationOption = [selectedStallOption, selectedTackOption, selectedHayOption, selectedCampingOption].find(optionUsesDailyReservations) ?? null;
  const reservationUsesDailyReservations = Boolean(dailyReservationOption);
  const dayOptions = showDays.filter((day) => day.show_id === (selectedStallOption?.show_id ?? selectedShowId));
  const selectedStartDayId = reservationUsesDailyReservations ? validDayId(startDayId, dayOptions) || dailyReservationOption?.show_day_start_id || dayOptions[0]?.id || "" : "";
  const selectedEndDayId = reservationUsesDailyReservations ? validDayId(endDayId, dayOptions) || dailyReservationOption?.show_day_end_id || selectedStartDayId || "" : "";
  const stallCount = selectedHorses.length;
  const stallUnitPrice = Number(selectedStallOption?.price ?? 0);
  const tackUnitPrice = Number(selectedTackOption?.price ?? 0);
  const tackQuantityNumber = selectedTackOption ? integerValue(tackQuantity, 0) : 0;
  const tackLimitRatio = selectedTackOption?.limit_per_horse_stalls ?? null;
  const allowedTackQuantity = tackLimitRatio ? Math.floor(stallCount / tackLimitRatio) : null;
  const tackQuantityMax = selectedTackOption ? Math.min(selectedTackOption.available_quantity, allowedTackQuantity ?? selectedTackOption.available_quantity) : undefined;
  const beddingUnitPrice = Number(selectedBeddingOption?.price ?? 0);
  const hayUnitPrice = Number(selectedHayOption?.price ?? 0);
  const campingUnitPrice = Number(selectedCampingOption?.price ?? 0);
  const beddingTotalQuantity = selectedHorseIds.reduce((sum, horseId) => (beddingHorseIds.includes(horseId) ? sum + positiveIntegerValue(beddingQuantities[horseId] ?? "1", 1) : sum), 0);
  const hayTotalQuantity = selectedTackOption ? integerValue(hayQuantity, 0) : 0;
  const campingQuantityNumber = selectedCampingOption ? integerValue(campingQuantity, 0) : 0;
  const stallTotal = status === "cancelled" ? 0 : stallCount * stallUnitPrice;
  const tackTotal = status === "cancelled" ? 0 : tackQuantityNumber * tackUnitPrice;
  const beddingTotal = status === "cancelled" ? 0 : beddingTotalQuantity * beddingUnitPrice;
  const hayTotal = status === "cancelled" ? 0 : hayTotalQuantity * hayUnitPrice;
  const campingTotal = status === "cancelled" ? 0 : campingQuantityNumber * campingUnitPrice;
  const totalPrice = stallTotal + tackTotal + beddingTotal + hayTotal + campingTotal;
  const hasRequiredContactRoles = requiredReservationContactRoles.every((role) => selectedContactRoles.includes(role));
  const hasHorseStallRequest = Boolean(selectedStallOption && selectedHorses.length);
  const hasTackRequest = Boolean(selectedTackOption && tackQuantityNumber > 0);
  const hasCampingRequest = Boolean(selectedCampingOption && campingQuantityNumber > 0);
  const selectedTackPayerContactId = tackPayerContactId || responsibleContactId;
  const needsTackPayer = hasTackRequest && tackBillingMode === "single_contact" && !selectedTackPayerContactId;
  const needsTackSplitHorses = hasTackRequest && tackBillingMode === "split_horses" && !selectedHorses.length;
  const campingPayerContactIdsList = Array.from({ length: Math.max(campingQuantityNumber, 0) }, (_, index) => campingPayerContactIds[String(index)] || responsibleContactId);
  const missingCampingPayerCount = hasCampingRequest ? campingPayerContactIdsList.filter((contactId) => !contactId).length : 0;
  const reservationPayerContactIds = uniqueIds([
    ...selectedHorseBillingTargets.map((target) => target.payerContactId),
    hasTackRequest && tackBillingMode === "single_contact" ? selectedTackPayerContactId : null,
    ...campingPayerContactIdsList,
  ]);
  const blockingInvoices = blockingReservationInvoices({
    invoices,
    payerContactIds: reservationPayerContactIds,
    selectedShowId,
  });
  const blockingInvoiceMessage = blockingReservationInvoiceMessage({ contacts, currency, invoices: blockingInvoices, shows });
  const hasReservationItems = hasHorseStallRequest || hasTackRequest || hasCampingRequest;
  const hasSelectedReservableProduct = Boolean(selectedStallOption || selectedTackOption || selectedCampingOption);
  const stallAvailabilityTooLow = Boolean(selectedStallOption && stallCount > selectedStallOption.available_quantity);
  const tackAvailabilityTooLow = Boolean(selectedTackOption && tackQuantityNumber > selectedTackOption.available_quantity);
  const tackLimitTooHigh = allowedTackQuantity !== null && tackQuantityNumber > allowedTackQuantity;
  const beddingAvailabilityTooLow = Boolean(selectedBeddingOption && beddingTotalQuantity > selectedBeddingOption.available_quantity);
  const hayAvailabilityTooLow = Boolean(selectedHayOption && hayTotalQuantity > selectedHayOption.available_quantity);
  const campingAvailabilityTooLow = Boolean(selectedCampingOption && campingQuantityNumber > selectedCampingOption.available_quantity);
  const hasInvalidHealth = selectedInvalidHealth.length > 0;
  const needsBeddingOption = beddingTotalQuantity > 0 && !selectedBeddingOption;
  const needsHayOption = hayTotalQuantity > 0 && !selectedHayOption;
  const needsStallOption = selectedHorseIds.length > 0 && !selectedStallOption;
  const canCreate = Boolean(
    organization &&
      profileId &&
      responsibleContactId &&
      hasRequiredContactRoles &&
      hasReservationItems &&
      !needsStallOption &&
      !needsTackPayer &&
      !needsTackSplitHorses &&
      !missingCampingPayerCount &&
      !selectedReservedHorseCount &&
      (!reservationUsesDailyReservations || (selectedStartDayId && selectedEndDayId)) &&
      !stallAvailabilityTooLow &&
      !hasInvalidHealth &&
      !tackAvailabilityTooLow &&
      !tackLimitTooHigh &&
      !beddingAvailabilityTooLow &&
      !hayAvailabilityTooLow &&
      !campingAvailabilityTooLow &&
      !needsBeddingOption &&
      !needsHayOption &&
      !blockingInvoices.length,
  );
  const availabilityLabel = selectedStallOption
    ? `${selectedStallOption.available_quantity} stall${selectedStallOption.available_quantity === 1 ? "" : "s"} disponible${selectedStallOption.available_quantity === 1 ? "" : "s"}`
    : stallChoices.length
      ? `${stallChoices.length} produit${stallChoices.length === 1 ? "" : "s"} stall pour ce show.`
      : "Aucun produit stall pour ce show.";
  const formMessage = reservationCreateMessage({
    canCreate,
    allowedTackQuantity,
    beddingAvailabilityTooLow,
    beddingTotalQuantity,
    campingAvailabilityTooLow,
    campingQuantityNumber,
    hayAvailabilityTooLow,
    hayTotalQuantity,
    dayOptions,
    hasRequiredContactRoles,
    hasReservationItems,
    invalidHealthHorseNames: selectedInvalidHealth.map((item) => item.horse.name),
    blockingInvoiceMessage,
    hasBlockingInvoiceBalance: Boolean(blockingInvoices.length),
    missingCampingPayerCount,
    needsBeddingOption,
    needsHayOption,
    needsStallOption,
    needsTackPayer,
    needsTackSplitHorses,
    organization,
    profileId,
    responsibleContactId,
    selectedReservedHorseCount,
    selectedOptionUsesDailyReservations: reservationUsesDailyReservations,
    selectedEndDayId,
    selectedHorseCount: selectedHorses.length,
    selectedStartDayId,
    selectedStallOption,
    stallAvailabilityTooLow,
    tackAvailabilityTooLow,
    tackLimitTooHigh,
    tackQuantityNumber,
    totalPrice,
    currency,
  });
  const hasTackSection = Boolean(tackChoices.length);
  const hasCampingSection = Boolean(campingChoices.length);
  const campingSectionNumber = 4 + (hasTackSection ? 1 : 0);
  const datesSectionNumber = 4 + (hasTackSection ? 1 : 0) + (hasCampingSection ? 1 : 0);

  useEffect(() => {
    if (stallOptionId && !stallChoices.some((option) => option.id === stallOptionId)) {
      setStallOptionId("");
      setStartDayId("");
      setEndDayId("");
    }
  }, [stallChoices, stallOptionId]);

  useEffect(() => {
    if (beddingOptionId && !beddingChoices.some((option) => option.id === beddingOptionId)) {
      setBeddingOptionId("");
    }
  }, [beddingChoices, beddingOptionId]);

  useEffect(() => {
    if (tackOptionId && !tackChoices.some((option) => option.id === tackOptionId)) {
      setTackOptionId("");
      setTackQuantity("0");
    }
  }, [tackChoices, tackOptionId]);

  useEffect(() => {
    if (hayOptionId && !hayChoices.some((option) => option.id === hayOptionId)) {
      setHayOptionId("");
      setHayQuantity("0");
    }
  }, [hayChoices, hayOptionId]);

  useEffect(() => {
    if (campingOptionId && !campingChoices.some((option) => option.id === campingOptionId)) {
      setCampingOptionId("");
      setCampingQuantity("0");
    }
  }, [campingChoices, campingOptionId]);

  useEffect(() => {
    setBeddingHorseIds((current) => current.filter((horseId) => selectedHorseIds.includes(horseId)));
    setHorsePayerContactIds((current) => Object.fromEntries(Object.entries(current).filter(([horseId]) => selectedHorseIds.includes(horseId))));
  }, [selectedHorseIds]);

  useEffect(() => {
    setCampingPayerContactIds((current) => Object.fromEntries(Object.entries(current).filter(([index]) => Number(index) < campingQuantityNumber)));
  }, [campingQuantityNumber]);

  useEffect(() => {
    setSelectedHorseIds((current) => current.filter((horseId) => !reservedHorseBookingById.has(horseId)));
  }, [reservedHorseIdsKey, selectedShowId]);

  useEffect(() => {
    if (!selectedTackOption || tackQuantityNumber <= 0) {
      setHayOptionId("");
      setHayQuantity("0");
    }
  }, [selectedTackOption, tackQuantityNumber]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate || !organization || !profileId || !responsibleContactId) {
      return;
    }

    setBusy(true);

    try {
      const activeOrganization = organization;

      await ensureContactRoles({
        organization_id: activeOrganization.id,
        contact_id: responsibleContactId,
        roles: selectedContactRoles,
        source: "manual",
      });

      const bookingStatus = allowStatusEdit ? status : defaultStatus;

      async function createInventoryBooking(option: StallOption, quantity: number, productName: string) {
        await onCreateStallBooking({
          organization_id: activeOrganization.id,
          show_id: option.show_id,
          stall_option_id: option.id,
          created_by_user_id: profileId,
          booker_contact_id: responsibleContactId,
          payer_contact_id: responsibleContactId,
          status: bookingStatus,
          show_day_start_id: optionUsesDailyReservations(option) ? option.show_day_start_id || selectedStartDayId || null : null,
          show_day_end_id: optionUsesDailyReservations(option) ? option.show_day_end_id || selectedEndDayId || null : null,
          quantity,
          unit_price: Number(option.price ?? 0),
          total_price: 0,
          affects_inventory: true,
          billable: false,
          notes: reservationStandaloneNotes(notes, `${productName} - inventaire split`),
        });
      }

      async function createSplitBookings(option: StallOption, totalAmount: number, productName: string) {
        const splitAmounts = splitAmountEvenly(totalAmount, selectedHorseBillingTargets.length);

        for (const [index, target] of selectedHorseBillingTargets.entries()) {
          const splitAmount = splitAmounts[index] ?? 0;

          await onCreateStallBooking({
            organization_id: activeOrganization.id,
            show_id: option.show_id,
            stall_option_id: option.id,
            horse_id: target.horse.id,
            created_by_user_id: profileId,
            booker_contact_id: responsibleContactId,
            payer_contact_id: target.payerContactId,
            status: bookingStatus,
            show_day_start_id: optionUsesDailyReservations(option) ? option.show_day_start_id || selectedStartDayId || null : null,
            show_day_end_id: optionUsesDailyReservations(option) ? option.show_day_end_id || selectedEndDayId || null : null,
            quantity: 1,
            unit_price: splitAmount,
            total_price: status === "cancelled" ? 0 : splitAmount,
            affects_inventory: false,
            billable: true,
            notes: reservationLineNotes(notes, target.horse, `Partage ${productName}`),
          });
        }
      }

      if (selectedStallOption) {
        for (const target of selectedHorseBillingTargets) {
          await onCreateStallBooking({
            organization_id: activeOrganization.id,
            show_id: selectedStallOption.show_id,
            stall_option_id: selectedStallOption.id,
            horse_id: target.horse.id,
            created_by_user_id: profileId,
            booker_contact_id: responsibleContactId,
            payer_contact_id: target.payerContactId,
            status: bookingStatus,
            show_day_start_id: optionUsesDailyReservations(selectedStallOption) ? selectedStartDayId || null : null,
            show_day_end_id: optionUsesDailyReservations(selectedStallOption) ? selectedEndDayId || null : null,
            quantity: 1,
            unit_price: stallUnitPrice,
            total_price: status === "cancelled" ? 0 : stallUnitPrice,
            notes: reservationLineNotes(notes, target.horse, "Stall"),
          });

          if (selectedBeddingOption && beddingHorseIds.includes(target.horse.id)) {
            const beddingQuantity = positiveIntegerValue(beddingQuantities[target.horse.id] ?? "1", 1);

            await onCreateStallBooking({
              organization_id: activeOrganization.id,
              show_id: selectedBeddingOption.show_id,
              stall_option_id: selectedBeddingOption.id,
              horse_id: target.horse.id,
              created_by_user_id: profileId,
              booker_contact_id: responsibleContactId,
              payer_contact_id: target.payerContactId,
              status: bookingStatus,
              show_day_start_id: optionUsesDailyReservations(selectedBeddingOption) ? selectedBeddingOption.show_day_start_id || selectedStartDayId || null : null,
              show_day_end_id: optionUsesDailyReservations(selectedBeddingOption) ? selectedBeddingOption.show_day_end_id || selectedEndDayId || null : null,
              quantity: beddingQuantity,
              unit_price: beddingUnitPrice,
              total_price: status === "cancelled" ? 0 : beddingUnitPrice * beddingQuantity,
              notes: reservationLineNotes(notes, target.horse, selectedBeddingOption.name),
            });
          }
        }
      }

      if (selectedTackOption && tackQuantityNumber > 0) {
        if (tackBillingMode === "split_horses") {
          await createInventoryBooking(selectedTackOption, tackQuantityNumber, selectedTackOption.name);
          await createSplitBookings(selectedTackOption, tackTotal, selectedTackOption.name);
        } else {
          await onCreateStallBooking({
            organization_id: activeOrganization.id,
            show_id: selectedTackOption.show_id,
            stall_option_id: selectedTackOption.id,
            created_by_user_id: profileId,
            booker_contact_id: responsibleContactId,
            payer_contact_id: selectedTackPayerContactId,
            status: bookingStatus,
            show_day_start_id: optionUsesDailyReservations(selectedTackOption) ? selectedTackOption.show_day_start_id || selectedStartDayId || null : null,
            show_day_end_id: optionUsesDailyReservations(selectedTackOption) ? selectedTackOption.show_day_end_id || selectedEndDayId || null : null,
            quantity: tackQuantityNumber,
            unit_price: tackUnitPrice,
            total_price: status === "cancelled" ? 0 : tackUnitPrice * tackQuantityNumber,
            notes: reservationStandaloneNotes(notes, selectedTackOption.name),
          });
        }

        if (selectedHayOption && hayTotalQuantity > 0) {
          if (tackBillingMode === "split_horses") {
            await createInventoryBooking(selectedHayOption, hayTotalQuantity, selectedHayOption.name);
            await createSplitBookings(selectedHayOption, hayTotal, `${selectedHayOption.name} pour ${selectedTackOption.name}`);
          } else {
            await onCreateStallBooking({
              organization_id: activeOrganization.id,
              show_id: selectedHayOption.show_id,
              stall_option_id: selectedHayOption.id,
              created_by_user_id: profileId,
              booker_contact_id: responsibleContactId,
              payer_contact_id: selectedTackPayerContactId,
              status: bookingStatus,
              show_day_start_id: optionUsesDailyReservations(selectedHayOption) ? selectedHayOption.show_day_start_id || selectedStartDayId || null : null,
              show_day_end_id: optionUsesDailyReservations(selectedHayOption) ? selectedHayOption.show_day_end_id || selectedEndDayId || null : null,
              quantity: hayTotalQuantity,
              unit_price: hayUnitPrice,
              total_price: status === "cancelled" ? 0 : hayUnitPrice * hayTotalQuantity,
              notes: reservationStandaloneNotes(notes, `${selectedHayOption.name} pour ${selectedTackOption.name}`),
            });
          }
        }
      }

      if (selectedCampingOption && campingQuantityNumber > 0) {
        for (const [index, payerContactId] of campingPayerContactIdsList.entries()) {
          await onCreateStallBooking({
            organization_id: activeOrganization.id,
            show_id: selectedCampingOption.show_id,
            stall_option_id: selectedCampingOption.id,
            created_by_user_id: profileId,
            booker_contact_id: responsibleContactId,
            payer_contact_id: payerContactId,
            status: bookingStatus,
            show_day_start_id: optionUsesDailyReservations(selectedCampingOption) ? selectedCampingOption.show_day_start_id || selectedStartDayId || null : null,
            show_day_end_id: optionUsesDailyReservations(selectedCampingOption) ? selectedCampingOption.show_day_end_id || selectedEndDayId || null : null,
            quantity: 1,
            unit_price: campingUnitPrice,
            total_price: status === "cancelled" ? 0 : campingUnitPrice,
            notes: reservationStandaloneNotes(notes, `${selectedCampingOption.name} #${index + 1}`),
          });
        }
      }

      setStallOptionId("");
      setTackOptionId("");
      setTackQuantity("0");
      setBeddingOptionId("");
      setHayOptionId("");
      setHayQuantity("0");
      setCampingOptionId("");
      setCampingQuantity("0");
      setCampingPayerContactIds({});
      setSelectedHorseIds([]);
      setHorsePayerContactIds({});
      setBeddingHorseIds([]);
      setBeddingQuantities({});
      setResponsibleContactId("");
      setSelectedContactRoles(requiredReservationContactRoles);
      setNotes("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  function toggleHorse(horseId: string) {
    if (reservedHorseBookingById.has(horseId) || (healthRequired && !horseHealthValidity(horseId).valid)) {
      return;
    }

    setSelectedHorseIds((current) => toggleValue(current, horseId));
  }

  function toggleBedding(horseId: string) {
    setBeddingHorseIds((current) => toggleValue(current, horseId));
    setBeddingQuantities((current) => (current[horseId] ? current : { ...current, [horseId]: "1" }));
  }

  function toggleContactRole(role: ContactRoleName) {
    setSelectedContactRoles((current) => toggleValue(current, role));
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{formMessage}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="form-section-header">
            <strong>1. Contact</strong>
            <span>Un seul contact responsable pour la demande.</span>
          </div>
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label="Contact responsable"
            organization={organization}
            role="booker"
            value={responsibleContactId}
            onChange={setResponsibleContactId}
            onCreateContact={onCreateContact}
          />
          <div className="contact-role-grid" aria-label="Roles du contact">
            {reservationContactRoleChoices.map((choice) => (
              <label className="contact-role-option" key={choice.role}>
                <input checked={selectedContactRoles.includes(choice.role)} type="checkbox" onChange={() => toggleContactRole(choice.role)} />
                <span>
                  <strong>{choice.label}</strong>
                  <small>{choice.detail}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <strong>2. Stall</strong>
            <span>{availabilityLabel}</span>
          </div>
          <label>
            Show
            <select
              disabled={!shows.length}
              value={selectedShowId}
              onChange={(event) => {
                setShowId(event.target.value);
                setStallOptionId("");
                setTackOptionId("");
                setTackQuantity("0");
                setTackPayerContactId("");
                setBeddingOptionId("");
                setHayOptionId("");
                setHayQuantity("0");
                setCampingOptionId("");
                setCampingQuantity("0");
                setCampingPayerContactIds({});
                setSelectedHorseIds([]);
                setHorsePayerContactIds({});
                setBeddingHorseIds([]);
                setBeddingQuantities({});
                setStartDayId("");
                setEndDayId("");
              }}
            >
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Produit stall
            <select
              disabled={!stallChoices.length}
              required
              value={stallOptionId}
              onChange={(event) => {
                setStallOptionId(event.target.value);
                setStartDayId("");
                setEndDayId("");
              }}
            >
              <option value="">Choisir le type de stall</option>
              {stallChoices.map((option) => (
                <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                  {reservationOptionSelectLabel(option, currency)}
                </option>
              ))}
            </select>
          </label>
          <ReservationProductSummary currency={currency} option={selectedStallOption} quantityNumber={Math.max(stallCount, 1)} quantityTooHigh={stallAvailabilityTooLow} totalPrice={stallTotal} />
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <strong>3. Chevaux</strong>
            <span>
              {selectedHorses.length
                ? `${selectedHorses.length} stall${selectedHorses.length === 1 ? "" : "s"} a reserver.`
                : availableHorseCount
                  ? `${availableHorseCount} cheval${availableHorseCount === 1 ? "" : "x"} disponible${availableHorseCount === 1 ? "" : "s"} pour ce show.`
                  : "Tous les chevaux ont deja un stall pour ce show."}
            </span>
          </div>
          {!horses.length ? <EmptyState label="Ajoute d'abord les chevaux avant de reserver des stalls." /> : null}
          {horses.length && !availableHorseCount ? <EmptyState label="Tous les chevaux ont deja un stall pour ce show." /> : null}
          <div className="horse-reservation-list">
            {horses.map((horse) => {
              const reservedBooking = reservedHorseBookingById.get(horse.id);
              const reservedOption = reservedBooking ? findById(stallOptions, reservedBooking.stall_option_id) : null;
              const alreadyReserved = Boolean(reservedBooking);
              const healthValidity = horseHealthValidity(horse.id);
              const healthUnavailable = healthRequired && !healthValidity.valid;
              const selected = selectedHorseIds.includes(horse.id);
              const beddingSelected = beddingHorseIds.includes(horse.id);

              return (
                <div className={`horse-reservation-row ${selected ? "selected" : ""} ${alreadyReserved || healthUnavailable ? "unavailable" : ""}`} key={horse.id}>
                  <label className="horse-reservation-main">
                    <input checked={selected && !alreadyReserved && !healthUnavailable} disabled={alreadyReserved || healthUnavailable} type="checkbox" onChange={() => toggleHorse(horse.id)} />
                    <span>
                      <strong>
                        {horse.name}
                        {alreadyReserved ? <em className="horse-reservation-status">Deja reserve</em> : null}
                        {healthUnavailable ? <em className="horse-reservation-status">{stallHealthValidityTagLabel(healthValidity)}</em> : null}
                      </strong>
                      <small>
                        {alreadyReserved
                          ? `Stall deja reserve: ${reservedOption?.name ?? "Stall"}`
                          : `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${stallHealthValidityMessage(healthValidity)}`}
                      </small>
                    </span>
                  </label>
                  {selected && !alreadyReserved ? (
                    <>
                      <div className="horse-billing-grid">
                        <label>
                          Facturer a
                          <SearchSelect
                            items={contactItems}
                            placeholder="Contact a facturer"
                            value={horsePayerContactIds[horse.id] || horse.primary_owner_contact_id}
                            onChange={(contactId) => setHorsePayerContactIds((current) => ({ ...current, [horse.id]: contactId }))}
                          />
                        </label>
                      </div>
                      <div className="horse-addons">
                        <label>
                          <input checked={beddingSelected} disabled={!beddingChoices.length} type="checkbox" onChange={() => toggleBedding(horse.id)} />
                          Ajouter de la ripe
                        </label>
                        {beddingSelected ? (
                          <input
                            aria-label={`Quantite de ripe pour ${horse.name}`}
                            min="1"
                            step="1"
                            type="number"
                            value={beddingQuantities[horse.id] ?? "1"}
                            onChange={(event) => setBeddingQuantities((current) => ({ ...current, [horse.id]: event.target.value }))}
                          />
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          {beddingHorseIds.length ? (
            <label>
              Produit ripe
              <select disabled={!beddingChoices.length} required value={selectedBeddingOption?.id ?? ""} onChange={(event) => setBeddingOptionId(event.target.value)}>
                <option value="">Choisir la ripe</option>
                {beddingChoices.map((option) => (
                  <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                    {reservationOptionSelectLabel(option, currency)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {tackChoices.length ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>4. Tack stalls</strong>
              <span>{selectedTackOption?.limit_per_horse_stalls ? `Limite: 1 tack stall par ${selectedTackOption.limit_per_horse_stalls} stall${selectedTackOption.limit_per_horse_stalls === 1 ? "" : "s"} chevaux.` : "Optionnel, non attitre a un cheval."}</span>
            </div>
            <div className="form-grid">
              <label>
                Produit tack
                <select
                  value={tackOptionId}
                  onChange={(event) => {
                    setTackOptionId(event.target.value);
                    setTackQuantity(event.target.value ? "1" : "0");
                  }}
                >
                  <option value="">Aucun tack stall</option>
                  {tackChoices.map((option) => (
                    <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                      {reservationOptionSelectLabel(option, currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantite
                <input disabled={!selectedTackOption} max={tackQuantityMax} min="0" step="1" type="number" value={tackQuantity} onChange={(event) => setTackQuantity(event.target.value)} />
              </label>
            </div>
            {selectedTackOption ? (
              <ReservationProductSummary availableQuantity={tackQuantityMax} currency={currency} option={selectedTackOption} quantityNumber={Math.max(tackQuantityNumber, 0)} quantityTooHigh={tackAvailabilityTooLow || tackLimitTooHigh} totalPrice={tackTotal} />
            ) : null}
            {selectedTackOption ? (
              <div className="form-section nested-section">
                <div className="form-section-header">
                  <strong>Facturation tack</strong>
                  <span>{tackBillingMode === "split_horses" ? "Divise le tack et le foin entre les chevaux selectionnes." : "Facture le tack et le foin a un seul contact."}</span>
                </div>
                <div className="segmented-control">
                  <button className={tackBillingMode === "split_horses" ? "active" : ""} disabled={!selectedHorses.length} type="button" onClick={() => setTackBillingMode("split_horses")}>
                    Split chevaux
                  </button>
                  <button className={tackBillingMode === "single_contact" ? "active" : ""} type="button" onClick={() => setTackBillingMode("single_contact")}>
                    Un contact
                  </button>
                </div>
                {tackBillingMode === "single_contact" ? (
                  <ContactPicker
                    contacts={contacts}
                    contactRoles={contactRoles}
                    createdByUserId={profileId}
                    disabled={!organization}
                    label="Facturer tack a"
                    organization={organization}
                    role="payer"
                    value={selectedTackPayerContactId}
                    onChange={setTackPayerContactId}
                    onCreateContact={onCreateContact}
                  />
                ) : (
                  <div className="billing-preview-list">
                    {selectedHorseBillingTargets.length ? (
                      selectedHorseBillingTargets.map((target) => (
                        <span key={target.horse.id}>
                          {target.horse.name} / {contactLabel(findById(contacts, target.payerContactId))}
                        </span>
                      ))
                    ) : (
                      <span>Choisir les chevaux a inclure dans le split.</span>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {selectedTackOption && hayChoices.length ? (
              <>
                <div className="form-grid">
                  <label>
                    Foin pour tack stall
                    <select
                      value={hayOptionId}
                      onChange={(event) => {
                        setHayOptionId(event.target.value);
                        setHayQuantity(event.target.value ? "1" : "0");
                      }}
                    >
                      <option value="">Aucun foin</option>
                      {hayChoices.map((option) => (
                        <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                          {reservationOptionSelectLabel(option, currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantite foin
                    <input disabled={!selectedHayOption} max={selectedHayOption?.available_quantity} min="0" step="1" type="number" value={hayQuantity} onChange={(event) => setHayQuantity(event.target.value)} />
                  </label>
                </div>
                {selectedHayOption ? <ReservationProductSummary currency={currency} option={selectedHayOption} quantityNumber={Math.max(hayTotalQuantity, 0)} quantityTooHigh={hayAvailabilityTooLow} totalPrice={hayTotal} /> : null}
              </>
            ) : null}
          </div>
        ) : null}

        {campingChoices.length ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>{campingSectionNumber}. Camping</strong>
              <span>{selectedCampingOption ? `${selectedCampingOption.available_quantity} disponible${selectedCampingOption.available_quantity === 1 ? "" : "s"}.` : "Optionnel, non attitre a un cheval."}</span>
            </div>
            <div className="form-grid">
              <label>
                Produit camping
                <select
                  value={campingOptionId}
                  onChange={(event) => {
                    setCampingOptionId(event.target.value);
                    setCampingQuantity(event.target.value ? "1" : "0");
                  }}
                >
                  <option value="">Aucun camping</option>
                  {campingChoices.map((option) => (
                    <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                      {reservationOptionSelectLabel(option, currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantite
                <input disabled={!selectedCampingOption} max={selectedCampingOption?.available_quantity} min="0" step="1" type="number" value={campingQuantity} onChange={(event) => setCampingQuantity(event.target.value)} />
              </label>
            </div>
            {selectedCampingOption ? (
              <ReservationProductSummary currency={currency} option={selectedCampingOption} quantityNumber={Math.max(campingQuantityNumber, 0)} quantityTooHigh={campingAvailabilityTooLow} totalPrice={campingTotal} />
            ) : null}
            {selectedCampingOption && campingQuantityNumber > 0 ? (
              <div className="camping-assignment-list">
                {Array.from({ length: campingQuantityNumber }, (_, index) => {
                  const key = String(index);
                  const assignedContactId = campingPayerContactIds[key] || responsibleContactId;

                  return (
                    <div className="camping-assignment-row" key={key}>
                      <strong>Camping #{index + 1}</strong>
                      <ContactPicker
                        contacts={contacts}
                        contactRoles={contactRoles}
                        createdByUserId={profileId}
                        disabled={!organization}
                        label="Facturer a"
                        organization={organization}
                        role="payer"
                        value={assignedContactId}
                        onChange={(contactId) => setCampingPayerContactIds((current) => ({ ...current, [key]: contactId }))}
                        onCreateContact={onCreateContact}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="form-section">
          <div className="form-section-header">
            <strong>{datesSectionNumber}. Dates et facture</strong>
            <span>{canCreate ? `Total: ${formatCurrency(totalPrice, currency)}` : reservationUsesDailyReservations ? "Choisir les journees requises." : "Completer les informations requises."}</span>
          </div>
          <div className="form-grid">
            {allowStatusEdit ? (
              <label>
                Statut
                <select disabled={!hasSelectedReservableProduct} value={status} onChange={(event) => setStatus(event.target.value as StallBooking["status"])}>
                  {bookingStatuses.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Statut
                <input disabled value={defaultStatus} />
              </label>
            )}
          </div>
          {reservationUsesDailyReservations ? (
            <div className="form-grid">
              <label>
                Jour debut
                <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                  {dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Jour fin
                <select disabled={!dayOptions.length} value={selectedEndDayId} onChange={(event) => setEndDayId(event.target.value)}>
                  {dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="reservation-total-summary">
            <span>
              <strong>{stallCount}</strong>
              <small>Stalls</small>
            </span>
            <span>
              <strong>{tackQuantityNumber}</strong>
              <small>Tack</small>
            </span>
            <span>
              <strong>{beddingTotalQuantity}</strong>
              <small>Ripe</small>
            </span>
            <span>
              <strong>{hayTotalQuantity}</strong>
              <small>Foin</small>
            </span>
            <span>
              <strong>{campingQuantityNumber}</strong>
              <small>Camping</small>
            </span>
            <span>
              <strong>{formatCurrency(totalPrice, currency)}</strong>
              <small>Total facture</small>
            </span>
          </div>
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          Creer reservation
        </button>
      </form>
    </section>
  );
}

function StallBookingEditForm({
  booking,
  contacts,
  contactRoles,
  currency,
  horseHealthDocuments,
  horses,
  invoices,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  onCancel,
  onCreateContact,
  onUpdateStallBooking,
}: {
  booking: StallBooking;
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  invoices: Invoice[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
}) {
  const [optionId, setOptionId] = useState(booking.stall_option_id);
  const [horseId, setHorseId] = useState(booking.horse_id ?? "");
  const [bookerContactId, setBookerContactId] = useState(booking.booker_contact_id);
  const [payerContactId, setPayerContactId] = useState(booking.payer_contact_id);
  const [status, setStatus] = useState<StallBooking["status"]>(booking.status);
  const [quantity, setQuantity] = useState(String(booking.quantity ?? 1));
  const [startDayId, setStartDayId] = useState(booking.show_day_start_id ?? "");
  const [endDayId, setEndDayId] = useState(booking.show_day_end_id ?? "");
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [busy, setBusy] = useState(false);
  const optionChoices = stallOptions.filter((option) => option.show_id === booking.show_id);
  const selectedOption = findById(optionChoices, optionId) ?? findById(stallOptions, booking.stall_option_id);
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedShow = findById(shows, booking.show_id) ?? null;
  const selectedHealthValidity = selectedHorse
    ? getStallHorseHealthValidity({
        documents: horseHealthDocuments,
        horseId: selectedHorse.id,
        organization,
        referenceDate: selectedShow?.start_date ?? null,
      })
    : null;
  const dayOptions = showDays.filter((day) => day.show_id === booking.show_id);
  const selectedOptionUsesDailyReservations = optionUsesDailyReservations(selectedOption ?? null);
  const selectedStartDayId = selectedOptionUsesDailyReservations ? validDayId(startDayId, dayOptions) || selectedOption?.show_day_start_id || dayOptions[0]?.id || "" : "";
  const selectedEndDayId = selectedOptionUsesDailyReservations ? validDayId(endDayId, dayOptions) || selectedOption?.show_day_end_id || selectedStartDayId : "";
  const quantityNumber = positiveIntegerValue(quantity, 1);
  const unitPrice = Number(selectedOption?.price ?? booking.unit_price ?? 0);
  const totalPrice = status === "cancelled" ? 0 : unitPrice * quantityNumber;
  const currentReservedQuantity = booking.status === "cancelled" ? 0 : Number(booking.quantity ?? 1);
  const editableAvailability = selectedOption ? selectedOption.available_quantity + (selectedOption.id === booking.stall_option_id ? currentReservedQuantity : 0) : 0;
  const quantityTooHigh = Boolean(selectedOption && status !== "cancelled" && quantityNumber > editableAvailability);
  const healthBlocksBooking = Boolean(
      selectedHorse &&
      organizationRequiresHealthVerification(organization) &&
      selectedHealthValidity &&
      !selectedHealthValidity.valid &&
      !["cancelled", "completed"].includes(status),
  );
  const blockingInvoices = blockingReservationInvoices({
    invoices,
    payerContactIds: payerContactId ? [payerContactId] : [],
    selectedShowId: booking.show_id,
  });
  const blocksBalance = !["cancelled", "completed"].includes(status) && blockingInvoices.length > 0;
  const blockingInvoiceMessage = blockingReservationInvoiceMessage({ contacts, currency, invoices: blockingInvoices, shows });
  const canUpdate = Boolean(selectedOption && bookerContactId && payerContactId && (!selectedOptionUsesDailyReservations || (selectedStartDayId && selectedEndDayId)) && !quantityTooHigh && !healthBlocksBooking && !blocksBalance);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUpdate || !selectedOption || !bookerContactId || !payerContactId) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateStallBooking(booking.id, {
        stall_option_id: selectedOption.id,
        horse_id: selectedHorse?.id ?? null,
        booker_contact_id: bookerContactId,
        payer_contact_id: payerContactId,
        status,
        show_day_start_id: selectedOptionUsesDailyReservations ? selectedStartDayId || null : null,
        show_day_end_id: selectedOptionUsesDailyReservations ? selectedEndDayId || null : null,
        quantity: quantityNumber,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: notes || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>Modifier reservation</h2>
          <p>
            {healthBlocksBooking && selectedHealthValidity
              ? stallHealthValidityMessage(selectedHealthValidity)
              : blocksBalance
                ? blockingInvoiceMessage
                : quantityTooHigh
                  ? `Seulement ${editableAvailability} disponible pour ce produit.`
                  : `Ligne de facture: ${formatCurrency(totalPrice, currency)}.`}
          </p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="form-section-header">
            <strong>1. Produit</strong>
            <span>{selectedOption ? `Disponible pour edition: ${editableAvailability}` : "Choisir le produit a modifier."}</span>
          </div>
          <label>
            Produit de reservation
            <select disabled={!optionChoices.length} required value={optionId} onChange={(event) => setOptionId(event.target.value)}>
              <option value="">Choisir un produit</option>
              {optionChoices.map((option) => (
                <option key={option.id} value={option.id}>
                  {reservationOptionSelectLabel(option, currency)}
                </option>
              ))}
            </select>
          </label>
          <ReservationProductSummary availableQuantity={editableAvailability} currency={currency} option={selectedOption ?? null} quantityNumber={quantityNumber} quantityTooHigh={quantityTooHigh} totalPrice={totalPrice} />
          <div className="form-grid">
            <label>
              Quantite
              <input max={editableAvailability || undefined} min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>
              Statut
              <select value={status} onChange={(event) => setStatus(event.target.value as StallBooking["status"])}>
                {bookingStatuses.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <strong>2. Contacts</strong>
            <span>Roles booker et payer assignes automatiquement.</span>
          </div>
          <label>
            Cheval
            <SearchSelect
              allowEmpty
              items={horses.map((horse) => {
                const validity = getStallHorseHealthValidity({
                  documents: horseHealthDocuments,
                  horseId: horse.id,
                  organization,
                  referenceDate: selectedShow?.start_date ?? null,
                });

                return {
                  id: horse.id,
                  label: horse.name,
                  detail: `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${stallHealthValidityMessage(validity)}`,
                };
              })}
              placeholder="Search horse"
              value={selectedHorse?.id ?? ""}
              onChange={setHorseId}
            />
          </label>
          {selectedHealthValidity ? <p className={`inline-health-message ${stallHealthValidityTone(selectedHealthValidity)}`}>{stallHealthValidityMessage(selectedHealthValidity)}</p> : null}
          <div className="form-grid">
            <ContactPicker
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              label="Reserve par"
              organization={organization}
              role="booker"
              value={bookerContactId}
              onChange={setBookerContactId}
              onCreateContact={onCreateContact}
            />
            <ContactPicker
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              label="Facture a"
              organization={organization}
              role="payer"
              value={payerContactId}
              onChange={setPayerContactId}
              onCreateContact={onCreateContact}
            />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <strong>3. Dates et notes</strong>
            <span>
              {selectedOptionUsesDailyReservations
                ? dayOptions.length
                  ? `${dayOptions.length} jour${dayOptions.length === 1 ? "" : "s"} disponible${dayOptions.length === 1 ? "" : "s"}.`
                  : "Aucun jour disponible."
                : ""}
            </span>
          </div>
          {selectedOptionUsesDailyReservations ? (
            <div className="form-grid">
              <label>
                Jour debut
                <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                  {dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Jour fin
                <select disabled={!dayOptions.length} value={selectedEndDayId} onChange={(event) => setEndDayId(event.target.value)}>
                  {dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <FormActions busy={busy || !canUpdate} onCancel={onCancel} />
      </form>
    </section>
  );
}

function invoiceForBooking(booking: StallBooking, invoices: Invoice[], lineItems: InvoiceLineItem[]) {
  const lineItem = lineItems.find((item) => item.item_id === booking.id && (item.item_type === "stall" || item.item_type === "extra"));
  return lineItem ? findById(invoices, lineItem.invoice_id) : undefined;
}

function reservationInvoiceState(invoice: Invoice | undefined, currency: string) {
  if (!invoice) {
    return {
      badgeClass: "warning",
      confirmationLabel: "Facture a creer",
      detail: "La reservation attend sa ligne de facture.",
    };
  }

  const invoiceNumber = `#${formatInvoiceNumber(invoice.invoice_number)}`;
  const balance = Number(invoice.balance_due ?? 0);

  if (invoice.status === "void") {
    return {
      badgeClass: "void",
      confirmationLabel: "Facture annulee",
      detail: `${invoiceNumber} - ${invoiceStatusLabel(invoice.status)}`,
    };
  }

  if (invoice.status === "paid" || balance <= 0) {
    return {
      badgeClass: "paid",
      confirmationLabel: "Confirmee",
      detail: `${invoiceNumber} - ${invoiceStatusLabel(invoice.status)}`,
    };
  }

  return {
    badgeClass: invoice.status === "overdue" ? "overdue" : "warning",
    confirmationLabel: "Solde ouvert",
    detail: `${invoiceNumber} - ${invoiceStatusLabel(invoice.status)} - ${formatCurrency(balance, currency)}`,
  };
}

function bookingStatusLabel(status: StallBooking["status"]) {
  switch (status) {
    case "requested":
      return "Demandee";
    case "reserved":
      return "Reservee";
    case "active":
      return "Active";
    case "cancelled":
      return "Annulee";
    case "completed":
      return "Completee";
    default:
      return status;
  }
}

function invoiceStatusLabel(status: Invoice["status"]) {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "sent":
      return "Envoyee";
    case "viewed":
      return "Consultee";
    case "partially_paid":
      return "Partiellement payee";
    case "paid":
      return "Payee";
    case "overdue":
      return "En retard";
    case "void":
      return "Annulee";
    default:
      return status;
  }
}

function formatInvoiceNumber(value: string) {
  const normalized = value.trim();
  return /^\d{1,4}$/.test(normalized) ? normalized.padStart(4, "0") : normalized;
}

function blockingReservationInvoices({
  invoices,
  payerContactIds,
  selectedShowId,
}: {
  invoices: Invoice[];
  payerContactIds: string[];
  selectedShowId: string;
}) {
  const payerIds = new Set(payerContactIds.filter(Boolean));

  if (!payerIds.size || !selectedShowId) {
    return [];
  }

  return invoices.filter(
    (invoice) =>
      payerIds.has(invoice.payer_contact_id) &&
      invoice.show_id !== selectedShowId &&
      invoiceHasOpenBalance(invoice),
  );
}

function blockingReservationInvoiceMessage({
  contacts,
  currency,
  invoices,
  shows,
}: {
  contacts: Contact[];
  currency: string;
  invoices: Invoice[];
  shows: Show[];
}) {
  const invoice = invoices[0];

  if (!invoice) {
    return "";
  }

  const payerName = contactLabel(findById(contacts, invoice.payer_contact_id));
  const showName = showLabel(findById(shows, invoice.show_id));
  const remaining = invoices.reduce((sum, candidate) => sum + Number(candidate.balance_due ?? 0), 0);

  return `${payerName} a un solde ouvert de ${formatCurrency(remaining, currency)} dans cette association (${showName}, facture #${formatInvoiceNumber(invoice.invoice_number)}). Impossible de reserver pour un autre evenement avant paiement.`;
}

function invoiceHasOpenBalance(invoice: Invoice) {
  return !["paid", "void"].includes(invoice.status) && Number(invoice.balance_due ?? 0) > 0;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function reservationCreateMessage({
  allowedTackQuantity,
  beddingAvailabilityTooLow,
  beddingTotalQuantity,
  blockingInvoiceMessage,
  canCreate,
  campingAvailabilityTooLow,
  campingQuantityNumber,
  currency,
  dayOptions,
  hasBlockingInvoiceBalance,
  hayAvailabilityTooLow,
  hayTotalQuantity,
  hasRequiredContactRoles,
  hasReservationItems,
  invalidHealthHorseNames,
  missingCampingPayerCount,
  needsBeddingOption,
  needsHayOption,
  needsStallOption,
  needsTackPayer,
  needsTackSplitHorses,
  organization,
  profileId,
  responsibleContactId,
  selectedOptionUsesDailyReservations,
  selectedEndDayId,
  selectedHorseCount,
  selectedReservedHorseCount,
  selectedStartDayId,
  selectedStallOption,
  stallAvailabilityTooLow,
  tackAvailabilityTooLow,
  tackLimitTooHigh,
  tackQuantityNumber,
  totalPrice,
}: {
  allowedTackQuantity: number | null;
  beddingAvailabilityTooLow: boolean;
  beddingTotalQuantity: number;
  blockingInvoiceMessage: string;
  canCreate: boolean;
  campingAvailabilityTooLow: boolean;
  campingQuantityNumber: number;
  currency: string;
  dayOptions: ShowDay[];
  hasBlockingInvoiceBalance: boolean;
  hayAvailabilityTooLow: boolean;
  hayTotalQuantity: number;
  hasRequiredContactRoles: boolean;
  hasReservationItems: boolean;
  invalidHealthHorseNames: string[];
  missingCampingPayerCount: number;
  needsBeddingOption: boolean;
  needsHayOption: boolean;
  needsStallOption: boolean;
  needsTackPayer: boolean;
  needsTackSplitHorses: boolean;
  organization: Organization | null;
  profileId: string;
  responsibleContactId: string;
  selectedOptionUsesDailyReservations: boolean;
  selectedEndDayId: string;
  selectedHorseCount: number;
  selectedReservedHorseCount: number;
  selectedStartDayId: string;
  selectedStallOption: StallOption | null;
  stallAvailabilityTooLow: boolean;
  tackAvailabilityTooLow: boolean;
  tackLimitTooHigh: boolean;
  tackQuantityNumber: number;
  totalPrice: number;
}) {
  if (canCreate) {
    return `Reservation prete. Total: ${formatCurrency(totalPrice, currency)}.`;
  }

  if (!organization) {
    return "Choisir une association avant de creer une reservation.";
  }

  if (!profileId) {
    return "Le profil usager charge encore.";
  }

  if (!responsibleContactId) {
    return "Choisir ou creer le contact responsable.";
  }

  if (!hasRequiredContactRoles) {
    return "Le contact responsable doit etre booker pour creer la reservation.";
  }

  if (hasBlockingInvoiceBalance) {
    return blockingInvoiceMessage;
  }

  if (needsStallOption || (selectedHorseCount > 0 && !selectedStallOption)) {
    return "Choisir le type de stall.";
  }

  if (needsTackSplitHorses) {
    return "Choisir les chevaux qui partageront les frais de tack.";
  }

  if (needsTackPayer) {
    return "Choisir le contact a facturer pour le tack.";
  }

  if (missingCampingPayerCount) {
    return `Assigner ${missingCampingPayerCount} camping${missingCampingPayerCount === 1 ? "" : "s"} a un contact.`;
  }

  if (selectedStallOption && !selectedHorseCount && !hasReservationItems) {
    return "Choisir au moins un cheval pour reserver un stall.";
  }

  if (!hasReservationItems) {
    return "Choisir au moins un stall, un tack stall ou du camping.";
  }

  if (selectedReservedHorseCount) {
    return `${selectedReservedHorseCount} cheval${selectedReservedHorseCount === 1 ? "" : "x"} a deja un stall pour ce show.`;
  }

  if (invalidHealthHorseNames.length) {
    return `Documents sante invalides pour ${invalidHealthHorseNames.join(", ")}.`;
  }

  if (stallAvailabilityTooLow && selectedStallOption) {
    return `Seulement ${selectedStallOption.available_quantity} stall${selectedStallOption.available_quantity === 1 ? "" : "s"} disponible${selectedStallOption.available_quantity === 1 ? "" : "s"} pour ce produit.`;
  }

  if (tackLimitTooHigh) {
    return `Limite de tack stalls: ${allowedTackQuantity ?? 0} permis pour ${selectedHorseCount} stall${selectedHorseCount === 1 ? "" : "s"} chevaux.`;
  }

  if (tackAvailabilityTooLow) {
    return `Pas assez de tack stalls disponibles pour ${tackQuantityNumber} demande${tackQuantityNumber === 1 ? "" : "s"}.`;
  }

  if (needsBeddingOption) {
    return "Choisir le produit de ripe a ajouter.";
  }

  if (beddingAvailabilityTooLow) {
    return `Pas assez de ripe disponible pour ${beddingTotalQuantity} sac${beddingTotalQuantity === 1 ? "" : "s"}.`;
  }

  if (needsHayOption) {
    return "Choisir le produit de foin a ajouter.";
  }

  if (hayAvailabilityTooLow) {
    return `Pas assez de foin disponible pour ${hayTotalQuantity} unite${hayTotalQuantity === 1 ? "" : "s"}.`;
  }

  if (campingAvailabilityTooLow) {
    return `Pas assez de camping disponible pour ${campingQuantityNumber} unite${campingQuantityNumber === 1 ? "" : "s"}.`;
  }

  if (selectedOptionUsesDailyReservations && (!dayOptions.length || !selectedStartDayId || !selectedEndDayId)) {
    return "Ce show a besoin de jours avant de creer une reservation.";
  }

  return "Completer les informations de reservation.";
}

function getStallHorseHealthValidity(input: {
  documents: HorseHealthDocument[];
  horseId: string;
  organization: Organization | null | undefined;
  referenceDate?: string | null;
}): StallHorseHealthValidity {
  const coggins = getHorseCogginsValidity(input);
  const vaccine = getHorseVaccineValidity(input);

  return {
    coggins,
    vaccine,
    valid: coggins.valid && vaccine.valid,
  };
}

function stallHealthValidityMessage(validity: StallHorseHealthValidity) {
  if (!validity.coggins.valid) {
    return stallSingleHealthValidityMessage("Coggins", validity.coggins);
  }

  if (!validity.vaccine.valid) {
    return stallSingleHealthValidityMessage("Vaccin", validity.vaccine);
  }

  if (validity.coggins.status === "not_required" && validity.vaccine.status === "not_required") {
    return "Documents sante non exiges";
  }

  const parts = [
    validity.coggins.expiresOn ? `Coggins valide jusqu'au ${formatDate(validity.coggins.expiresOn)}` : null,
    validity.vaccine.expiresOn ? `Vaccin valide jusqu'au ${formatDate(validity.vaccine.expiresOn)}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : "Documents sante valides";
}

function stallSingleHealthValidityMessage(label: string, validity: Pick<HorseCogginsValidity, "expiresOn" | "status" | "valid">) {
  if (validity.status === "not_required") {
    return `${label} non exige`;
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `${label} valide jusqu'au ${formatDate(validity.expiresOn)}`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `${label} expire le ${formatDate(validity.expiresOn)}`;
  }

  if (validity.status === "pending_review") {
    return `${label} en revision`;
  }

  if (validity.status === "rejected") {
    return `${label} refuse`;
  }

  return `${label} manquant`;
}

function stallHealthValidityTagLabel(validity: StallHorseHealthValidity) {
  if (!validity.coggins.valid) {
    return stallSingleHealthValidityTagLabel("Coggins", validity.coggins);
  }

  if (!validity.vaccine.valid) {
    return stallSingleHealthValidityTagLabel("Vaccin", validity.vaccine);
  }

  return "Sante valide";
}

function stallSingleHealthValidityTagLabel(label: string, validity: Pick<HorseCogginsValidity, "expiresOn" | "status">) {
  if (validity.status === "expired" && validity.expiresOn) {
    return `${label} expire ${formatDate(validity.expiresOn)}`;
  }

  if (validity.status === "pending_review") {
    return `${label} en revision`;
  }

  if (validity.status === "rejected") {
    return `${label} refuse`;
  }

  return `${label} manquant`;
}

function stallHealthValidityTone(validity: StallHorseHealthValidity) {
  if (validity.valid) {
    return "success";
  }

  return validity.coggins.status === "pending_review" || validity.vaccine.status === "pending_review" ? "info" : "error";
}

function isStallReservationOption(option: StallOption) {
  return option.category === "stall" && !isTackStallOption(option);
}

function isTackStallOption(option: StallOption) {
  return option.category === "stall" && (option.requires_horse_assignment === false || isTackStallName(option));
}

function isTackStallName(option: Pick<StallOption, "name" | "description">) {
  return `${option.name} ${option.description ?? ""}`.toLowerCase().includes("tack");
}

function isBeddingOption(option: StallOption) {
  const name = `${option.name} ${option.description ?? ""}`.toLowerCase();
  return option.category === "extra" && (name.includes("ripe") || name.includes("shaving") || name.includes("bedding"));
}

function isHayOption(option: StallOption) {
  const name = `${option.name} ${option.description ?? ""}`.toLowerCase();
  return option.category === "extra" && (name.includes("foin") || name.includes("hay"));
}

function isCampingOption(option: StallOption) {
  return option.category === "camping";
}

function isActiveHorseStallBookingForShow(booking: StallBooking, showId: string, options: StallOption[]) {
  const option = findById(options, booking.stall_option_id);
  return Boolean(showId && booking.show_id === showId && booking.horse_id && booking.status !== "cancelled" && option && isStallReservationOption(option));
}

function stallOptionAssignmentLabel(option: StallOption) {
  if (option.category === "stall") {
    if (isTackStallOption(option)) {
      return option.limit_per_horse_stalls ? `Non attitre, limite 1/${option.limit_per_horse_stalls} stalls chevaux` : "Non attitre";
    }

    return "Par cheval";
  }

  return "Reservation simple";
}

function optionUsesDailyReservations(option: StallOption | null) {
  return Boolean(option?.show_day_start_id || option?.show_day_end_id);
}

function toggleValue<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function splitAmountEvenly(totalAmount: number, parts: number) {
  if (parts <= 0) {
    return [];
  }

  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / parts);
  const remainder = totalCents % parts;

  return Array.from({ length: parts }, (_, index) => (baseCents + (index < remainder ? 1 : 0)) / 100);
}

function reservationLineNotes(notes: string, horse: Horse, productName: string) {
  const base = `${productName} pour ${horse.name}`;
  return notes.trim() ? `${base}. ${notes.trim()}` : base;
}

function reservationStandaloneNotes(notes: string, productName: string) {
  return notes.trim() ? `${productName}. ${notes.trim()}` : productName;
}

function ReservationProductSummary({
  availableQuantity,
  currency,
  option,
  quantityNumber,
  quantityTooHigh,
  totalPrice,
}: {
  availableQuantity?: number;
  currency: string;
  option: StallOption | null;
  quantityNumber: number;
  quantityTooHigh: boolean;
  totalPrice: number;
}) {
  if (!option) {
    return (
      <div className="reservation-product-summary empty">
        <span>
          <strong>Aucun produit choisi</strong>
          <small>Le prix, les dates et la facture se calculeront apres le choix du produit.</small>
        </span>
      </div>
    );
  }

  const displayAvailability = availableQuantity ?? option.available_quantity;

  return (
    <div className={`reservation-product-summary ${quantityTooHigh ? "warning" : ""}`}>
      <span>
        <strong>{option.name}</strong>
        <small>
          {categoryLabel(option.category)} / {displayAvailability} disponible{displayAvailability === 1 ? "" : "s"}
        </small>
      </span>
      <span>
        <strong>{formatCurrency(option.price, currency)}</strong>
        <small>Prix unitaire</small>
      </span>
      <span>
        <strong>{formatCurrency(totalPrice, currency)}</strong>
        <small>
          {quantityNumber} x facture
        </small>
      </span>
    </div>
  );
}

function reservationOptionSelectLabel(option: StallOption, currency: string) {
  const availability = option.available_quantity > 0 ? `${option.available_quantity}/${option.total_quantity} disponible` : "complet";
  return `${option.name} - ${formatCurrency(option.price, currency)} - ${availability}`;
}

function reservationOptionAvailabilityLabel(option: StallOption, currency: string) {
  return `${option.available_quantity} disponible${option.available_quantity === 1 ? "" : "s"} a ${formatCurrency(option.price, currency)}`;
}

function categoryLabel(category: StallOption["category"]) {
  switch (category) {
    case "stall":
      return "Stall";
    case "camping":
      return "Camping";
    case "parking":
      return "Parking";
    case "extra":
      return "Extra";
    default:
      return "Uncategorized";
  }
}

function dayLabel(day: ShowDay) {
  return `${day.day_name || "Day"} - ${formatDate(day.day_date)}`;
}

function validDayId(dayId: string, showDays: ShowDay[]) {
  return showDays.some((day) => day.id === dayId) ? dayId : "";
}

function integerValue(value: string, fallback: number) {
  if (!value.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function positiveIntegerValue(value: string, fallback: number) {
  return Math.max(1, integerValue(value, fallback));
}
