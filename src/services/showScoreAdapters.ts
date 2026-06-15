import type {
  ClassRecord,
  Contact,
  Division,
  Entry,
  Horse,
  Organization,
  Show,
  ShowDay,
} from "../types/domain";

export type ShowScoreAssociation = {
  id: string;
  name: string;
  shortName: string;
  timezone: string;
  logoDataUrl: string | null;
  websiteUrl: string | null;
};

export type ShowScoreShowStatus = "draft" | "active" | "completed" | "archived";

export type ShowScoreShow = {
  id: string;
  associationId: string;
  name: string;
  venue: string;
  location: string;
  startDate: string;
  endDate: string;
  status: ShowScoreShowStatus;
};

export type ShowScoreDay = {
  id: string;
  associationId: string;
  showId: string;
  label: string;
  date: string;
  sortOrder: number;
};

export type ShowScoreClass = {
  id: string;
  associationId: string;
  showId: string;
  dayId: string;
  name: string;
  classCode: string;
  arena: string;
  pattern: string;
  customPattern: Record<string, unknown> | null;
  judgeName: string;
  sortOrder: number;
};

export type ShowScoreRun = {
  id: string;
  runId: string;
  blockRunId: string;
  entryId: string;
  entryIds: string[];
  classId: string;
  divisionId: string;
  divisionIds: string[];
  horseId: string;
  riderContactId: string | null;
  ownerContactId: string;
  payerContactId: string;
  order: number;
  draw: number;
  backNumber: string;
  rider: string;
  horse: string;
  owner: string;
  divisionNames: string[];
  isLate: boolean;
  drawGroup: "late" | "regular";
};

type EntryRunGroup = {
  id: string;
  entries: Entry[];
  created_at: string;
  horse_id: string;
  rider_contact_id: string | null;
  owner_contact_id: string;
  payer_contact_id: string;
  is_late: boolean;
};

export type ShowScoreContext = {
  associations: ShowScoreAssociation[];
  shows: ShowScoreShow[];
  days: ShowScoreDay[];
  classes: ShowScoreClass[];
};

type RunRelations = {
  divisions: Division[];
  horses: Horse[];
  contacts: Contact[];
};

type ShowScoreAdapterContext = {
  organizations: Organization[];
  shows: Show[];
  showDays: ShowDay[];
  classes: ClassRecord[];
};

const inactiveEntryStatuses = new Set<Entry["status"]>(["cancelled", "scratched", "scratched_pending_refund"]);
const minimumRiderDrawSpacing = 9;

export function toShowScoreAssociation(organization: Organization): ShowScoreAssociation {
  return {
    id: organization.id,
    name: organization.name,
    shortName: organization.short_name || organization.name,
    timezone: organization.timezone,
    logoDataUrl: organization.logo_url,
    websiteUrl: organization.website_url,
  };
}

export function toShowScoreShow(show: Show): ShowScoreShow {
  return {
    id: show.id,
    associationId: show.organization_id,
    name: show.name,
    venue: show.venue || "",
    location: show.location || formatLocation(show),
    startDate: show.start_date,
    endDate: show.end_date,
    status: toShowScoreStatus(show.status),
  };
}

export function toShowScoreDay(day: ShowDay): ShowScoreDay {
  return {
    id: day.id,
    associationId: day.organization_id,
    showId: day.show_id,
    label: day.day_name || formatDateLabel(day.day_date),
    date: day.day_date,
    sortOrder: day.sort_order || day.day_number || 1,
  };
}

export function toShowScoreClass(classRecord: ClassRecord): ShowScoreClass {
  return {
    id: classRecord.id,
    associationId: classRecord.organization_id,
    showId: classRecord.show_id,
    dayId: classRecord.show_day_id || "",
    name: classRecord.name,
    classCode: classRecord.code || "",
    arena: classRecord.arena || "",
    pattern: classRecord.pattern || "",
    customPattern: classRecord.custom_pattern,
    judgeName: classRecord.judge_name || "",
    sortOrder: classRecord.sort_order || 1,
  };
}

