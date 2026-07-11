const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NrhaEligibilityProfileRequest = {
  classCodes?: Array<number | string>;
  competitionLicenseNumber?: number | string;
  continueAfterGlobalBlock?: boolean;
  countryId?: number | string | null;
  date?: string;
  horseBirthYear?: number | string | null;
  horseDateOfBirth?: string | null;
  isEuroEvent?: boolean;
  maxTests?: number;
  memberNumber?: number | string;
  riderBirthYear?: number | string | null;
  riderDateOfBirth?: string | null;
};

type NrhaEligibilityReason = {
  action?: string;
  id?: number;
  message?: string;
  year?: number;
};

type NrhaEligibilityResponse = {
  eligible?: boolean;
  parameters?: Record<string, unknown>;
  reasons?: NrhaEligibilityReason[];
};

type TestDefinition = {
  category:
    | "gate"
    | "non_pro"
    | "novice_horse"
    | "rookie"
    | "green_ride_slide"
    | "open_cap";
  classCode: number;
  className: string;
  id: string;
  questionIds: QuestionId[];
};

type ReasonSignal = {
  actualAmount?: number | null;
  classCode: number;
  code: string;
  globalBlock: boolean;
  message: string;
  scope: "all_nrha_classes" | "non_pro_classes" | "horse_novice_classes" | "rookie_classes" | "green_entry_level_classes" | "open_cap_classes" | "class_specific";
  subject: "rider" | "horse" | "team" | "unknown";
  thresholdAmount?: number | null;
};

type TestResult = {
  classCode: number;
  className: string;
  eligible: boolean | null;
  id: string;
  payload?: unknown;
  reasons: NrhaEligibilityReason[];
  signals: ReasonSignal[];
  status: "eligible" | "ineligible" | "error";
};

type QuestionId =
  | "global_nrha_access"
  | "rider_professional_status"
  | "horse_novice_level"
  | "rider_rookie_level"
  | "green_entry_level"
  | "open_rider_caps";

type ProfileQuestion = {
  answer: string | null;
  evidenceClassCodes: number[];
  id: QuestionId;
  label: string;
  status: "unknown" | "answered" | "blocked";
};

type AgeSnapshot = {
  ageOnJan1: number | null;
  birthYear: number | null;
  dateOfBirth: string | null;
  referenceDate: string;
  rule: "actual_age_on_jan_1" | "horse_competition_age_on_jan_1";
  source: "date_of_birth" | "birth_year" | "unavailable";
};

type EligibilityProfile = {
  globalBlocks: ReasonSignal[];
  horse: {
    age: AgeSnapshot;
    licenseStatus: "unknown" | "blocked";
    noviceHorseLevel: "unknown" | "level_1_or_higher" | "level_2_or_higher" | "level_3_or_higher" | "not_eligible";
  };
  rider: {
    age: AgeSnapshot;
    greenEntryLevel: "unknown" | "ride_slide_level_1_or_higher" | "ride_slide_level_2_or_higher" | "green_reiner_level_1_or_higher" | "green_reiner_level_2_or_higher" | "not_eligible";
    openCapStatus: "unknown" | "under_rookie_professional_cap" | "under_limited_open_cap" | "under_intermediate_open_cap" | "over_intermediate_open_cap";
    professionalStatus: "unknown" | "professional" | "non_pro_eligible";
    rookieLevel: "unknown" | "rookie_level_1_or_higher" | "rookie_level_2_or_higher" | "not_eligible";
  };
};

