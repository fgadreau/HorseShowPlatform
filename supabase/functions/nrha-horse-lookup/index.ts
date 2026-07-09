const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NrhaHorseLookupRequest = {
  dateOfBirth?: string;
  licenseNumber?: number | string;
  name?: string;
  ownerName?: string;
};

type NrhaHorseRecord = {
  city?: string;
  country?: string;
  currentLease?: boolean;
  damName?: string;
  foalDate?: string;
  horseName?: string;
  leaseEndDate?: string;
  leaseStartDate?: string;
  leassee?: string;
  licenseNumber?: number;
  ownerEndDate?: string;
  ownerMemberNumber?: number;
  ownerName?: string;
  ownerStartDate?: string;
  sex?: string;
  sireName?: string;
  state?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function licenseParam(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/\D/g, ""));

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error("licenseNumber must be a positive integer.");
  }

  return numberValue;
}

function nameParam(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("name is required.");
  }

  return value.trim();
}

function dateParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("dateOfBirth must use YYYY-MM-DD format.");
  }

  return value;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDate(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";

  if (!cleanValue) {
    return "";
  }

  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const usMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  }

  return cleanValue;
}

async function responsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function lookupNameCandidates(name: string) {
  const compactName = name.replace(/\s+/g, " ").trim();
  const plainName = compactName.replace(/[^a-zA-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

  return Array.from(
    new Set(
      [
        name,
        compactName,
        compactName.toUpperCase(),
        plainName,
        plainName.toUpperCase(),
      ].filter((candidate): candidate is string => Boolean(candidate)),
    ),
  );
}

async function fetchNrhaHorse(lookupUrl: URL, apiKey: string, licenseNumber: number, searchName: string) {
  const response = await fetch(lookupUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Access: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      licenseNumber,
      name: searchName,
    }),
  });

  return {
    payload: await responsePayload(response),
    response,
    searchName,
  };
}

async function lookupNrhaHorse(lookupUrl: URL, apiKey: string, licenseNumber: number, name: string) {
  let latestAttempt: Awaited<ReturnType<typeof fetchNrhaHorse>> | null = null;

  for (const searchName of lookupNameCandidates(name)) {
    const attempt = await fetchNrhaHorse(lookupUrl, apiKey, licenseNumber, searchName);
    latestAttempt = attempt;

    if (attempt.response.ok || attempt.response.status !== 404) {
      return attempt;
    }
  }

  return latestAttempt;
}

function horseRecordsFromPayload(payload: unknown): NrhaHorseRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((record): record is NrhaHorseRecord => Boolean(record) && typeof record === "object");
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { horses?: unknown }).horses)) {
    return (payload as { horses: unknown[] }).horses.filter((record): record is NrhaHorseRecord => Boolean(record) && typeof record === "object");
  }

  if (payload && typeof payload === "object") {
    return [payload as NrhaHorseRecord];
  }

  return [];
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

  let body: NrhaHorseLookupRequest;

  try {
    body = (await request.json()) as NrhaHorseLookupRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  let licenseNumber: number;
  let name: string;
  let dateOfBirth = "";
  let ownerName = "";
  const wantsIdentityValidation = Boolean(body.dateOfBirth || body.ownerName);

  try {
    licenseNumber = licenseParam(body.licenseNumber);
    name = nameParam(body.name);

    if (wantsIdentityValidation) {
      dateOfBirth = dateParam(body.dateOfBirth);
      ownerName = nameParam(body.ownerName);
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid horse lookup parameters." }, 400);
  }

  const baseUrl = (Deno.env.get("NRHA_API_BASE_URL") ?? "https://data.nrha.com").replace(/\/+$/, "");
  const horseLookupPath = Deno.env.get("NRHA_HORSE_LOOKUP_PATH") ?? "/api/private/third-party/tools/horse";
  const lookupUrl = new URL(`${baseUrl}${horseLookupPath.startsWith("/") ? horseLookupPath : `/${horseLookupPath}`}`);
  const attemptedNames = lookupNameCandidates(name);
  let lookupAttempt: Awaited<ReturnType<typeof lookupNrhaHorse>>;

  try {
    lookupAttempt = await lookupNrhaHorse(lookupUrl, apiKey, licenseNumber, name);
  } catch (error) {
    return jsonResponse(
      {
        error: `NRHA horse lookup request failed: ${error instanceof Error ? error.message : "Unknown network error."}`,
        attempted_names: attemptedNames,
      },
      502,
    );
  }

  if (!lookupAttempt) {
    return jsonResponse({ error: "NRHA horse lookup did not run." }, 500);
  }

  const nrhaResponse = lookupAttempt.response;
  const payload = lookupAttempt.payload;

  if (!nrhaResponse.ok) {
    if (nrhaResponse.status === 404) {
      return jsonResponse({
        status: "not_found",
        matched: false,
        checks: {
          dateOfBirth: {
            input: dateOfBirth,
            matched: false,
            official: null,
          },
          name: {
            input: name,
            matched: false,
            official: null,
          },
          ownerName: {
            input: ownerName,
            matched: false,
            official: null,
          },
        },
        licenseNumber,
        inputDateOfBirth: dateOfBirth || null,
        inputName: name,
        inputOwnerName: ownerName || null,
        officialFoalDate: null,
        officialHorseName: null,
        officialOwnerName: null,
        horse: null,
        nrha_status: nrhaResponse.status,
        attemptedNames,
        payload,
      });
    }

    return jsonResponse(
      {
        error: `NRHA horse lookup returned status ${nrhaResponse.status}.`,
        nrha_status: nrhaResponse.status,
        attempted_names: attemptedNames,
        payload,
      },
      502,
    );
  }

  const records = horseRecordsFromPayload(payload);
  const exactLicenseRecord = records.find((record) => Number(record.licenseNumber) === licenseNumber) ?? null;
  const horse = exactLicenseRecord ?? (records.length === 1 ? records[0] : null);
  const officialHorseName = horse?.horseName?.trim() ?? "";
  const officialFoalDate = normalizeDate(horse?.foalDate);
  const officialOwnerName = horse?.ownerName?.trim() ?? "";
  const checks = {
    dateOfBirth: {
      input: dateOfBirth,
      matched: Boolean(horse && officialFoalDate && officialFoalDate === normalizeDate(dateOfBirth)),
      official: officialFoalDate || null,
    },
    name: {
      input: name,
      matched: Boolean(horse && officialHorseName && normalizeText(officialHorseName) === normalizeText(name)),
      official: officialHorseName || null,
    },
    ownerName: {
      input: ownerName,
      matched: Boolean(horse && officialOwnerName && normalizeText(officialOwnerName) === normalizeText(ownerName)),
      official: officialOwnerName || null,
    },
  };
  const matched = Boolean(
    horse &&
      checks.name.matched &&
      (!wantsIdentityValidation || (checks.dateOfBirth.matched && checks.ownerName.matched)),
  );
  const status = horse ? (wantsIdentityValidation ? (matched ? "verified" : "mismatch") : "found") : "not_found";

  return jsonResponse({
    status,
    matched,
    checks,
    licenseNumber,
    inputDateOfBirth: dateOfBirth,
    inputName: name,
    inputOwnerName: ownerName,
    officialFoalDate: officialFoalDate || null,
    officialHorseName: officialHorseName || null,
    officialOwnerName: officialOwnerName || null,
    horse,
    lookupName: lookupAttempt.searchName,
    attemptedNames,
    payload,
  });
});
