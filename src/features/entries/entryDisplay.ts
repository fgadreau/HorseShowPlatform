import { findById } from "../../lib/display";
import type { ClassRecord, Division } from "../../types/domain";
import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";

function entryDivisionLabel(division: Division | null | undefined, locale: Locale = "fr") {
  if (!division) {
    return uiText(locale, "Classe inconnue", "Unknown class");
  }

  const code = division.code?.trim();
  const name = division.name.trim();

  if (!code || name.includes(code)) {
    return name;
  }

  return `${code} - ${name}`;
}

function entryDivisionBlockDetail(division: Division | null | undefined, classes: ClassRecord[], locale: Locale = "fr") {
  const classRecord = division ? findById(classes, division.class_id) : null;
  return classRecord ? `${uiText(locale, "Bloc", "Block")}: ${classRecord.name}` : "";
}

export { entryDivisionBlockDetail, entryDivisionLabel };