const strategicTests: TestDefinition[] = [
  {
    category: "gate",
    classCode: 1100,
    className: "Open",
    id: "general_open_gate",
    questionIds: ["global_nrha_access"],
  },
  {
    category: "non_pro",
    classCode: 1600,
    className: "Limited Non Pro",
    id: "limited_non_pro_gate",
    questionIds: ["rider_professional_status"],
  },
  {
    category: "novice_horse",
    classCode: 1775,
    className: "Novice Horse Open Level 3",
    id: "novice_horse_level_3",
    questionIds: ["horse_novice_level"],
  },
  {
    category: "novice_horse",
    classCode: 1750,
    className: "Novice Horse Open Level 2",
    id: "novice_horse_level_2",
    questionIds: ["horse_novice_level"],
  },
  {
    category: "novice_horse",
    classCode: 1700,
    className: "Novice Horse Open Level 1",
    id: "novice_horse_level_1",
    questionIds: ["horse_novice_level"],
  },
  {
    category: "rookie",
    classCode: 5310,
    className: "Rookie Level 2",
    id: "rookie_level_2",
    questionIds: ["rider_rookie_level"],
  },
  {
    category: "rookie",
    classCode: 5300,
    className: "Rookie Level 1",
    id: "rookie_level_1",
    questionIds: ["rider_rookie_level"],
  },
  {
    category: "green_ride_slide",
    classCode: 10200,
    className: "Ride & Slide Open Level 2",
    id: "ride_slide_open_level_2",
    questionIds: ["green_entry_level"],
  },
  {
    category: "green_ride_slide",
    classCode: 10100,
    className: "Ride & Slide Open Level 1",
    id: "ride_slide_open_level_1",
    questionIds: ["green_entry_level"],
  },
  {
    category: "green_ride_slide",
    classCode: 10001,
    className: "Green Reiner Level 2",
    id: "green_reiner_level_2",
    questionIds: ["green_entry_level"],
  },
  {
    category: "green_ride_slide",
    classCode: 10002,
    className: "Green Reiner Level 1",
    id: "green_reiner_level_1",
    questionIds: ["green_entry_level"],
  },
  {
    category: "open_cap",
    classCode: 1350,
    className: "Rookie Professional",
    id: "rookie_professional",
    questionIds: ["open_rider_caps"],
  },
  {
    category: "open_cap",
    classCode: 1301,
    className: "Limited Open",
    id: "limited_open",
    questionIds: ["open_rider_caps"],
  },
  {
    category: "open_cap",
    classCode: 1200,
    className: "Intermediate Open",
    id: "intermediate_open",
    questionIds: ["open_rider_caps"],
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function numericParam(value: unknown, label: string) {
  const numberValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/\D/g, ""));

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return numberValue;
}

function optionalNumericParam(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return numericParam(value, label);
}

function dateParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("date must use YYYY-MM-DD format.");
  }

  return value;
}

function optionalDateParam(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  return value;
}

function optionalBirthYearParam(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isInteger(numberValue) || numberValue < 1900 || numberValue > 2100) {
    throw new Error(`${label} must be a valid birth year.`);
  }

  return numberValue;
}

async function responsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function initialQuestions(): ProfileQuestion[] {
  return [
    {
      answer: null,
      evidenceClassCodes: [],
      id: "global_nrha_access",
      label: "Accès NRHA général",
      status: "unknown",
    },
    {
      answer: null,
      evidenceClassCodes: [],
      id: "rider_professional_status",
      label: "Statut Pro / Non Pro du cavalier",
      status: "unknown",
    },
    {
      answer: null,
      evidenceClassCodes: [],
      id: "horse_novice_level",
      label: "Niveau Novice Horse du cheval",
      status: "unknown",
    },
    {
      answer: null,
      evidenceClassCodes: [],
      id: "rider_rookie_level",
      label: "Niveau Rookie du cavalier",
      status: "unknown",
    },
    {
      answer: null,
      evidenceClassCodes: [],
      id: "green_entry_level",
      label: "Niveau Green / Ride & Slide",
      status: "unknown",
    },
    {
      answer: null,
      evidenceClassCodes: [],
      id: "open_rider_caps",
      label: "Seuils de gains Open / Professional",
      status: "unknown",
    },
  ];
}