export function buildShowScoreContext(context: ShowScoreAdapterContext, organizationId?: string): ShowScoreContext {
  const organizationIds = new Set(
    organizationId ? [organizationId] : context.organizations.map((organization) => organization.id),
  );
  const showIds = new Set(
    context.shows
      .filter((show) => organizationIds.has(show.organization_id))
      .map((show) => show.id),
  );

  return {
    associations: context.organizations
      .filter((organization) => organizationIds.has(organization.id))
      .map(toShowScoreAssociation),
    shows: context.shows.filter((show) => showIds.has(show.id)).map(toShowScoreShow),
    days: context.showDays.filter((day) => showIds.has(day.show_id)).map(toShowScoreDay),
    classes: context.classes.filter((classRecord) => showIds.has(classRecord.show_id)).map(toShowScoreClass),
  };
}

export function buildShowScoreRunsForClass(
  classId: string,
  entries: Entry[],
  relations: RunRelations,
): ShowScoreRun[] {
  const divisionsById = new Map(relations.divisions.map((division) => [division.id, division]));
  const classDivisionIds = new Set(
    relations.divisions
      .filter((division) => division.class_id === classId)
      .map((division) => division.id),
  );
  const eligibleEntries = entries.filter((entry) => classDivisionIds.has(entry.division_id) && !inactiveEntryStatuses.has(entry.status));
  const eligibleRunGroups = groupEntriesForPhysicalRuns(eligibleEntries);
  const lateRunGroups = stableShuffle(
    eligibleRunGroups.filter((group) => group.is_late),
    `${classId}:late`,
  );
  const regularEntries = buildSpacedDrawOrder(
    eligibleRunGroups.filter((group) => !group.is_late),
    classId,
    lateRunGroups,
  );
  const orderedRunGroups = [...lateRunGroups, ...regularEntries];
  const lateRunCount = lateRunGroups.length;

  return orderedRunGroups
    .map((group, index) => {
      const draw = index < lateRunCount ? index - lateRunCount : index - lateRunCount + 1;
      return toShowScoreRun(group, draw, divisionsById, relations);
    })
    .filter((run): run is ShowScoreRun => Boolean(run));
}

function toShowScoreRun(
  group: EntryRunGroup,
  fallbackDraw: number,
  divisionsById: Map<string, Division>,
  relations: RunRelations,
): ShowScoreRun | null {
  const representativeEntry = group.entries[0];
  const division = divisionsById.get(representativeEntry.division_id);
  const horse = relations.horses.find((candidate) => candidate.id === group.horse_id);
  const owner = relations.contacts.find((candidate) => candidate.id === group.owner_contact_id);
  const rider = group.rider_contact_id
    ? relations.contacts.find((candidate) => candidate.id === group.rider_contact_id)
    : owner;

  if (!representativeEntry || !division || !horse || !owner) {
    return null;
  }

  const draw = fallbackDraw;
  const entryIds = group.entries.map((entry) => entry.id);
  const divisionIds = Array.from(new Set(group.entries.map((entry) => entry.division_id)));

  return {
    id: group.id,
    runId: group.id,
    blockRunId: group.id,
    entryId: representativeEntry.id,
    entryIds,
    classId: division.class_id,
    divisionId: division.id,
    divisionIds,
    horseId: horse.id,
    riderContactId: group.rider_contact_id,
    ownerContactId: owner.id,
    payerContactId: group.payer_contact_id,
    order: draw,
    draw,
    backNumber: representativeEntry.entry_number ? String(representativeEntry.entry_number) : "",
    rider: formatContactName(rider),
    horse: horse.name,
    owner: formatContactName(owner),
    divisionNames: group.entries
      .map((entry) => divisionsById.get(entry.division_id))
      .filter((entryDivision): entryDivision is Division => Boolean(entryDivision))
      .map(divisionDisplayName),
    isLate: group.is_late,
    drawGroup: group.is_late ? "late" : "regular",
  };
}

