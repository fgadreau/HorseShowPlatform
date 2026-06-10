import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ComponentType } from "react";
import { ClipboardList, Plus, Warehouse } from "lucide-react";
import { ContactPicker, EmptyState, FormActions, Metric, ModalDialog, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import { getHorseCogginsValidity, getHorseVaccineValidity, organizationRequiresHealthVerification, type HorseCogginsValidity, type HorseVaccineValidity } from "../../lib/health";
import type { Locale } from "../../lib/i18n";
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

function uiText(locale: Locale, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

const stallPresets = [
  { key: "stall", labelEn: "Stall", labelFr: "Stall", name: "Stall", category: "stall" },
  { key: "tack-stall", labelEn: "Tack stall", labelFr: "Tack stall", name: "Tack stall", category: "stall" },
  { key: "shavings", labelEn: "Shavings", labelFr: "Ripe", name: "Ripe / shavings", category: "extra" },
  { key: "hay", labelEn: "Hay", labelFr: "Foin", name: "Foin / hay", category: "extra" },
  { key: "camping", labelEn: "Camping", labelFr: "Camping", name: "Camping", category: "camping" },
  { key: "custom", labelEn: "Custom", labelFr: "Personnalisé", name: "", category: "extra" },
] as const;

function stallPresetLabel(preset: (typeof stallPresets)[number], locale: Locale) {
  return locale === "en" ? preset.labelEn : preset.labelFr;
}

const bookingStatuses: StallBooking["status"][] = ["requested", "reserved", "active", "cancelled", "completed"];
const requiredReservationContactRoles: ContactRoleName[] = ["booker"];
function reservationContactRoleChoices(locale: Locale): Array<{ detail: string; label: string; role: ContactRoleName }> {
  return [
    { detail: uiText(locale, "Personne qui fait la demande.", "Person making the request."), label: "Booker", role: "booker" },
    { detail: uiText(locale, "Personne liée à la facture.", "Person linked to the invoice."), label: uiText(locale, "Payeur", "Payer"), role: "payer" },
    { detail: uiText(locale, "Rôle ajouté au contact, sans changer le propriétaire du cheval.", "Role added to the contact without changing the horse owner."), label: uiText(locale, "Propriétaire", "Owner"), role: "owner" },
  ];
}
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
  locale,
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
  locale: Locale;
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
      detail: uiText(locale, "Demandes, réservations et statuts.", "Requests, reservations and statuses."),
      icon: ClipboardList,
      key: "reservations",
      label: uiText(locale, "Réservations", "Reservations"),
    },
    {
      detail: uiText(locale, "Ajouter une demande pour un compétiteur.", "Add a request for a competitor."),
      icon: Plus,
      key: "new-reservation",
      label: uiText(locale, "Nouvelle réservation", "New reservation"),
    },
    {
      count: stallOptions.length,
      detail: uiText(locale, "Stalls, camping et extras disponibles.", "Stalls, camping and extras available."),
      icon: Warehouse,
      key: "options",
      label: uiText(locale, "Options réservables", "Reservable options"),
    },
  ];

  async function handleDeleteBooking(booking: StallBooking) {
    if (!window.confirm(uiText(locale, "Supprimer cette réservation et la ligne de facture liée?", "Delete this reservation and the linked invoice line?"))) {
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
        eyebrow={uiText(locale, "Réservations", "Reservations")}
        title={uiText(locale, "Réservations et options réservables", "Reservations and reservable options")}
        description={uiText(locale, "Gère les demandes de stalls, camping et extras, puis garde l'inventaire disponible à jour.", "Manage stall, camping and extra requests while keeping available inventory current.")}
        stats={[
          { label: uiText(locale, "Réservations", "Reservations"), value: String(bookings.length) },
          { label: "Options", value: String(stallOptions.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Options réservables", "Reservable options")} value={String(stallOptions.length)} />
        <Metric label={uiText(locale, "Unités réservées", "Reserved units")} value={String(reservedQuantity)} />
        <Metric label={uiText(locale, "Facturable", "Billable")} value={formatCurrency(billableTotal, currency)} />
      </section>

      <ReservationTabs
        locale={locale}
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
            <ModalDialog className="reservation-form-modal" description={horseLabel(findById(horses, editingBooking.horse_id))} eyebrow={uiText(locale, "Réservations", "Reservations")} title={uiText(locale, "Modifier la réservation", "Edit reservation")} onClose={() => setEditingBooking(null)}>
              <StallBookingEditForm
                locale={locale}
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

          <StallBookingsTable locale={locale} bookings={bookings} contacts={contacts} currency={currency} horses={horses} invoiceLineItems={invoiceLineItems} invoices={invoices} options={stallOptions} onDelete={handleDeleteBooking} onEdit={setEditingBooking} />
        </>
      ) : null}

      {activeTab === "new-reservation" ? (
        <ModalDialog className="reservation-form-modal" description={uiText(locale, "Créer une demande sans quitter la gestion des réservations.", "Create a request without leaving reservation management.")} eyebrow={uiText(locale, "Réservations", "Reservations")} title={uiText(locale, "Nouvelle réservation", "New reservation")} onClose={() => setActiveTab("reservations")}>
          <StallBookingForm
            locale={locale}
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
            title={uiText(locale, "Nouvelle réservation", "New reservation")}
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
                <h2>{uiText(locale, "Options réservables", "Reservable options")}</h2>
                <p>{uiText(locale, "Ajoute un produit de réservation sans quitter la liste d'inventaire.", "Add a reservation product without leaving the inventory list.")}</p>
              </div>
              <button className="primary-button" disabled={!organization || !shows.length} type="button" onClick={() => setCreatingOption(true)}>
                <Plus size={18} />
                Option
              </button>
            </div>
          </section>

          {creatingOption ? (
            <ModalDialog className="reservation-form-modal" description={uiText(locale, "Stall, tack, ripe, foin, camping ou extra.", "Stall, tack stall, shavings, hay, camping or extra.")} eyebrow={uiText(locale, "Réservations", "Reservations")} title={uiText(locale, "Nouvelle option", "New option")} onClose={() => setCreatingOption(false)}>
              <StallOptionForm
                locale={locale}
                organization={organization}
                showDays={showDays}
                shows={shows}
                onCreateStallOption={onCreateStallOption}
                onCreated={() => setCreatingOption(false)}
              />
            </ModalDialog>
          ) : null}

          {editingOption ? (
            <ModalDialog className="reservation-form-modal" description={editingOption.name} eyebrow={uiText(locale, "Réservations", "Reservations")} title={uiText(locale, "Modifier l'option", "Edit option")} onClose={() => setEditingOption(null)}>
              <StallOptionEditForm
                locale={locale}
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

          <StallOptionsTable locale={locale} currency={currency} options={stallOptions} shows={shows} onEdit={setEditingOption} />
        </>
      ) : null}
    </div>
  );
}

export function MyStallsView({
  locale,
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
  locale: Locale;
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
      detail: uiText(locale, "Mes demandes et réservations actives.", "My active requests and reservations."),
      icon: ClipboardList,
      key: "my-reservations",
      label: uiText(locale, "Mes réservations", "My reservations"),
    },
    {
      detail: uiText(locale, "Demander un stall, camping ou extra.", "Request a stall, camping or extra."),
      icon: Plus,
      key: "new-reservation",
      label: uiText(locale, "Nouvelle réservation", "New reservation"),
    },
    {
      count: availableOptions.length,
      detail: uiText(locale, "Ce qui peut être réservé.", "What can be reserved."),
      icon: Warehouse,
      key: "available-options",
      label: uiText(locale, "Options disponibles", "Available options"),
    },
  ];

  async function handleDeleteBooking(booking: StallBooking) {
    if (!window.confirm(uiText(locale, "Supprimer cette réservation et la ligne de facture liée?", "Delete this reservation and the linked invoice line?"))) {
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
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes réservations", "My reservations")}
        description={uiText(locale, "Réserve les options disponibles pour tes chevaux et suis les demandes liées à ton compte.", "Reserve available options for your horses and track requests linked to your account.")}
        stats={[
          { label: uiText(locale, "Réservations", "Reservations"), value: String(bookings.length) },
          { label: uiText(locale, "Disponibles", "Available"), value: String(availableOptions.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Réservations", "Reservations")} value={String(bookings.length)} />
        <Metric label={uiText(locale, "Options disponibles", "Available options")} value={String(availableOptions.length)} />
        <Metric label={uiText(locale, "Facturable", "Billable")} value={formatCurrency(billableTotal, currency)} />
      </section>

      <ReservationTabs
        locale={locale}
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
            <ModalDialog className="reservation-form-modal" description={horseLabel(findById(horses, editingBooking.horse_id))} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier la réservation", "Edit reservation")} onClose={() => setEditingBooking(null)}>
              <StallBookingEditForm
                locale={locale}
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
            locale={locale}
            bookings={bookings}
            contacts={contacts}
            currency={currency}
            horses={horses}
            invoiceLineItems={invoiceLineItems}
            invoices={invoices}
            options={stallOptions}
            title={uiText(locale, "Mes réservations", "My reservations")}
            onDelete={handleDeleteBooking}
            onEdit={setEditingBooking}
          />
        </>
      ) : null}

      {activeTab === "new-reservation" ? (
        <ModalDialog className="reservation-form-modal" description={uiText(locale, "Demande un stall, camping ou extra sans quitter tes réservations.", "Request a stall, camping or extra without leaving your reservations.")} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Nouvelle réservation", "New reservation")} onClose={() => setActiveTab("my-reservations")}>
          <StallBookingForm
            locale={locale}
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
            title={uiText(locale, "Nouvelle réservation", "New reservation")}
            onCreateContact={onCreateContact}
            onCreateStallBooking={onCreateStallBooking}
            onCreated={() => setActiveTab("my-reservations")}
          />
        </ModalDialog>
      ) : null}

      {activeTab === "available-options" ? <StallOptionsTable locale={locale} currency={currency} options={availableOptions} shows={shows} /> : null}
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
  locale,
  activeTab,
  items,
  onChange,
}: {
  locale: Locale;
  activeTab: T;
  items: Array<ReservationTabItem<T>>;
  onChange: (tab: T) => void;
}) {
  return (
    <section className="reservation-tabs span-2" aria-label={uiText(locale, "Sections de réservation", "Reservation sections")}>
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
  locale,
  currency,
  options,
  shows,
  onEdit,
}: {
  locale: Locale;
  currency: string;
  options: StallOption[];
  shows: Show[];
  onEdit?: (option: StallOption) => void;
}) {
  const title = onEdit ? uiText(locale, "Options réservables", "Reservable options") : uiText(locale, "Options disponibles", "Available options");

  return (
    <section className="panel span-2">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{options.length ? uiText(locale, `${options.length} option${options.length === 1 ? "" : "s"} disponible${options.length === 1 ? "" : "s"} pour les réservations.`, `${options.length} option${options.length === 1 ? "" : "s"} available for reservations.`) : uiText(locale, "Crée des stalls, tack stalls, ripe, foin ou camping.", "Create stalls, tack stalls, bedding, hay or camping.")}</p>
        </div>
      </div>
      <div className={`table stalls-table ${onEdit ? "" : "read-only-table"}`}>
        <div className="table-row table-head">
          <span>Option</span>
          <span>{uiText(locale, "Concours", "Show")}</span>
          <span>{uiText(locale, "Disponibilité", "Availability")}</span>
          {onEdit ? <span>Action</span> : null}
        </div>
        {options.map((option) => (
          <div className="table-row" key={option.id}>
            <div>
              <strong>{option.name}</strong>
              <span className="muted-line">
                {categoryLabel(option.category, locale)} / {formatCurrency(option.price, currency)} / {stallOptionAssignmentLabel(option, locale)}
              </span>
            </div>
            <span>{showLabel(findById(shows, option.show_id))}</span>
            <span>
              {option.available_quantity} / {option.total_quantity}
            </span>
            {onEdit ? (
              <button className="text-button" type="button" onClick={() => onEdit(option)}>
                {uiText(locale, "Modifier", "Edit")}
              </button>
            ) : null}
          </div>
        ))}
        {!options.length ? <EmptyState label={uiText(locale, "Ajoute la première option réservable.", "Add the first reservable option.")} /> : null}
      </div>
    </section>
  );
}

function StallBookingsTable({
  locale,
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
  locale: Locale;
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
          <p>{bookings.length ? uiText(locale, `${bookings.length} réservation${bookings.length === 1 ? "" : "s"} liée${bookings.length === 1 ? "" : "s"} aux brouillons de facture.`, `${bookings.length} reservation${bookings.length === 1 ? "" : "s"} linked to billing drafts.`) : uiText(locale, "Les réservations créeront des lignes de facture brouillon.", "Reservations will create draft invoice lines.")}</p>
        </div>
      </div>
      <div className="table stalls-table">
        <div className="table-row table-head">
          <span>{uiText(locale, "Réservation", "Reservation")}</span>
          <span>Booker</span>
          <span>{uiText(locale, "Statuts", "Statuses")}</span>
          <span>Action</span>
        </div>
        {bookings.map((booking) => {
          const option = findById(options, booking.stall_option_id);
          const invoice = invoiceForBooking(booking, invoices, invoiceLineItems);
          const invoiceState = reservationInvoiceState(invoice, currency, locale);
          return (
            <div className="table-row" key={booking.id}>
              <div>
                <strong>{option?.name ?? uiText(locale, "Option inconnue", "Unknown option")}</strong>
                <span className="muted-line">
                  {booking.quantity} x {formatCurrency(booking.unit_price ?? option?.price ?? 0, currency)} = {formatCurrency(booking.total_price ?? 0, currency)}
                  {booking.horse_id ? ` / ${horseLabel(findById(horses, booking.horse_id))}` : ""}
                </span>
              </div>
              <span>{contactLabel(findById(contacts, booking.booker_contact_id))}</span>
              <div className="reservation-status-stack">
                <span className={`badge ${booking.status}`}>{bookingStatusLabel(booking.status, locale)}</span>
                <span className={`badge ${invoiceState.badgeClass}`}>{invoiceState.confirmationLabel}</span>
                <small>{invoiceState.detail}</small>
              </div>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => onEdit(booking)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => onDelete(booking)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          );
        })}
        {!bookings.length ? <EmptyState label={uiText(locale, "Aucune réservation pour l'instant.", "No reservations yet.")} /> : null}
      </div>
    </section>
  );
}

function StallOptionForm({
  locale,
  organization,
  showDays,
  shows,
  onCreateStallOption,
  onCreated,
}: {
  locale: Locale;
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
          <h2>{uiText(locale, "Nouvelle option réservable", "New reservable option")}</h2>
          <p>{shows.length ? uiText(locale, "Crée l'inventaire réservable: stall, tack, ripe, foin ou camping.", "Create reservable inventory: stall, tack stall, shavings, hay or camping.") : uiText(locale, "Crée un concours d'abord.", "Create a show first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Concours", "Show")}
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
                {stallPresetLabel(preset, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {uiText(locale, "Nom", "Name")}
          <input disabled={!canCreate} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Catégorie", "Category")}
            <select disabled={!canCreate} value={category} onChange={(event) => setCategory(event.target.value as NonNullable<StallOption["category"]>)}>
              <option value="stall">Stall</option>
              <option value="camping">Camping</option>
              <option value="parking">Parking</option>
              <option value="extra">Extra</option>
            </select>
          </label>
          <label>
            {uiText(locale, "Prix", "Price")}
            <input disabled={!canCreate} min="0" required step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Quantité totale", "Total quantity")}
            <input disabled={!canCreate} min="0" required step="1" type="number" value={totalQuantity} onChange={(event) => setTotalQuantity(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Disponible maintenant", "Available now")}
            <input disabled={!canCreate} min="0" step="1" type="number" value={availableQuantity} onChange={(event) => setAvailableQuantity(event.target.value)} />
          </label>
        </div>
        {category === "stall" ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>Assignation</strong>
              <span>{requiresHorseAssignment ? uiText(locale, "Chaque réservation sera liée à un cheval.", "Each reservation will be linked to a horse.") : uiText(locale, "Réservation non attitrée à un cheval.", "Reservation not assigned to a horse.")}</span>
            </div>
            <div className="segmented-control">
              <button className={requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(true)}>
                {uiText(locale, "Par cheval", "Per horse")}
              </button>
              <button className={!requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(false)}>
                {uiText(locale, "Non attitrée", "Unassigned")}
              </button>
            </div>
            {!requiresHorseAssignment ? (
              <label>
                {uiText(locale, "Limite optionnelle", "Optional limit")}
                <input
                  min="0"
                  placeholder={uiText(locale, "1 tack stall par X stalls chevaux", "1 tack stall per X horse stalls")}
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
            <strong>{uiText(locale, "Période offerte", "Offered period")}</strong>
            <span>{usesDailyReservations ? uiText(locale, "Les compétiteurs choisiront les journées.", "Competitors will choose days.") : uiText(locale, "Réservation pour tout le concours, sans choix de journée.", "Full-show reservation, with no day selection.")}</span>
          </div>
          <div className="segmented-control">
            <button className={reservationPeriodMode === "full_show" ? "active" : ""} type="button" onClick={() => setReservationPeriodMode("full_show")}>
              {uiText(locale, "Concours complet", "Full show")}
            </button>
            <button className={reservationPeriodMode === "daily" ? "active" : ""} disabled={!dayOptions.length} type="button" onClick={() => setReservationPeriodMode("daily")}>
              {uiText(locale, "À la journée", "Daily")}
            </button>
          </div>
          {usesDailyReservations ? (
            <>
              <div className="form-grid">
                <label>
                  {uiText(locale, "Jour début", "Start day")}
                  <select disabled={!canCreate || !dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                    {dayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {uiText(locale, "Jour fin", "End day")}
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
                {uiText(locale, "Durée jours", "Duration days")}
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
          {uiText(locale, "Créer l'option", "Create option")}
        </button>
      </form>
    </section>
  );
}

function StallOptionEditForm({
  locale,
  currency,
  option,
  showDays,
  shows,
  onCancel,
  onUpdateStallOption,
}: {
  locale: Locale;
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
          <h2>{uiText(locale, "Modifier l'option", "Edit option")}</h2>
          <p>
            {showLabel(show)} / {formatCurrency(option.price, currency)}
          </p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom", "Name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Catégorie", "Category")}
            <select value={category} onChange={(event) => setCategory(event.target.value as NonNullable<StallOption["category"]>)}>
              <option value="stall">Stall</option>
              <option value="camping">Camping</option>
              <option value="parking">Parking</option>
              <option value="extra">Extra</option>
            </select>
          </label>
          <label>
            {uiText(locale, "Prix", "Price")}
            <input min="0" required step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Quantité totale", "Total quantity")}
            <input min="0" required step="1" type="number" value={totalQuantity} onChange={(event) => setTotalQuantity(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Disponible maintenant", "Available now")}
            <input min="0" required step="1" type="number" value={availableQuantity} onChange={(event) => setAvailableQuantity(event.target.value)} />
          </label>
        </div>
        {category === "stall" ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>Assignation</strong>
              <span>{requiresHorseAssignment ? uiText(locale, "Chaque réservation sera liée à un cheval.", "Each reservation will be linked to a horse.") : uiText(locale, "Réservation non attitrée à un cheval.", "Reservation not assigned to a horse.")}</span>
            </div>
            <div className="segmented-control">
              <button className={requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(true)}>
                {uiText(locale, "Par cheval", "Per horse")}
              </button>
              <button className={!requiresHorseAssignment ? "active" : ""} type="button" onClick={() => setRequiresHorseAssignment(false)}>
                {uiText(locale, "Non attitrée", "Unassigned")}
              </button>
            </div>
            {!requiresHorseAssignment ? (
              <label>
                {uiText(locale, "Limite optionnelle", "Optional limit")}
                <input
                  min="0"
                  placeholder={uiText(locale, "1 tack stall par X stalls chevaux", "1 tack stall per X horse stalls")}
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
            <strong>{uiText(locale, "Période offerte", "Offered period")}</strong>
            <span>{usesDailyReservations ? uiText(locale, "Réservation à la journée.", "Daily reservation.") : uiText(locale, "Réservation pour tout le concours.", "Full-show reservation.")}</span>
          </div>
          <div className="segmented-control">
            <button className={reservationPeriodMode === "full_show" ? "active" : ""} type="button" onClick={() => setReservationPeriodMode("full_show")}>
              {uiText(locale, "Concours complet", "Full show")}
            </button>
            <button className={reservationPeriodMode === "daily" ? "active" : ""} disabled={!dayOptions.length} type="button" onClick={() => setReservationPeriodMode("daily")}>
              {uiText(locale, "À la journée", "Daily")}
            </button>
          </div>
          {usesDailyReservations ? (
            <>
              <div className="form-grid">
                <label>
                  {uiText(locale, "Jour début", "Start day")}
                  <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                    {dayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {uiText(locale, "Jour fin", "End day")}
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
                {uiText(locale, "Durée jours", "Duration days")}
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
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function StallBookingForm({
  locale,
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
  locale: Locale;
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
  const blockingInvoiceMessage = blockingReservationInvoiceMessage({ contacts, currency, invoices: blockingInvoices, locale, shows });
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
      ? `${stallChoices.length} produit${stallChoices.length === 1 ? "" : "s"} stall pour ce concours.`
      : uiText(locale, "Aucun produit stall pour ce concours.", "No stall product for this show.");
  const formMessage = reservationCreateMessage({
    locale,
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
            <span>{uiText(locale, "Un seul contact responsable pour la demande.", "One responsible contact for the request.")}</span>
          </div>
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label={uiText(locale, "Contact responsable", "Responsible contact")}
            locale={locale}
            organization={organization}
            role="booker"
            value={responsibleContactId}
            onChange={setResponsibleContactId}
            onCreateContact={onCreateContact}
          />
          <div className="contact-role-grid" aria-label={uiText(locale, "Rôles du contact", "Contact roles")}>
            {reservationContactRoleChoices(locale).map((choice) => (
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
            {uiText(locale, "Concours", "Show")}
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
            {uiText(locale, "Produit stall", "Stall product")}
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
              <option value="">{uiText(locale, "Choisir le type de stall", "Choose stall type")}</option>
              {stallChoices.map((option) => (
                <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                  {reservationOptionSelectLabel(option, currency, locale)}
                </option>
              ))}
            </select>
          </label>
          <ReservationProductSummary locale={locale} currency={currency} option={selectedStallOption} quantityNumber={Math.max(stallCount, 1)} quantityTooHigh={stallAvailabilityTooLow} totalPrice={stallTotal} />
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <strong>3. {uiText(locale, "Chevaux", "Horses")}</strong>
            <span>
              {selectedHorses.length
                ? uiText(locale, `${selectedHorses.length} stall${selectedHorses.length === 1 ? "" : "s"} à réserver.`, `${selectedHorses.length} stall${selectedHorses.length === 1 ? "" : "s"} to reserve.`)
                : availableHorseCount
                  ? uiText(locale, `${availableHorseCount} cheval${availableHorseCount === 1 ? "" : "x"} disponible${availableHorseCount === 1 ? "" : "s"} pour ce concours.`, `${availableHorseCount} horse${availableHorseCount === 1 ? "" : "s"} available for this show.`)
                  : uiText(locale, "Tous les chevaux ont déjà un stall pour ce concours.", "All horses already have a stall for this show.")}
            </span>
          </div>
          {!horses.length ? <EmptyState label={uiText(locale, "Ajoute d'abord les chevaux avant de réserver des stalls.", "Add horses before reserving stalls.")} /> : null}
          {horses.length && !availableHorseCount ? <EmptyState label={uiText(locale, "Tous les chevaux ont déjà un stall pour ce concours.", "All horses already have a stall for this show.")} /> : null}
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
                        {alreadyReserved ? <em className="horse-reservation-status">{uiText(locale, "Déjà réservé", "Already reserved")}</em> : null}
                        {healthUnavailable ? <em className="horse-reservation-status">{stallHealthValidityTagLabel(healthValidity)}</em> : null}
                      </strong>
                      <small>
                        {alreadyReserved
                          ? uiText(locale, `Stall déjà réservé: ${reservedOption?.name ?? "Stall"}`, `Stall already reserved: ${reservedOption?.name ?? "Stall"}`)
                          : `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${stallHealthValidityMessage(healthValidity)}`}
                      </small>
                    </span>
                  </label>
                  {selected && !alreadyReserved ? (
                    <>
                      <div className="horse-billing-grid">
                        <label>
                          {uiText(locale, "Facturer à", "Bill to")}
                          <SearchSelect
                            items={contactItems}
                            placeholder={uiText(locale, "Contact à facturer", "Billing contact")}
                            value={horsePayerContactIds[horse.id] || horse.primary_owner_contact_id}
                            onChange={(contactId) => setHorsePayerContactIds((current) => ({ ...current, [horse.id]: contactId }))}
                          />
                        </label>
                      </div>
                      <div className="horse-addons">
                        <label>
                          <input checked={beddingSelected} disabled={!beddingChoices.length} type="checkbox" onChange={() => toggleBedding(horse.id)} />
                          {uiText(locale, "Ajouter de la ripe", "Add shavings")}
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
              {uiText(locale, "Produit ripe", "Shavings product")}
              <select disabled={!beddingChoices.length} required value={selectedBeddingOption?.id ?? ""} onChange={(event) => setBeddingOptionId(event.target.value)}>
                <option value="">{uiText(locale, "Choisir la ripe", "Choose shavings")}</option>
                {beddingChoices.map((option) => (
                  <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                    {reservationOptionSelectLabel(option, currency, locale)}
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
              <span>{selectedTackOption?.limit_per_horse_stalls ? uiText(locale, `Limite: 1 tack stall par ${selectedTackOption.limit_per_horse_stalls} stall${selectedTackOption.limit_per_horse_stalls === 1 ? "" : "s"} chevaux.`, `Limit: 1 tack stall per ${selectedTackOption.limit_per_horse_stalls} horse stall${selectedTackOption.limit_per_horse_stalls === 1 ? "" : "s"}.`) : uiText(locale, "Optionnel, non attitré à un cheval.", "Optional, not assigned to a horse.")}</span>
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Produit tack", "Tack product")}
                <select
                  value={tackOptionId}
                  onChange={(event) => {
                    setTackOptionId(event.target.value);
                    setTackQuantity(event.target.value ? "1" : "0");
                  }}
                >
                  <option value="">{uiText(locale, "Aucun tack stall", "No tack stall")}</option>
                  {tackChoices.map((option) => (
                    <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                      {reservationOptionSelectLabel(option, currency, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {uiText(locale, "Quantité", "Quantity")}
                <input disabled={!selectedTackOption} max={tackQuantityMax} min="0" step="1" type="number" value={tackQuantity} onChange={(event) => setTackQuantity(event.target.value)} />
              </label>
            </div>
            {selectedTackOption ? (
              <ReservationProductSummary locale={locale} availableQuantity={tackQuantityMax} currency={currency} option={selectedTackOption} quantityNumber={Math.max(tackQuantityNumber, 0)} quantityTooHigh={tackAvailabilityTooLow || tackLimitTooHigh} totalPrice={tackTotal} />
            ) : null}
            {selectedTackOption ? (
              <div className="form-section nested-section">
                <div className="form-section-header">
                  <strong>Facturation tack</strong>
                  <span>{tackBillingMode === "split_horses" ? uiText(locale, "Divise le tack et le foin entre les chevaux sélectionnés.", "Split tack and hay between selected horses.") : uiText(locale, "Facture le tack et le foin à un seul contact.", "Bill tack and hay to one contact.")}</span>
                </div>
                <div className="segmented-control">
                  <button className={tackBillingMode === "split_horses" ? "active" : ""} disabled={!selectedHorses.length} type="button" onClick={() => setTackBillingMode("split_horses")}>
                    {uiText(locale, "Split chevaux", "Split horses")}
                  </button>
                  <button className={tackBillingMode === "single_contact" ? "active" : ""} type="button" onClick={() => setTackBillingMode("single_contact")}>
                    {uiText(locale, "Un contact", "One contact")}
                  </button>
                </div>
                {tackBillingMode === "single_contact" ? (
                  <ContactPicker
                    contacts={contacts}
                    contactRoles={contactRoles}
                    createdByUserId={profileId}
                    disabled={!organization}
                    label={uiText(locale, "Facturer tack à", "Bill tack to")}
                    locale={locale}
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
                      <span>{uiText(locale, "Choisir les chevaux à inclure dans le split.", "Choose horses to include in the split.")}</span>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {selectedTackOption && hayChoices.length ? (
              <>
                <div className="form-grid">
                  <label>
                    {uiText(locale, "Foin pour tack stall", "Hay for tack stall")}
                    <select
                      value={hayOptionId}
                      onChange={(event) => {
                        setHayOptionId(event.target.value);
                        setHayQuantity(event.target.value ? "1" : "0");
                      }}
                    >
                      <option value="">{uiText(locale, "Aucun foin", "No hay")}</option>
                      {hayChoices.map((option) => (
                        <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                          {reservationOptionSelectLabel(option, currency, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {uiText(locale, "Quantité foin", "Hay quantity")}
                    <input disabled={!selectedHayOption} max={selectedHayOption?.available_quantity} min="0" step="1" type="number" value={hayQuantity} onChange={(event) => setHayQuantity(event.target.value)} />
                  </label>
                </div>
                {selectedHayOption ? <ReservationProductSummary locale={locale} currency={currency} option={selectedHayOption} quantityNumber={Math.max(hayTotalQuantity, 0)} quantityTooHigh={hayAvailabilityTooLow} totalPrice={hayTotal} /> : null}
              </>
            ) : null}
          </div>
        ) : null}

        {campingChoices.length ? (
          <div className="form-section">
            <div className="form-section-header">
              <strong>{campingSectionNumber}. Camping</strong>
              <span>{selectedCampingOption ? uiText(locale, `${selectedCampingOption.available_quantity} disponible${selectedCampingOption.available_quantity === 1 ? "" : "s"}.`, `${selectedCampingOption.available_quantity} available.`) : uiText(locale, "Optionnel, non attitré à un cheval.", "Optional, not assigned to a horse.")}</span>
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Produit camping", "Camping product")}
                <select
                  value={campingOptionId}
                  onChange={(event) => {
                    setCampingOptionId(event.target.value);
                    setCampingQuantity(event.target.value ? "1" : "0");
                  }}
                >
                  <option value="">{uiText(locale, "Aucun camping", "No camping")}</option>
                  {campingChoices.map((option) => (
                    <option disabled={option.available_quantity <= 0} key={option.id} value={option.id}>
                      {reservationOptionSelectLabel(option, currency, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {uiText(locale, "Quantité", "Quantity")}
                <input disabled={!selectedCampingOption} max={selectedCampingOption?.available_quantity} min="0" step="1" type="number" value={campingQuantity} onChange={(event) => setCampingQuantity(event.target.value)} />
              </label>
            </div>
            {selectedCampingOption ? (
              <ReservationProductSummary locale={locale} currency={currency} option={selectedCampingOption} quantityNumber={Math.max(campingQuantityNumber, 0)} quantityTooHigh={campingAvailabilityTooLow} totalPrice={campingTotal} />
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
                        label={uiText(locale, "Facturer à", "Bill to")}
                        locale={locale}
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
            <strong>{datesSectionNumber}. {uiText(locale, "Dates et facture", "Dates and invoice")}</strong>
            <span>{canCreate ? `Total: ${formatCurrency(totalPrice, currency)}` : reservationUsesDailyReservations ? uiText(locale, "Choisir les journées requises.", "Choose required days.") : uiText(locale, "Compléter les informations requises.", "Complete required information.")}</span>
          </div>
          <div className="form-grid">
            {allowStatusEdit ? (
              <label>
                {uiText(locale, "Statut", "Status")}
                <select disabled={!hasSelectedReservableProduct} value={status} onChange={(event) => setStatus(event.target.value as StallBooking["status"])}>
                  {bookingStatuses.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {bookingStatusLabel(candidate, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {uiText(locale, "Statut", "Status")}
                <input disabled value={bookingStatusLabel(defaultStatus, locale)} />
              </label>
            )}
          </div>
          {reservationUsesDailyReservations ? (
            <div className="form-grid">
              <label>
                {uiText(locale, "Jour début", "Start day")}
                <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                  {dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {uiText(locale, "Jour fin", "End day")}
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
              <small>{uiText(locale, "Total facture", "Invoice total")}</small>
            </span>
          </div>
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la réservation", "Create reservation")}
        </button>
      </form>
    </section>
  );
}

function StallBookingEditForm({
  locale,
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
  locale: Locale;
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
  const blockingInvoiceMessage = blockingReservationInvoiceMessage({ contacts, currency, invoices: blockingInvoices, locale, shows });
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
          <h2>{uiText(locale, "Modifier la réservation", "Edit reservation")}</h2>
          <p>
            {healthBlocksBooking && selectedHealthValidity
              ? stallHealthValidityMessage(selectedHealthValidity)
              : blocksBalance
                ? blockingInvoiceMessage
                : quantityTooHigh
                  ? uiText(locale, `Seulement ${editableAvailability} disponible pour ce produit.`, `Only ${editableAvailability} available for this product.`)
                  : uiText(locale, `Ligne de facture: ${formatCurrency(totalPrice, currency)}.`, `Invoice line: ${formatCurrency(totalPrice, currency)}.`)}
          </p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="form-section-header">
            <strong>1. {uiText(locale, "Produit", "Product")}</strong>
            <span>{selectedOption ? uiText(locale, `Disponible pour édition: ${editableAvailability}`, `Available for editing: ${editableAvailability}`) : uiText(locale, "Choisir le produit à modifier.", "Choose the product to edit.")}</span>
          </div>
          <label>
            {uiText(locale, "Produit de réservation", "Reservation product")}
            <select disabled={!optionChoices.length} required value={optionId} onChange={(event) => setOptionId(event.target.value)}>
              <option value="">{uiText(locale, "Choisir un produit", "Choose a product")}</option>
              {optionChoices.map((option) => (
                <option key={option.id} value={option.id}>
                  {reservationOptionSelectLabel(option, currency, locale)}
                </option>
              ))}
            </select>
          </label>
          <ReservationProductSummary locale={locale} availableQuantity={editableAvailability} currency={currency} option={selectedOption ?? null} quantityNumber={quantityNumber} quantityTooHigh={quantityTooHigh} totalPrice={totalPrice} />
          <div className="form-grid">
            <label>
              {uiText(locale, "Quantité", "Quantity")}
              <input max={editableAvailability || undefined} min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Statut", "Status")}
              <select value={status} onChange={(event) => setStatus(event.target.value as StallBooking["status"])}>
                {bookingStatuses.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {bookingStatusLabel(candidate, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <strong>2. Contacts</strong>
            <span>{uiText(locale, "Rôles booker et payeur assignés automatiquement.", "Booker and payer roles are assigned automatically.")}</span>
          </div>
          <label>
            {uiText(locale, "Cheval", "Horse")}
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
              placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
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
              label={uiText(locale, "Réservé par", "Reserved by")}
              locale={locale}
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
              label={uiText(locale, "Facture à", "Bill to")}
              locale={locale}
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
            <strong>3. {uiText(locale, "Dates et notes", "Dates and notes")}</strong>
            <span>
              {selectedOptionUsesDailyReservations
                ? dayOptions.length
                  ? uiText(locale, `${dayOptions.length} jour${dayOptions.length === 1 ? "" : "s"} disponible${dayOptions.length === 1 ? "" : "s"}.`, `${dayOptions.length} day${dayOptions.length === 1 ? "" : "s"} available.`)
                  : uiText(locale, "Aucun jour disponible.", "No days available.")
                : ""}
            </span>
          </div>
          {selectedOptionUsesDailyReservations ? (
            <div className="form-grid">
              <label>
                {uiText(locale, "Jour début", "Start day")}
                <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
                  {dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {uiText(locale, "Jour fin", "End day")}
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
        <FormActions busy={busy || !canUpdate} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function invoiceForBooking(booking: StallBooking, invoices: Invoice[], lineItems: InvoiceLineItem[]) {
  const lineItem = lineItems.find((item) => item.item_id === booking.id && (item.item_type === "stall" || item.item_type === "extra"));
  return lineItem ? findById(invoices, lineItem.invoice_id) : undefined;
}

function reservationInvoiceState(invoice: Invoice | undefined, currency: string, locale: Locale = "fr") {
  if (!invoice) {
    return {
      badgeClass: "warning",
      confirmationLabel: uiText(locale, "Facture à créer", "Invoice to create"),
      detail: uiText(locale, "La réservation attend sa ligne de facture.", "The reservation is waiting for its invoice line."),
    };
  }

  const invoiceNumber = `#${formatInvoiceNumber(invoice.invoice_number)}`;
  const balance = Number(invoice.balance_due ?? 0);

  if (invoice.status === "void") {
    return {
      badgeClass: "void",
      confirmationLabel: uiText(locale, "Facture annulée", "Invoice voided"),
      detail: `${invoiceNumber} - ${invoiceStatusLabel(invoice.status, locale)}`,
    };
  }

  if (invoice.status === "paid" || balance <= 0) {
    return {
      badgeClass: "paid",
      confirmationLabel: uiText(locale, "Confirmée", "Confirmed"),
      detail: `${invoiceNumber} - ${invoiceStatusLabel(invoice.status, locale)}`,
    };
  }

  return {
    badgeClass: invoice.status === "overdue" ? "overdue" : "warning",
    confirmationLabel: uiText(locale, "Solde ouvert", "Open balance"),
    detail: `${invoiceNumber} - ${invoiceStatusLabel(invoice.status, locale)} - ${formatCurrency(balance, currency)}`,
  };
}

function bookingStatusLabel(status: StallBooking["status"], locale: Locale = "fr") {
  switch (status) {
    case "requested":
      return uiText(locale, "Demandée", "Requested");
    case "reserved":
      return uiText(locale, "Réservée", "Reserved");
    case "active":
      return "Active";
    case "cancelled":
      return uiText(locale, "Annulée", "Cancelled");
    case "completed":
      return uiText(locale, "Complétée", "Completed");
    default:
      return status;
  }
}

function invoiceStatusLabel(status: Invoice["status"], locale: Locale = "fr") {
  switch (status) {
    case "draft":
      return uiText(locale, "Brouillon", "Draft");
    case "sent":
      return uiText(locale, "Envoyée", "Sent");
    case "viewed":
      return uiText(locale, "Consultée", "Viewed");
    case "partially_paid":
      return uiText(locale, "Partiellement payée", "Partially paid");
    case "paid":
      return uiText(locale, "Payée", "Paid");
    case "overdue":
      return uiText(locale, "En retard", "Overdue");
    case "void":
      return uiText(locale, "Annulée", "Void");
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
  locale = "fr",
  shows,
}: {
  contacts: Contact[];
  currency: string;
  invoices: Invoice[];
  locale?: Locale;
  shows: Show[];
}) {
  const invoice = invoices[0];

  if (!invoice) {
    return "";
  }

  const payerName = contactLabel(findById(contacts, invoice.payer_contact_id));
  const showName = showLabel(findById(shows, invoice.show_id));
  const remaining = invoices.reduce((sum, candidate) => sum + Number(candidate.balance_due ?? 0), 0);

  return uiText(
    locale,
    `${payerName} a un solde ouvert de ${formatCurrency(remaining, currency)} dans cette association (${showName}, facture #${formatInvoiceNumber(invoice.invoice_number)}). Impossible de réserver pour un autre événement avant paiement.`,
    `${payerName} has an open balance of ${formatCurrency(remaining, currency)} in this association (${showName}, invoice #${formatInvoiceNumber(invoice.invoice_number)}). They cannot reserve for another event before payment.`,
  );
}

function invoiceHasOpenBalance(invoice: Invoice) {
  return !["paid", "void"].includes(invoice.status) && Number(invoice.balance_due ?? 0) > 0;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function reservationCreateMessage({
  locale = "fr",
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
  locale?: Locale;
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
    return uiText(locale, `Réservation prête. Total: ${formatCurrency(totalPrice, currency)}.`, `Reservation ready. Total: ${formatCurrency(totalPrice, currency)}.`);
  }

  if (!organization) {
    return uiText(locale, "Choisir une association avant de créer une réservation.", "Choose an association before creating a reservation.");
  }

  if (!profileId) {
    return uiText(locale, "Le profil usager charge encore.", "The user profile is still loading.");
  }

  if (!responsibleContactId) {
    return uiText(locale, "Choisir ou créer le contact responsable.", "Choose or create the responsible contact.");
  }

  if (!hasRequiredContactRoles) {
    return uiText(locale, "Le contact responsable doit être booker pour créer la réservation.", "The responsible contact must be a booker to create the reservation.");
  }

  if (hasBlockingInvoiceBalance) {
    return blockingInvoiceMessage;
  }

  if (needsStallOption || (selectedHorseCount > 0 && !selectedStallOption)) {
    return uiText(locale, "Choisir le type de stall.", "Choose the stall type.");
  }

  if (needsTackSplitHorses) {
    return uiText(locale, "Choisir les chevaux qui partageront les frais de tack.", "Choose the horses that will split tack fees.");
  }

  if (needsTackPayer) {
    return uiText(locale, "Choisir le contact à facturer pour le tack.", "Choose the contact to bill for tack.");
  }

  if (missingCampingPayerCount) {
    return uiText(locale, `Assigner ${missingCampingPayerCount} camping${missingCampingPayerCount === 1 ? "" : "s"} à un contact.`, `Assign ${missingCampingPayerCount} camping spot${missingCampingPayerCount === 1 ? "" : "s"} to a contact.`);
  }

  if (selectedStallOption && !selectedHorseCount && !hasReservationItems) {
    return uiText(locale, "Choisir au moins un cheval pour réserver un stall.", "Choose at least one horse to reserve a stall.");
  }

  if (!hasReservationItems) {
    return uiText(locale, "Choisir au moins un stall, un tack stall ou du camping.", "Choose at least one stall, tack stall or camping spot.");
  }

  if (selectedReservedHorseCount) {
    return uiText(locale, `${selectedReservedHorseCount} cheval${selectedReservedHorseCount === 1 ? "" : "x"} a déjà un stall pour ce concours.`, `${selectedReservedHorseCount} horse${selectedReservedHorseCount === 1 ? "" : "s"} already has a stall for this show.`);
  }

  if (invalidHealthHorseNames.length) {
    return uiText(locale, `Documents santé invalides pour ${invalidHealthHorseNames.join(", ")}.`, `Invalid health documents for ${invalidHealthHorseNames.join(", ")}.`);
  }

  if (stallAvailabilityTooLow && selectedStallOption) {
    return uiText(locale, `Seulement ${selectedStallOption.available_quantity} stall${selectedStallOption.available_quantity === 1 ? "" : "s"} disponible${selectedStallOption.available_quantity === 1 ? "" : "s"} pour ce produit.`, `Only ${selectedStallOption.available_quantity} stall${selectedStallOption.available_quantity === 1 ? "" : "s"} available for this product.`);
  }

  if (tackLimitTooHigh) {
    return uiText(locale, `Limite de tack stalls: ${allowedTackQuantity ?? 0} permis pour ${selectedHorseCount} stall${selectedHorseCount === 1 ? "" : "s"} chevaux.`, `Tack stall limit: ${allowedTackQuantity ?? 0} allowed for ${selectedHorseCount} horse stall${selectedHorseCount === 1 ? "" : "s"}.`);
  }

  if (tackAvailabilityTooLow) {
    return uiText(locale, `Pas assez de tack stalls disponibles pour ${tackQuantityNumber} demande${tackQuantityNumber === 1 ? "" : "s"}.`, `Not enough tack stalls available for ${tackQuantityNumber} request${tackQuantityNumber === 1 ? "" : "s"}.`);
  }

  if (needsBeddingOption) {
    return uiText(locale, "Choisir le produit de ripe à ajouter.", "Choose the shavings product to add.");
  }

  if (beddingAvailabilityTooLow) {
    return uiText(locale, `Pas assez de ripe disponible pour ${beddingTotalQuantity} sac${beddingTotalQuantity === 1 ? "" : "s"}.`, `Not enough shavings available for ${beddingTotalQuantity} bag${beddingTotalQuantity === 1 ? "" : "s"}.`);
  }

  if (needsHayOption) {
    return uiText(locale, "Choisir le produit de foin à ajouter.", "Choose the hay product to add.");
  }

  if (hayAvailabilityTooLow) {
    return uiText(locale, `Pas assez de foin disponible pour ${hayTotalQuantity} unité${hayTotalQuantity === 1 ? "" : "s"}.`, `Not enough hay available for ${hayTotalQuantity} unit${hayTotalQuantity === 1 ? "" : "s"}.`);
  }

  if (campingAvailabilityTooLow) {
    return uiText(locale, `Pas assez de camping disponible pour ${campingQuantityNumber} unité${campingQuantityNumber === 1 ? "" : "s"}.`, `Not enough camping available for ${campingQuantityNumber} unit${campingQuantityNumber === 1 ? "" : "s"}.`);
  }

  if (selectedOptionUsesDailyReservations && (!dayOptions.length || !selectedStartDayId || !selectedEndDayId)) {
    return uiText(locale, "Ce concours a besoin de journées avant de créer une réservation.", "This show needs days before creating a reservation.");
  }

  return uiText(locale, "Compléter les informations de réservation.", "Complete reservation information.");
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
    return "Documents santé non exigés";
  }

  const parts = [
    validity.coggins.expiresOn ? `Coggins valide jusqu'au ${formatDate(validity.coggins.expiresOn)}` : null,
    validity.vaccine.expiresOn ? `Vaccin valide jusqu'au ${formatDate(validity.vaccine.expiresOn)}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : "Documents santé valides";
}

function stallSingleHealthValidityMessage(label: string, validity: Pick<HorseCogginsValidity, "expiresOn" | "status" | "valid">) {
  if (validity.status === "not_required") {
    return `${label} non exigé`;
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `${label} valide jusqu'au ${formatDate(validity.expiresOn)}`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `${label} expiré le ${formatDate(validity.expiresOn)}`;
  }

  if (validity.status === "pending_review") {
    return `${label} en révision`;
  }

  if (validity.status === "rejected") {
    return `${label} refusé`;
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

  return "Santé valide";
}

function stallSingleHealthValidityTagLabel(label: string, validity: Pick<HorseCogginsValidity, "expiresOn" | "status">) {
  if (validity.status === "expired" && validity.expiresOn) {
    return `${label} expiré ${formatDate(validity.expiresOn)}`;
  }

  if (validity.status === "pending_review") {
    return `${label} en révision`;
  }

  if (validity.status === "rejected") {
    return `${label} refusé`;
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

function stallOptionAssignmentLabel(option: StallOption, locale: Locale = "fr") {
  if (option.category === "stall") {
    if (isTackStallOption(option)) {
      return option.limit_per_horse_stalls ? uiText(locale, `Non attitré, limite 1/${option.limit_per_horse_stalls} stalls chevaux`, `Unassigned, limit 1/${option.limit_per_horse_stalls} horse stalls`) : uiText(locale, "Non attitré", "Unassigned");
    }

    return uiText(locale, "Par cheval", "Per horse");
  }

  return uiText(locale, "Réservation simple", "Simple reservation");
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
  locale,
  availableQuantity,
  currency,
  option,
  quantityNumber,
  quantityTooHigh,
  totalPrice,
}: {
  locale: Locale;
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
          <strong>{uiText(locale, "Aucun produit choisi", "No product selected")}</strong>
          <small>{uiText(locale, "Le prix, les dates et la facture se calculeront après le choix du produit.", "Price, dates and invoice will be calculated after selecting a product.")}</small>
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
          {categoryLabel(option.category, locale)} / {displayAvailability} {uiText(locale, `disponible${displayAvailability === 1 ? "" : "s"}`, "available")}
        </small>
      </span>
      <span>
        <strong>{formatCurrency(option.price, currency)}</strong>
        <small>{uiText(locale, "Prix unitaire", "Unit price")}</small>
      </span>
      <span>
        <strong>{formatCurrency(totalPrice, currency)}</strong>
        <small>
          {quantityNumber} x {uiText(locale, "facture", "invoice")}
        </small>
      </span>
    </div>
  );
}

function reservationOptionSelectLabel(option: StallOption, currency: string, locale: Locale = "fr") {
  const availability = option.available_quantity > 0 ? uiText(locale, `${option.available_quantity}/${option.total_quantity} disponible`, `${option.available_quantity}/${option.total_quantity} available`) : uiText(locale, "complet", "full");
  return `${option.name} - ${formatCurrency(option.price, currency)} - ${availability}`;
}

function reservationOptionAvailabilityLabel(option: StallOption, currency: string) {
  return `${option.available_quantity} disponible${option.available_quantity === 1 ? "" : "s"} a ${formatCurrency(option.price, currency)}`;
}

function categoryLabel(category: StallOption["category"], locale: Locale = "fr") {
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
      return uiText(locale, "Sans catégorie", "Uncategorized");
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