function birthYearFromDate(value: string | null) {
  if (!value) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function actualAgeOnReferenceDate(dateOfBirth: string, referenceDate: string) {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [referenceYear, referenceMonth, referenceDay] = referenceDate.split("-").map(Number);

  if (![birthYear, birthMonth, birthDay, referenceYear, referenceMonth, referenceDay].every(Number.isFinite)) {
    return null;
  }

  let age = referenceYear - birthYear;

  if (referenceMonth < birthMonth || (referenceMonth === birthMonth && referenceDay < birthDay)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function ageReferenceDate(showDate: string) {
  return `${showDate.slice(0, 4)}-01-01`;
}

function buildRiderAgeSnapshot(input: { birthYear: number | null; dateOfBirth: string | null; showDate: string }): AgeSnapshot {
  const referenceDate = ageReferenceDate(input.showDate);
  const birthYear = input.dateOfBirth ? birthYearFromDate(input.dateOfBirth) : input.birthYear;

  return {
    ageOnJan1: input.dateOfBirth ? actualAgeOnReferenceDate(input.dateOfBirth, referenceDate) : null,
    birthYear,
    dateOfBirth: input.dateOfBirth,
    referenceDate,
    rule: "actual_age_on_jan_1",
    source: input.dateOfBirth ? "date_of_birth" : input.birthYear ? "birth_year" : "unavailable",
  };
}

function buildHorseAgeSnapshot(input: { birthYear: number | null; dateOfBirth: string | null; showDate: string }): AgeSnapshot {
  const referenceDate = ageReferenceDate(input.showDate);
  const birthYear = input.birthYear ?? birthYearFromDate(input.dateOfBirth);
  const showYear = Number(input.showDate.slice(0, 4));
  const ageOnJan1 = birthYear && Number.isInteger(showYear) ? showYear - birthYear : null;

  return {
    ageOnJan1: ageOnJan1 !== null && ageOnJan1 >= 0 ? ageOnJan1 : null,
    birthYear,
    dateOfBirth: input.dateOfBirth,
    referenceDate,
    rule: "horse_competition_age_on_jan_1",
    source: input.dateOfBirth ? "date_of_birth" : input.birthYear ? "birth_year" : "unavailable",
  };
}

function initialProfile(input: { horseAge: AgeSnapshot; riderAge: AgeSnapshot }): EligibilityProfile {
  return {
    globalBlocks: [],
    horse: {
      age: input.horseAge,
      licenseStatus: "unknown",
      noviceHorseLevel: "unknown",
    },
    rider: {
      age: input.riderAge,
      greenEntryLevel: "unknown",
      openCapStatus: "unknown",
      professionalStatus: "unknown",
      rookieLevel: "unknown",
    },
  };
}

function shouldRunTest(definition: TestDefinition, questions: ProfileQuestion[], profile: EligibilityProfile) {
  if (profile.globalBlocks.length && definition.category !== "gate") {
    return false;
  }

  return definition.questionIds.some((questionId) => questions.find((question) => question.id === questionId)?.status === "unknown");
}

function updateQuestion(questions: ProfileQuestion[], id: QuestionId, input: { answer: string; classCode: number; status?: "answered" | "blocked" }) {
  const question = questions.find((candidate) => candidate.id === id);

  if (!question || question.status === "blocked") {
    return;
  }

  question.answer = input.answer;
  question.status = input.status ?? "answered";

  if (!question.evidenceClassCodes.includes(input.classCode)) {
    question.evidenceClassCodes.push(input.classCode);
  }
}

function normalizeReasonText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function moneyFromText(value: string, pattern: RegExp) {
  const match = value.match(pattern);

  if (!match?.[1]) {
    return null;
  }

  const amount = Number(match[1].replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function classifyReason(reason: NrhaEligibilityReason, classCode: number): ReasonSignal[] {
  const message = reason.message?.trim() ?? "";

  if (!message) {
    return [];
  }

  const normalizedMessage = normalizeReasonText(message);
  const signals: ReasonSignal[] = [];
  const thresholdAmount = moneyFromText(message, /under\s+\$?([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const actualAmount = moneyFromText(message, /with\s+\$?([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const subject: ReasonSignal["subject"] = normalizedMessage.includes("horse")
    ? "horse"
    : normalizedMessage.includes("rider") || normalizedMessage.includes("member")
      ? "rider"
      : normalizedMessage.includes("owner") || normalizedMessage.includes("transfer")
        ? "team"
        : "unknown";

  if (
    normalizedMessage.includes("membership") &&
    (normalizedMessage.includes("inactive") ||
      normalizedMessage.includes("expired") ||
      normalizedMessage.includes("not active") ||
      normalizedMessage.includes("not current") ||
      normalizedMessage.includes("invalid"))
  ) {
    signals.push({
      classCode,
      code: "RIDER_MEMBERSHIP_INACTIVE",
      globalBlock: true,
      message,
      scope: "all_nrha_classes",
      subject: "rider",
    });
  }

  if (
    (normalizedMessage.includes("license") || normalizedMessage.includes("licence")) &&
    (normalizedMessage.includes("horse") || normalizedMessage.includes("competition")) &&
    (normalizedMessage.includes("inactive") ||
      normalizedMessage.includes("expired") ||
      normalizedMessage.includes("not active") ||
      normalizedMessage.includes("invalid") ||
      normalizedMessage.includes("not found"))
  ) {
    signals.push({
      classCode,
      code: "HORSE_LICENSE_INVALID",
      globalBlock: true,
      message,
      scope: "all_nrha_classes",
      subject: "horse",
    });
  }

  if (normalizedMessage.includes("transfer") || normalizedMessage.includes("ownership") || normalizedMessage.includes("owner")) {
    signals.push({
      classCode,
      code: "OWNERSHIP_OR_TRANSFER_REVIEW",
      globalBlock: true,
      message,
      scope: "all_nrha_classes",
      subject: "team",
    });
  }

  if (normalizedMessage.includes("declaration")) {
    signals.push({
      classCode,
      code: "DECLARATION_REQUIRED",
      globalBlock: true,
      message,
      scope: "all_nrha_classes",
      subject: "team",
    });
  }

  if (normalizedMessage.includes("professional") && (normalizedMessage.includes("non pro") || normalizedMessage.includes("non-pro"))) {
    signals.push({
      classCode,
      code: "RIDER_IS_PROFESSIONAL",
      globalBlock: false,
      message,
      scope: "non_pro_classes",
      subject: "rider",
    });
  }

  if (normalizedMessage.includes("exceeds") || normalizedMessage.includes("earned more") || normalizedMessage.includes("over")) {
    signals.push({
      actualAmount,
      classCode,
      code: subject === "horse" ? "HORSE_EARNINGS_EXCEED" : subject === "rider" ? "RIDER_EARNINGS_EXCEED" : "EARNINGS_OR_POINTS_EXCEED",
      globalBlock: false,
      message,
      scope: subject === "horse" ? "horse_novice_classes" : "class_specific",
      subject,
      thresholdAmount,
    });
  }

  if (normalizedMessage.includes("green") || normalizedMessage.includes("youth point") || normalizedMessage.includes("points")) {
    signals.push({
      actualAmount,
      classCode,
      code: "POINTS_CAP_EXCEED",
      globalBlock: false,
      message,
      scope: "green_entry_level_classes",
      subject,
      thresholdAmount,
    });
  }

  if (normalizedMessage.includes("top 35") || normalizedMessage.includes("top 90") || normalizedMessage.includes("top 200")) {
    signals.push({
      classCode,
      code: "RANKING_LEVEL_LIMIT",
      globalBlock: false,
      message,
      scope: "open_cap_classes",
      subject: "rider",
    });
  }

  if (!signals.length) {
    signals.push({
      classCode,
      code: "UNCLASSIFIED_NRHA_REASON",
      globalBlock: false,
      message,
      scope: "class_specific",
      subject,
      thresholdAmount,
    });
  }

  return signals;
}

function applyTestResult(definition: TestDefinition, result: TestResult, profile: EligibilityProfile, questions: ProfileQuestion[], options: { continueAfterGlobalBlock: boolean }) {
  const globalSignals = result.signals.filter((signal) => signal.globalBlock);

  if (globalSignals.length) {
    profile.globalBlocks.push(...globalSignals);

    updateQuestion(questions, "global_nrha_access", {
      answer: globalSignals.map((signal) => signal.message).join(" "),
      classCode: result.classCode,
      status: "blocked",
    });

    if (!options.continueAfterGlobalBlock) {
      for (const question of questions) {
        if (question.status === "unknown") {
          question.status = "blocked";
          question.answer = globalSignals.map((signal) => signal.message).join(" ");
          question.evidenceClassCodes = [result.classCode];
        }
      }
    }

    if (globalSignals.some((signal) => signal.subject === "horse")) {
      profile.horse.licenseStatus = "blocked";
    }

    return;
  }

  if (definition.category === "gate" && result.eligible) {
    updateQuestion(questions, "global_nrha_access", {
      answer: "Aucun blocage global détecté avec le test Open.",
      classCode: result.classCode,
    });
  }

  if (definition.category === "non_pro") {
    if (result.signals.some((signal) => signal.code === "RIDER_IS_PROFESSIONAL")) {
      profile.rider.professionalStatus = "professional";
      updateQuestion(questions, "rider_professional_status", {
        answer: "Cavalier détecté comme professionnel pour les classes Non Pro.",
        classCode: result.classCode,
      });
    } else if (result.eligible) {
      profile.rider.professionalStatus = "non_pro_eligible";
      updateQuestion(questions, "rider_professional_status", {
        answer: "Cavalier admissible au test Non Pro.",
        classCode: result.classCode,
      });
    }
  }

  if (definition.category === "novice_horse") {
    const horseEarningsSignal = result.signals.find((signal) => signal.code === "HORSE_EARNINGS_EXCEED" && typeof signal.actualAmount === "number");

    if (result.eligible) {
      profile.horse.noviceHorseLevel =
        result.classCode === 1700 ? "level_1_or_higher" : result.classCode === 1750 ? "level_2_or_higher" : "level_3_or_higher";
      updateQuestion(questions, "horse_novice_level", {
        answer: `Cheval admissible au test ${definition.className}.`,
        classCode: result.classCode,
      });
    } else if (horseEarningsSignal?.actualAmount != null) {
      const actualAmount = horseEarningsSignal.actualAmount;
      profile.horse.noviceHorseLevel =
        actualAmount <= 5000 ? "level_1_or_higher" : actualAmount <= 25000 ? "level_2_or_higher" : actualAmount <= 50000 ? "level_3_or_higher" : "not_eligible";
      updateQuestion(questions, "horse_novice_level", {
        answer: `Cheval avec gains détectés à ${actualAmount}; niveau Novice déduit: ${profile.horse.noviceHorseLevel}.`,
        classCode: result.classCode,
      });
    } else if (result.classCode === 1700 && result.status === "ineligible") {
      profile.horse.noviceHorseLevel = "not_eligible";
      updateQuestion(questions, "horse_novice_level", {
        answer: "Cheval non admissible jusqu'au test Novice Horse Level 1.",
        classCode: result.classCode,
      });
    }
  }

  if (definition.category === "rookie") {
    if (result.eligible) {
      profile.rider.rookieLevel = result.classCode === 5300 ? "rookie_level_1_or_higher" : "rookie_level_2_or_higher";
      updateQuestion(questions, "rider_rookie_level", {
        answer: `Cavalier admissible au test ${definition.className}.`,
        classCode: result.classCode,
      });
    } else if (result.classCode === 5300 && result.status === "ineligible") {
      profile.rider.rookieLevel = "not_eligible";
      updateQuestion(questions, "rider_rookie_level", {
        answer: "Cavalier non admissible aux tests Rookie Level 1 et 2.",
        classCode: result.classCode,
      });
    }
  }

  if (definition.category === "green_ride_slide") {
    if (result.eligible) {
      profile.rider.greenEntryLevel =
        result.classCode === 10100
          ? "ride_slide_level_1_or_higher"
          : result.classCode === 10200
            ? "ride_slide_level_2_or_higher"
            : result.classCode === 10002
              ? "green_reiner_level_1_or_higher"
              : "green_reiner_level_2_or_higher";
      updateQuestion(questions, "green_entry_level", {
        answer: `Équipe admissible au test ${definition.className}.`,
        classCode: result.classCode,
      });
    } else if (result.classCode === 10002 && result.status === "ineligible") {
      profile.rider.greenEntryLevel = "not_eligible";
      updateQuestion(questions, "green_entry_level", {
        answer: "Équipe non admissible jusqu'au test Green Reiner Level 1.",
        classCode: result.classCode,
      });
    }
  }

  if (definition.category === "open_cap") {
    if (result.eligible) {
      profile.rider.openCapStatus =
        result.classCode === 1350 ? "under_rookie_professional_cap" : result.classCode === 1301 ? "under_limited_open_cap" : "under_intermediate_open_cap";
      updateQuestion(questions, "open_rider_caps", {
        answer: `Cavalier admissible au test ${definition.className}.`,
        classCode: result.classCode,
      });
    } else if (result.classCode === 1200 && result.status === "ineligible") {
      profile.rider.openCapStatus = "over_intermediate_open_cap";
      updateQuestion(questions, "open_rider_caps", {
        answer: "Cavalier non admissible jusqu'au test Intermediate Open.",
        classCode: result.classCode,
      });
    }
  }
}

function availableStrategicTests(_classCodes: number[] | null) {
  return strategicTests;
}

async function fetchEligibility(input: {
  apiKey: string;
  baseUrl: string;
  classCode: number;
  competitionLicenseNumber: number;
  countryId: number | null;
  date: string;
  isEuroEvent?: boolean;
  memberNumber: number;
}) {
  const eligibilityUrl = new URL(`${input.baseUrl}/api/private/third-party/tools/events/eligibility-calculator`);

  eligibilityUrl.searchParams.set("class-code", String(input.classCode));
  eligibilityUrl.searchParams.set("competition-license-number", String(input.competitionLicenseNumber));
  eligibilityUrl.searchParams.set("date", input.date);
  eligibilityUrl.searchParams.set("member-number", String(input.memberNumber));

  if (input.countryId !== null) {
    eligibilityUrl.searchParams.set("country-id", String(input.countryId));
  }

  if (input.isEuroEvent !== undefined) {
    eligibilityUrl.searchParams.set("is-euro-event", String(Boolean(input.isEuroEvent)));
  }

  const nrhaResponse = await fetch(eligibilityUrl, {
    headers: {
      Accept: "application/json",
      Access: input.apiKey,
    },
  });
  const payload = await responsePayload(nrhaResponse);

  if (!nrhaResponse.ok) {
    throw new Error(`NRHA returned status ${nrhaResponse.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload).slice(0, 240)}`);
  }

  return payload as NrhaEligibilityResponse;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const apiKey = Deno.env.get("NRHA_API_KEY") ?? "";

  if (!apiKey) {
    return jsonResponse({ error: "NRHA_API_KEY is not configured." }, 500);
  }

  let body: NrhaEligibilityProfileRequest;

  try {
    body = (await request.json()) as NrhaEligibilityProfileRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  let competitionLicenseNumber: number;
  let date: string;
  let memberNumber: number;
  let countryId: number | null;
  let horseBirthYear: number | null;
  let horseDateOfBirth: string | null;
  let riderBirthYear: number | null;
  let riderDateOfBirth: string | null;

  try {
    competitionLicenseNumber = numericParam(body.competitionLicenseNumber, "competitionLicenseNumber");
    memberNumber = numericParam(body.memberNumber, "memberNumber");
    date = dateParam(body.date);
    countryId = optionalNumericParam(body.countryId, "countryId");
    horseBirthYear = optionalBirthYearParam(body.horseBirthYear, "horseBirthYear");
    horseDateOfBirth = optionalDateParam(body.horseDateOfBirth, "horseDateOfBirth");
    riderBirthYear = optionalBirthYearParam(body.riderBirthYear, "riderBirthYear");
    riderDateOfBirth = optionalDateParam(body.riderDateOfBirth, "riderDateOfBirth");
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid eligibility profile parameters." }, 400);
  }

  const classCodes = Array.isArray(body.classCodes)
    ? body.classCodes
        .map((code) => optionalNumericParam(code, "classCode"))
        .filter((code): code is number => typeof code === "number")
    : null;
  const maxTests = Math.min(Math.max(Number(body.maxTests ?? strategicTests.length), 1), strategicTests.length);
  const baseUrl = (Deno.env.get("NRHA_API_BASE_URL") ?? "https://data.nrha.com").replace(/\/+$/, "");
  const horseAge = buildHorseAgeSnapshot({ birthYear: horseBirthYear, dateOfBirth: horseDateOfBirth, showDate: date });
  const riderAge = buildRiderAgeSnapshot({ birthYear: riderBirthYear, dateOfBirth: riderDateOfBirth, showDate: date });
  const questions = initialQuestions();
  const profile = initialProfile({ horseAge, riderAge });
  const tests: TestResult[] = [];
  const orderedTests = availableStrategicTests(classCodes);

  for (const definition of orderedTests) {
    if (tests.length >= maxTests) {
      break;
    }

    if (!body.continueAfterGlobalBlock && profile.globalBlocks.length) {
      break;
    }

    if (!shouldRunTest(definition, questions, body.continueAfterGlobalBlock ? initialProfile({ horseAge, riderAge }) : profile)) {
      continue;
    }

    try {
      const payload = await fetchEligibility({
        apiKey,
        baseUrl,
        classCode: definition.classCode,
        competitionLicenseNumber,
        countryId,
        date,
        isEuroEvent: body.isEuroEvent,
        memberNumber,
      });
      const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
      const signals = reasons.flatMap((reason) => classifyReason(reason, definition.classCode));
      const eligible = Boolean(payload.eligible);
      const result: TestResult = {
        classCode: definition.classCode,
        className: definition.className,
        eligible,
        id: definition.id,
        payload,
        reasons,
        signals,
        status: eligible ? "eligible" : "ineligible",
      };

      tests.push(result);
      applyTestResult(definition, result, profile, questions, {
        continueAfterGlobalBlock: Boolean(body.continueAfterGlobalBlock),
      });
    } catch (error) {
      tests.push({
        classCode: definition.classCode,
        className: definition.className,
        eligible: null,
        id: definition.id,
        reasons: [
          {
            message: error instanceof Error ? error.message : "Unknown NRHA eligibility request error.",
          },
        ],
        signals: [],
        status: "error",
      });
    }
  }

  const answeredQuestions = questions.filter((question) => question.status === "answered").length;
  const blockedQuestions = questions.filter((question) => question.status === "blocked").length;
  const status = profile.globalBlocks.length ? "blocked" : answeredQuestions === questions.length ? "complete" : "partial";

  return jsonResponse({
    status,
    checkedAt: new Date().toISOString(),
    input: {
      classCodes,
      competitionLicenseNumber,
      countryId,
      date,
      horseBirthYear,
      horseDateOfBirth,
      isEuroEvent: body.isEuroEvent ?? false,
      memberNumber,
      riderBirthYear,
      riderDateOfBirth,
    },
    summary: {
      answeredQuestions,
      blockedQuestions,
      testedClassCount: tests.length,
      unfilledQuestions: questions.filter((question) => question.status === "unknown").map((question) => question.id),
    },
    profile,
    questions,
    tests,
  });
});