function toShowScoreStatus(status: Show["status"]): ShowScoreShowStatus {
  if (status === "open") {
    return "active";
  }

  if (status === "closed") {
    return "completed";
  }

  return status;
}

function formatContactName(contact: Contact | undefined) {
  if (!contact) {
    return "";
  }

  return [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
}

function divisionDisplayName(division: Division) {
  return [division.code, division.name].filter(Boolean).join(" - ");
}

function formatLocation(show: Show) {
  return [show.city, show.state, show.country].filter(Boolean).join(", ");
}

function formatDateLabel(date: string) {
  return date;
}

function groupEntriesForPhysicalRuns(entries: Entry[]) {
  const groupsByKey = new Map<string, Entry[]>();

  entries.forEach((entry) => {
    const key = physicalRunKey(entry);
    const groupEntries = groupsByKey.get(key) ?? [];
    groupEntries.push(entry);
    groupsByKey.set(key, groupEntries);
  });

  return Array.from(groupsByKey.values()).map((groupEntries) => {
    const sortedEntries = [...groupEntries].sort(compareEntriesForRunGroup);
    const representative = sortedEntries[0];

    return {
      id: representative.id,
      entries: sortedEntries,
      created_at: representative.created_at,
      horse_id: representative.horse_id,
      rider_contact_id: representative.rider_contact_id,
      owner_contact_id: representative.owner_contact_id,
      payer_contact_id: representative.payer_contact_id,
      is_late: sortedEntries.some((entry) => entry.is_late),
    };
  });
}

function physicalRunKey(entry: Entry) {
  return [
    entry.horse_id,
    entry.rider_contact_id || entry.owner_contact_id,
    entry.owner_contact_id,
  ].join(":");
}

function compareEntriesForRunGroup(first: Entry, second: Entry) {
  return first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id);
}

function buildSpacedDrawOrder<T extends { id: string; created_at: string; rider_contact_id: string | null; owner_contact_id: string }>(
  entries: T[],
  classId: string,
  precedingEntries: T[] = [],
) {
  const remaining = stableShuffle(entries, `${classId}:regular`);
  const ordered: T[] = [];
  const lastPositionByRider = new Map<string, number>();

  precedingEntries.forEach((entry, index) => {
    lastPositionByRider.set(drawRiderKey(entry), index);
  });

  while (remaining.length) {
    const position = precedingEntries.length + ordered.length;
    const candidates = remaining.map((entry, index) => {
      const riderKey = drawRiderKey(entry);
      const lastPosition = lastPositionByRider.get(riderKey);
      const gap = lastPosition == null ? Number.POSITIVE_INFINITY : position - lastPosition;
      const sameRiderRemaining = remaining.filter((candidate) => drawRiderKey(candidate) === riderKey).length;

      return {
        entry,
        gap,
        index,
        randomWeight: stableNumber(`${classId}:${entry.id}:${position}`),
        sameRiderRemaining,
      };
    });
    const eligibleCandidates = candidates.filter((candidate) => candidate.gap >= minimumRiderDrawSpacing);
    const pool = eligibleCandidates.length ? eligibleCandidates : candidates;

    pool.sort((left, right) => {
      if (left.sameRiderRemaining !== right.sameRiderRemaining) {
        return right.sameRiderRemaining - left.sameRiderRemaining;
      }

      if (left.gap !== right.gap) {
        return right.gap - left.gap;
      }

      return left.randomWeight - right.randomWeight;
    });

    const selected = pool[0];
    remaining.splice(selected.index, 1);
    ordered.push(selected.entry);
    lastPositionByRider.set(drawRiderKey(selected.entry), position);
  }

  return ordered;
}

function stableShuffle<T extends { id: string; created_at: string }>(entries: T[], salt: string) {
  return [...entries].sort((left, right) => {
    const leftWeight = stableNumber(`${salt}:${left.id}`);
    const rightWeight = stableNumber(`${salt}:${right.id}`);

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

function stableNumber(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function drawRiderKey(entry: { rider_contact_id: string | null; owner_contact_id: string }) {
  return entry.rider_contact_id ?? entry.owner_contact_id;
}
