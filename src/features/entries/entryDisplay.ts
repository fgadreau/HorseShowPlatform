import { showScorePatternLabel } from "../classes/showScorePatterns";
import { findById } from "../../lib/display";
import type { Block, ClassRecord } from "../../types/domain";
import type { Locale } from "../../lib/i18n";
import { uiText } from "../dashboard/shared";

function entryClassLabel(classRecord: ClassRecord | null | undefined, locale: Locale = "fr") {
  if (!classRecord) {
    return uiText(locale, "Classe inconnue", "Unknown class");
  }

  const code = classRecord.code?.trim();
  const name = classRecord.name.trim();

  if (!code || name.includes(code)) {
    return name;
  }

  return `${code} - ${name}`;
}

function entryClassBlockDetail(classRecord: ClassRecord | null | undefined, blocks: Block[], locale: Locale = "fr") {
  const block = classRecord ? findById(blocks, classRecord.block_id) : null;
  return block ? `${uiText(locale, "Bloc", "Block")}: ${block.name}` : "";
}

function entryPatternLabel(block: Block | null | undefined, locale: Locale = "fr") {
  const pattern = block?.pattern ? showScorePatternLabel(block.pattern) : uiText(locale, "À confirmer", "To be confirmed");
  return `${uiText(locale, "Patron", "Pattern")}: ${pattern}`;
}

function entryClassPatternDetail(classRecord: ClassRecord | null | undefined, blocks: Block[], locale: Locale = "fr") {
  return entryPatternLabel(classRecord ? findById(blocks, classRecord.block_id) : null, locale);
}

export { entryClassBlockDetail, entryClassLabel, entryPatternLabel, entryClassPatternDetail };
