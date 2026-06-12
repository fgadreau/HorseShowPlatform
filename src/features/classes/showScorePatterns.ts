import type { ClassRecord } from "../../types/domain";

type ShowScorePatternGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

const numberedPatterns = (prefix: string, label: string, count: number) =>
  Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return { id: `${prefix}${number}`, label: `${label} #${number}` };
  });

const SHOW_SCORE_PATTERN_GROUPS: ShowScorePatternGroup[] = [
  {
    label: "Horaire",
    options: [{ id: "NO_PATTERN", label: "Sans patron" }],
  },
  {
    label: "Reining",
    options: [
      ...numberedPatterns("R", "Reining", 18),
      { id: "RA", label: "Reining #A" },
      { id: "RB", label: "Reining #B" },
    ],
  },
  {
    label: "Ranch Riding",
    options: [
      ...numberedPatterns("RR", "Ranch Riding", 15),
      ...numberedPatterns("SFRR", "Small Fry Ranch Riding", 5),
    ],
  },
  {
    label: "Western Riding",
    options: numberedPatterns("WR", "Western Riding", 9),
  },
  {
    label: "Level 1 Western Riding",
    options: [1, 2, 4, 6, 7, 9].map((number) => ({
      id: `L1WR${number}`,
      label: `Level 1 Western Riding #${number}`,
    })),
  },
  {
    label: "Patrons custom",
    options: [
      { id: "TRAIL_CUSTOM", label: "Trail / Obstacle Western" },
      { id: "WESTERN_HORSEMANSHIP_CUSTOM", label: "Western Horsemanship" },
      { id: "HUNT_SEAT_EQUITATION_CUSTOM", label: "Hunt Seat Equitation" },
      { id: "SHOWMANSHIP_CUSTOM", label: "Showmanship" },
    ],
  },
];

const SHOW_SCORE_PATTERN_OPTIONS = SHOW_SCORE_PATTERN_GROUPS.flatMap((group) =>
  group.options.map((option) => ({
    ...option,
    detail: group.label,
  })),
);

const OPTION_BY_ID = new Map(SHOW_SCORE_PATTERN_OPTIONS.map((option) => [option.id, option]));
const OPTION_BY_SIMPLIFIED_LABEL = new Map(SHOW_SCORE_PATTERN_OPTIONS.map((option) => [simplifyPatternValue(option.label), option]));

function simplifyPatternValue(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/[\u2013\u2014-]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function inRange(value: string, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

export function normalizeShowScorePatternId(value: string | null | undefined) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const directId = rawValue.toUpperCase();
  if (OPTION_BY_ID.has(directId)) return directId;

  const simplifiedValue = simplifyPatternValue(rawValue);
  if (!simplifiedValue) return "";

  if (["NO PATTERN", "NO_PATTERN", "SANS PATRON"].includes(simplifiedValue)) {
    return "NO_PATTERN";
  }

  const labelMatch = OPTION_BY_SIMPLIFIED_LABEL.get(simplifiedValue);
  if (labelMatch) return labelMatch.id;

  const reiningMatch = simplifiedValue.match(/^(?:R|REINING)\s*(?:#|PATTERN)?\s*([0-9]{1,2}|A|B)$/);
  if (reiningMatch) {
    const number = reiningMatch[1];
    if (number === "A" || number === "B" || inRange(number, 1, 18)) {
      return `R${number}`;
    }
  }

  const ranchRidingMatch = simplifiedValue.match(/^(?:RR|RANCH RIDING)\s*(?:#|PATTERN)?\s*([0-9]{1,2})$/);
  if (ranchRidingMatch && inRange(ranchRidingMatch[1], 1, 15)) {
    return `RR${ranchRidingMatch[1]}`;
  }

  const smallFryRanchRidingMatch = simplifiedValue.match(
    /^(?:SFRR|SMALL FRY RANCH RIDING)\s*(?:#|PATTERN)?\s*([1-5])$/,
  );
  if (smallFryRanchRidingMatch) {
    return `SFRR${smallFryRanchRidingMatch[1]}`;
  }

  const westernRidingMatch = simplifiedValue.match(/^(?:WR|WESTERN RIDING)\s*(?:#|PATTERN)?\s*([1-9])$/);
  if (westernRidingMatch) {
    return `WR${westernRidingMatch[1]}`;
  }

  const levelOneWesternRidingMatch = simplifiedValue.match(
    /^(?:L1WR|LEVEL 1 WESTERN RIDING|LEVEL ONE WESTERN RIDING)\s*(?:#|PATTERN)?\s*([1-9])$/,
  );
  if (levelOneWesternRidingMatch && [1, 2, 4, 6, 7, 9].includes(Number(levelOneWesternRidingMatch[1]))) {
    return `L1WR${levelOneWesternRidingMatch[1]}`;
  }

  return "";
}

export function showScorePatternLabel(value: string | null | undefined) {
  const normalizedId = normalizeShowScorePatternId(value);
  if (normalizedId) {
    return OPTION_BY_ID.get(normalizedId)?.label || normalizedId;
  }

  return String(value || "").trim();
}

export function showScorePatternItems(currentValue: string | null | undefined) {
  const rawValue = String(currentValue || "").trim();
  const normalizedId = normalizeShowScorePatternId(rawValue);

  if (rawValue && !normalizedId) {
    return [
      {
        id: rawValue,
        label: rawValue,
        detail: "Valeur existante",
      },
      ...SHOW_SCORE_PATTERN_OPTIONS,
    ];
  }

  return SHOW_SCORE_PATTERN_OPTIONS;
}

export function showScorePatternSelectValue(value: string | null | undefined) {
  const rawValue = String(value || "").trim();
  return normalizeShowScorePatternId(rawValue) || rawValue;
}

export function patternForConcurrentClass(
  patternValue: string | null | undefined,
  concurrentClass: Pick<ClassRecord, "pattern"> | null | undefined,
) {
  if (concurrentClass) {
    return showScorePatternSelectValue(concurrentClass.pattern);
  }

  return showScorePatternSelectValue(patternValue);
}
