import { useState } from "react";
import type { FormEvent } from "react";
import type { ComponentType } from "react";
import { ClipboardList, Plus, Warehouse } from "lucide-react";
import { ContactPicker, EmptyState, FormActions, Metric, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import {
  createStallBooking,
  createContact,
  createStallOption,
  updateStallBooking,
  updateStallOption,
} from "../../services/supabaseServices";
import type { Contact, ContactRole, Horse, Organization, Show, ShowDay, StallBooking, StallOption } from "../../types/domain";

const stallPresets = [
  { key: "stall", label: "Stall", name: "Stall", category: "stall" },
  { key: "tack-stall", label: "Tack stall", name: "Tack stall", category: "stall" },
  { key: "shavings", label: "Ripe / shavings", name: "Ripe / shavings", category: "extra" },
  { key: "hay", label: "Foin / hay", name: "Foin / hay", category: "extra" },
  { key: "camping", label: "Camping", name: "Camping", category: "camping" },
  { key: "custom", label: "Custom", name: "", category: "extra" },
] as const;

const bookingStatuses: StallBooking["status"][] = ["requested", "reserved", "active", "cancelled", "completed"];

type AssociationReservationTab = "reservations" | "new-reservation" | "options";
type PersonalReservationTab = "my-reservations" | "new-reservation" | "available-options";

export function StallsView({
  bookings,
  contacts,
  contactRoles,
  currency,
  horses,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  onCreateContact,
  onCreateStallBooking,
  onCreateStallOption,
  onUpdateStallBooking,
  onUpdateStallOption,
}: {
  bookings: StallBooking[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
  onUpdateStallBooking: (id: string, input: Parameters<typeof updateStallBooking>[1]) => Promise<void>;
  onUpdateStallOption: (id: string, input: Parameters<typeof updateStallOption>[1]) => Promise<void>;
}) {
  const [editingOption, setEditingOption] = useState<StallOption | null>(null);
  const [editingBooking, setEditingBooking] = useState<StallBooking | null>(null);
  const [activeTab, setActiveTab] = useState<AssociationReservationTab>("reservations");
  const reservedQuantity = bookings
    .filter((booking) => booking.status !== "cancelled")
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
      detail: "Ajouter une demande pour un exposant.",
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
          setEditingBooking(null);
          setEditingOption(null);
        }}
      />

      {activeTab === "reservations" ? (
        <>
          {editingBooking ? (
            <StallBookingEditForm
              booking={editingBooking}
              contacts={contacts}
              contactRoles={contactRoles}
              currency={currency}
              horses={horses}
              organization={organization}
              profileId={profileId}
              showDays={showDays}
              stallOptions={stallOptions}
              onCancel={() => setEditingBooking(null)}
              onCreateContact={onCreateContact}
              onUpdateStallBooking={async (id, input) => {
                await onUpdateStallBooking(id, input);
                setEditingBooking(null);
              }}
            />
          ) : null}

          <StallBookingsTable bookings={bookings} contacts={contacts} currency={currency} horses={horses} options={stallOptions} onEdit={setEditingBooking} />
        </>
      ) : null}

      {activeTab === "new-reservation" ? (
        <StallBookingForm
          contacts={contacts}
          contactRoles={contactRoles}
          currency={currency}
          defaultStatus="reserved"
          horses={horses}
          organization={organization}
          profileId={profileId}
          showDays={showDays}
          shows={shows}
          stallOptions={stallOptions}
          title="Nouvelle reservation"
          onCreateContact={onCreateContact}
          onCreateStallBooking={onCreateStallBooking}
        />
      ) : null}

      {activeTab === "options" ? (
        <>
          <StallOptionForm organization={organization} showDays={showDays} shows={shows} onCreateStallOption={onCreateStallOption} />

          {editingOption ? (
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
  horses,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  onCreateContact,
  onCreateStallBooking,
  onUpdateStallBooking,
}: {
  bookings: StallBooking[];
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
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
            <StallBookingEditForm
              booking={editingBooking}
              contacts={contacts}
              contactRoles={contactRoles}
              currency={currency}
              horses={horses}
              organization={organization}
              profileId={profileId}
              showDays={showDays}
              stallOptions={stallOptions}
              onCancel={() => setEditingBooking(null)}
              onCreateContact={onCreateContact}
              onUpdateStallBooking={async (id, input) => {
                await onUpdateStallBooking(id, input);
                setEditingBooking(null);
              }}
            />
          ) : null}

          <StallBookingsTable
            bookings={bookings}
            contacts={contacts}
            currency={currency}
            horses={horses}
            options={stallOptions}
            title="Mes reservations"
            onEdit={setEditingBooking}
          />
        </>
      ) : null}

      {activeTab === "new-reservation" ? (
        <StallBookingForm
          allowStatusEdit={false}
          contacts={contacts}
          contactRoles={contactRoles}
          currency={currency}
          defaultStatus="requested"
          horses={horses}
          organization={organization}
          profileId={profileId}
          showDays={showDays}
          shows={shows}
          stallOptions={stallOptions}
          title="Nouvelle reservation"
          onCreateContact={onCreateContact}
          onCreateStallBooking={onCreateStallBooking}
        />
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
                {categoryLabel(option.category)} / {formatCurrency(option.price, currency)}
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
  options,
  title = "Reservations",
  onEdit,
}: {
  bookings: StallBooking[];
  contacts: Contact[];
  currency: string;
  horses: Horse[];
  options: StallOption[];
  title?: string;
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
          <span>Status</span>
          <span>Action</span>
        </div>
        {bookings.map((booking) => {
          const option = findById(options, booking.stall_option_id);
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
              <span className={`badge ${booking.status}`}>{booking.status}</span>
              <button className="text-button" type="button" onClick={() => onEdit(booking)}>
                Modifier
              </button>
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
}: {
  organization: Organization | null;
  showDays: ShowDay[];
  shows: Show[];
  onCreateStallOption: (input: Parameters<typeof createStallOption>[0]) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [presetKey, setPresetKey] = useState("stall");
  const [name, setName] = useState("Stall");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NonNullable<StallOption["category"]>>("stall");
  const [price, setPrice] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("1");
  const [availableQuantity, setAvailableQuantity] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [startDayId, setStartDayId] = useState("");
  const [endDayId, setEndDayId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const dayOptions = showDays.filter((day) => day.show_id === selectedShowId);
  const selectedStartDayId = validDayId(startDayId, dayOptions) || dayOptions[0]?.id || "";
  const selectedEndDayId = validDayId(endDayId, dayOptions) || selectedStartDayId || dayOptions[dayOptions.length - 1]?.id || "";
  const canCreate = Boolean(organization && selectedShowId);

  function handlePresetChange(nextPresetKey: string) {
    setPresetKey(nextPresetKey);
    const preset = stallPresets.find((candidate) => candidate.key === nextPresetKey);

    if (preset && preset.key !== "custom") {
      setName(preset.name);
      setCategory(preset.category);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedShowId) {
      return;
    }

    const total = integerValue(totalQuantity, 1);
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
        duration_days: integerValue(durationDays, 0) || undefined,
        show_day_start_id: selectedStartDayId || undefined,
        show_day_end_id: selectedEndDayId || undefined,
        category,
        notes,
      });
      setName(stallPresets[0].name);
      setDescription("");
      setCategory("stall");
      setPrice("");
      setTotalQuantity("1");
      setAvailableQuantity("");
      setDurationDays("");
      setNotes("");
      setPresetKey("stall");
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
          <select disabled={!organization || !shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
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
        <div className="form-grid">
          <label>
            Start day
            <select disabled={!canCreate || !dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
              {dayOptions.map((day) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            End day
            <select disabled={!canCreate || !dayOptions.length} value={selectedEndDayId} onChange={(event) => setEndDayId(event.target.value)}>
              {dayOptions.map((day) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Duration days
            <input disabled={!canCreate} min="0" step="1" type="number" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
          </label>
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
  const [durationDays, setDurationDays] = useState(option.duration_days == null ? "" : String(option.duration_days));
  const [startDayId, setStartDayId] = useState(option.show_day_start_id ?? "");
  const [endDayId, setEndDayId] = useState(option.show_day_end_id ?? "");
  const [notes, setNotes] = useState(option.notes ?? "");
  const [busy, setBusy] = useState(false);
  const dayOptions = showDays.filter((day) => day.show_id === option.show_id);
  const selectedStartDayId = validDayId(startDayId, dayOptions) || dayOptions[0]?.id || "";
  const selectedEndDayId = validDayId(endDayId, dayOptions) || selectedStartDayId || dayOptions[dayOptions.length - 1]?.id || "";
  const show = findById(shows, option.show_id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = integerValue(totalQuantity, option.total_quantity);
    setBusy(true);

    try {
      await onUpdateStallOption(option.id, {
        name,
        description: description || null,
        category,
        price: numericValue(price) ?? option.price,
        total_quantity: total,
        available_quantity: Math.min(integerValue(availableQuantity, option.available_quantity), total),
        duration_days: integerValue(durationDays, 0) || null,
        show_day_start_id: selectedStartDayId || null,
        show_day_end_id: selectedEndDayId || null,
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
        <div className="form-grid">
          <label>
            Start day
            <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
              {dayOptions.map((day) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            End day
            <select disabled={!dayOptions.length} value={selectedEndDayId} onChange={(event) => setEndDayId(event.target.value)}>
              {dayOptions.map((day) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Duration days
            <input min="0" step="1" type="number" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
          </label>
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
  contacts,
  contactRoles,
  currency,
  defaultStatus,
  horses,
  organization,
  profileId,
  showDays,
  shows,
  stallOptions,
  title,
  onCreateContact,
  onCreateStallBooking,
}: {
  allowStatusEdit?: boolean;
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  defaultStatus: StallBooking["status"];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  stallOptions: StallOption[];
  title: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateStallBooking: (input: Parameters<typeof createStallBooking>[0]) => Promise<void>;
}) {
  const firstReservableOption = stallOptions.find((option) => option.available_quantity > 0) ?? stallOptions[0] ?? null;
  const [showId, setShowId] = useState("");
  const [optionId, setOptionId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [bookerContactId, setBookerContactId] = useState("");
  const [payerContactId, setPayerContactId] = useState("");
  const [status, setStatus] = useState<StallBooking["status"]>(defaultStatus);
  const [quantity, setQuantity] = useState("1");
  const [startDayId, setStartDayId] = useState("");
  const [endDayId, setEndDayId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || firstReservableOption?.show_id || shows[0]?.id || "";
  const optionChoices = stallOptions.filter((option) => option.show_id === selectedShowId && option.available_quantity > 0);
  const selectedOption = findById(optionChoices, optionId) ?? optionChoices[0] ?? null;
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedBookerId = bookerContactId || contacts[0]?.id || "";
  const selectedPayerId = payerContactId || selectedHorse?.primary_owner_contact_id || selectedBookerId;
  const dayOptions = showDays.filter((day) => day.show_id === (selectedOption?.show_id ?? selectedShowId));
  const selectedStartDayId = validDayId(startDayId, dayOptions) || selectedOption?.show_day_start_id || dayOptions[0]?.id || "";
  const selectedEndDayId = validDayId(endDayId, dayOptions) || selectedOption?.show_day_end_id || selectedStartDayId || "";
  const quantityNumber = positiveIntegerValue(quantity, 1);
  const unitPrice = Number(selectedOption?.price ?? 0);
  const totalPrice = status === "cancelled" ? 0 : unitPrice * quantityNumber;
  const canCreate = Boolean(organization && profileId && selectedOption && selectedBookerId && selectedPayerId && selectedStartDayId && selectedEndDayId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !profileId || !selectedOption || !selectedBookerId || !selectedPayerId || !selectedStartDayId || !selectedEndDayId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateStallBooking({
        organization_id: organization.id,
        show_id: selectedOption.show_id,
        stall_option_id: selectedOption.id,
        horse_id: selectedHorse?.id,
        created_by_user_id: profileId,
        booker_contact_id: selectedBookerId,
        payer_contact_id: selectedPayerId,
        status: allowStatusEdit ? status : defaultStatus,
        show_day_start_id: selectedStartDayId,
        show_day_end_id: selectedEndDayId,
        quantity: quantityNumber,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes,
      });
      setHorseId("");
      setPayerContactId("");
      setQuantity("1");
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{canCreate ? `Invoice draft line: ${formatCurrency(totalPrice, currency)}.` : "Need show days, an option and a linked contact first."}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Show
          <select disabled={!shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Option
          <SearchSelect
            disabled={!optionChoices.length}
            items={optionChoices.map((option) => ({
              id: option.id,
              label: option.name,
              detail: `${formatCurrency(option.price, currency)} / ${option.available_quantity} available`,
            }))}
            placeholder="Search option"
            value={selectedOption?.id ?? ""}
            onChange={setOptionId}
          />
        </label>
        <div className="form-grid">
          <label>
            Quantity
            <input disabled={!selectedOption} min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          {allowStatusEdit ? (
            <label>
              Status
              <select disabled={!selectedOption} value={status} onChange={(event) => setStatus(event.target.value as StallBooking["status"])}>
                {bookingStatuses.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Status
              <input disabled value={defaultStatus} />
            </label>
          )}
        </div>
        <label>
          Horse
          <SearchSelect
            allowEmpty
            disabled={!horses.length}
            items={horses.map((horse) => ({ id: horse.id, label: horse.name, detail: contactLabel(findById(contacts, horse.primary_owner_contact_id)) }))}
            placeholder="Search horse"
            value={selectedHorse?.id ?? ""}
            onChange={setHorseId}
          />
        </label>
        <div className="form-grid">
            <ContactPicker
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              disabled={!organization}
              label="Booker"
              organization={organization}
              role="booker"
              value={selectedBookerId}
              onChange={setBookerContactId}
              onCreateContact={onCreateContact}
            />
            <ContactPicker
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              disabled={!organization}
              label="Payer"
              organization={organization}
              role="payer"
              value={selectedPayerId}
              onChange={setPayerContactId}
              onCreateContact={onCreateContact}
            />
          </div>
        <div className="form-grid">
          <label>
            Start day
            <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
              {dayOptions.map((day) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            End day
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
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
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
  horses,
  organization,
  profileId,
  showDays,
  stallOptions,
  onCancel,
  onCreateContact,
  onUpdateStallBooking,
}: {
  booking: StallBooking;
  contacts: Contact[];
  contactRoles: ContactRole[];
  currency: string;
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
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
  const [startDayId, setStartDayId] = useState(booking.show_day_start_id);
  const [endDayId, setEndDayId] = useState(booking.show_day_end_id);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [busy, setBusy] = useState(false);
  const optionChoices = stallOptions.filter((option) => option.show_id === booking.show_id);
  const selectedOption = findById(optionChoices, optionId) ?? findById(stallOptions, booking.stall_option_id);
  const selectedHorse = findById(horses, horseId) ?? null;
  const dayOptions = showDays.filter((day) => day.show_id === booking.show_id);
  const selectedStartDayId = validDayId(startDayId, dayOptions) || dayOptions[0]?.id || "";
  const selectedEndDayId = validDayId(endDayId, dayOptions) || selectedStartDayId;
  const quantityNumber = positiveIntegerValue(quantity, 1);
  const unitPrice = Number(selectedOption?.price ?? booking.unit_price ?? 0);
  const totalPrice = status === "cancelled" ? 0 : unitPrice * quantityNumber;
  const canUpdate = Boolean(selectedOption && bookerContactId && payerContactId && selectedStartDayId && selectedEndDayId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOption || !bookerContactId || !payerContactId || !selectedStartDayId || !selectedEndDayId) {
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
        show_day_start_id: selectedStartDayId,
        show_day_end_id: selectedEndDayId,
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
          <p>Invoice draft line: {formatCurrency(totalPrice, currency)}.</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Option
          <SearchSelect
            items={optionChoices.map((option) => ({
              id: option.id,
              label: option.name,
              detail: `${formatCurrency(option.price, currency)} / ${option.available_quantity} available`,
            }))}
            placeholder="Search option"
            value={selectedOption?.id ?? ""}
            onChange={setOptionId}
          />
        </label>
        <div className="form-grid">
          <label>
            Quantity
            <input min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as StallBooking["status"])}>
              {bookingStatuses.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Horse
          <SearchSelect
            allowEmpty
            items={horses.map((horse) => ({ id: horse.id, label: horse.name, detail: contactLabel(findById(contacts, horse.primary_owner_contact_id)) }))}
            placeholder="Search horse"
            value={selectedHorse?.id ?? ""}
            onChange={setHorseId}
          />
        </label>
        <div className="form-grid">
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            label="Booker"
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
            label="Payer"
            organization={organization}
            role="payer"
            value={payerContactId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <div className="form-grid">
          <label>
            Start day
            <select disabled={!dayOptions.length} value={selectedStartDayId} onChange={(event) => setStartDayId(event.target.value)}>
              {dayOptions.map((day) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            End day
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
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <FormActions busy={busy || !canUpdate} onCancel={onCancel} />
      </form>
    </section>
  );
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
