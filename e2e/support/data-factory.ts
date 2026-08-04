import type { E2ERunState } from "./run-state";

export type ContactScenario = {
  address: string;
  addressLine2: string;
  barn: string;
  city: string;
  country: string;
  dateOfBirth: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  postalCode: string;
  state: string;
};

const FIRST_NAMES = ["Anaïs", "Jean-Luc", "Zoë", "Maëlle", "Noémie", "Renée", "Søren", "Márta"];
const LAST_NAMES = ["O'Connor-Lévesque", "D'Amours", "Nguyễn", "García", "Tremblay", "测试-Données", "Van der Meer", "McDonald"];
const CITIES = ["Trois-Rivières", "Québec", "Montréal", "Sherbrooke", "Gatineau", "Saint-Hyacinthe"];
const BARNS = ["Écurie du Robot", "Les Tests Galopants", "QA & Chevaux", "Préprod Ranch"];

export function scenarioSize() {
  const requested = Number.parseInt(process.env.E2E_DATASET_SIZE ?? "", 10);
  if (Number.isFinite(requested) && requested > 0) return Math.min(requested, 100);
  return process.env.E2E_MODE === "mega" ? 25 : 3;
}

export function buildContactScenarios(state: E2ERunState, count = scenarioSize()): ContactScenario[] {
  const random = mulberry32(hash(state.runId));
  return Array.from({ length: count }, (_, index) => {
    const firstName = index === 0 ? "Élodie" : index === 1 ? "A".repeat(100) : pick(FIRST_NAMES, random);
    const lastName = index === 0 ? "O'Connor-Lévesque" : index === 1 ? "Limite-Champ" : pick(LAST_NAMES, random);
    return {
      address: `${100 + index} rue de la Préproduction`,
      addressLine2: index % 2 ? `Unité ${index} — porte B` : "",
      barn: pick(BARNS, random),
      city: pick(CITIES, random),
      country: "CA",
      dateOfBirth: `${1975 + (index % 30)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
      email: `robot.${state.runId}.${index}@example.test`,
      firstName,
      lastName,
      phone: `+1 514 555 ${String(1000 + index).slice(-4)}`,
      postalCode: `H${index % 10}H ${index % 10}H${index % 10}`,
      state: "QC",
    };
  });
}

export function futureDate(daysFromToday: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function pick<T>(items: T[], random: () => number) {
  return items[Math.floor(random() * items.length)];
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
