import type { ClassRecord, Contact, Division, Horse, Show } from "../types/domain";

export function findById<T extends { id: string }>(items: T[], id: string | null | undefined) {
  if (!id) {
    return undefined;
  }

  return items.find((item) => item.id === id);
}

export function contactLabel(contact: Contact | undefined) {
  if (!contact) {
    return "Unknown contact";
  }

  return `${contact.first_name} ${contact.last_name}`.trim();
}

export function horseLabel(horse: Horse | undefined) {
  return horse?.name ?? "Unknown horse";
}

export function showLabel(show: Show | undefined) {
  return show?.name ?? "Unknown show";
}

export function divisionLabel(division: Division | undefined, classes: ClassRecord[]) {
  if (!division) {
    return "Unknown division";
  }

  const classRecord = findById(classes, division.class_id);
  return classRecord ? `${classRecord.name} / ${division.name}` : division.name;
}

export function itemSearchLabel(item: { label: string; detail?: string }) {
  return item.detail ? `${item.label} - ${item.detail}` : item.label;
}

export function numericValue(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(Number(value || 0));
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}
