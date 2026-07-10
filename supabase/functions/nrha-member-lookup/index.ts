const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NrhaMemberLookupRequest = {
  emailAddress?: string;
  firstName?: string;
  fullName?: string;
  lastName?: string;
  memberNumber?: number | string;
};

type NrhaMemberRecord = {
  city?: string;
  country?: string;
  emailAddress?: string;
  firstName?: string;
  fullName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  memberExpirationDate?: string;
  memberNumber?: number;
  phoneNumber?: string;
  state?: string;
  zip?: string;
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

function numericParam(value: unknown, label: string) {
  const numberValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/\D/g, ""));

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return numberValue;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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

function memberRecordsFromPayload(payload: unknown): NrhaMemberRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((record): record is NrhaMemberRecord => Boolean(record) && typeof record === "object");
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { members?: unknown }).members)) {
    return (payload as { members: unknown[] }).members.filter((record): record is NrhaMemberRecord => Boolean(record) && typeof record === "object");
  }

  if (payload && typeof payload === "object") {
    return [payload as NrhaMemberRecord];
  }

  return [];
}

function selectMemberRecord(records: NrhaMemberRecord[], memberNumber: number) {
  return records.find((record) => Number(record.memberNumber) === memberNumber) ?? null;
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

  let body: NrhaMemberLookupRequest;

  try {
    body = (await request.json()) as NrhaMemberLookupRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  let memberNumber: number;

  try {
    memberNumber = numericParam(body.memberNumber, "memberNumber");
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid member lookup parameters." }, 400);
  }

  const inputFirstName = optionalText(body.firstName);
  const inputLastName = optionalText(body.lastName);
  const inputFullName = optionalText(body.fullName) || [inputFirstName, inputLastName].filter(Boolean).join(" ");
  const inputEmailAddress = optionalText(body.emailAddress);
  const wantsIdentityValidation = Boolean(inputFirstName || inputLastName || inputFullName || inputEmailAddress);
  const baseUrl = (Deno.env.get("NRHA_API_BASE_URL") ?? "https://data.nrha.com").replace(/\/+$/, "");
  const memberLookupPath = Deno.env.get("NRHA_MEMBER_LOOKUP_PATH") ?? "/api/private/rs/members";
  const lookupUrl = `${baseUrl}${memberLookupPath.startsWith("/") ? memberLookupPath : `/${memberLookupPath}`}`;

  let nrhaResponse: Response;
  let payload: unknown;

  try {
    nrhaResponse = await fetch(lookupUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Access: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberNumber }),
    });
    payload = await responsePayload(nrhaResponse);
  } catch (error) {
    return jsonResponse(
      { error: `NRHA member lookup request failed: ${error instanceof Error ? error.message : "Unknown network error."}` },
      502,
    );
  }

  if (!nrhaResponse.ok) {
    if (nrhaResponse.status === 404) {
      return jsonResponse({
        status: "not_found",
        matched: false,
        checks: {
          emailAddress: { input: inputEmailAddress, matched: false, official: null },
          firstName: { input: inputFirstName, matched: false, official: null },
          fullName: { input: inputFullName, matched: false, official: null },
          lastName: { input: inputLastName, matched: false, official: null },
        },
        member: null,
        memberNumber,
        nrha_status: nrhaResponse.status,
        payload,
      });
    }

    return jsonResponse(
      {
        error: `NRHA member lookup returned status ${nrhaResponse.status}.`,
        nrha_status: nrhaResponse.status,
        payload,
      },
      502,
    );
  }

  const records = memberRecordsFromPayload(payload);
  const member = selectMemberRecord(records, memberNumber);
  const officialFirstName = member?.firstName?.trim() ?? "";
  const officialLastName = member?.lastName?.trim() ?? "";
  const officialFullName = member?.fullName?.trim() || [officialFirstName, officialLastName].filter(Boolean).join(" ");
  const officialEmailAddress = member?.emailAddress?.trim() ?? "";
  const checks = {
    emailAddress: {
      input: inputEmailAddress,
      matched: !inputEmailAddress || normalizeEmail(officialEmailAddress) === normalizeEmail(inputEmailAddress),
      official: officialEmailAddress || null,
    },
    firstName: {
      input: inputFirstName,
      matched: !inputFirstName || normalizeText(officialFirstName) === normalizeText(inputFirstName),
      official: officialFirstName || null,
    },
    fullName: {
      input: inputFullName,
      matched: !inputFullName || normalizeText(officialFullName) === normalizeText(inputFullName),
      official: officialFullName || null,
    },
    lastName: {
      input: inputLastName,
      matched: !inputLastName || normalizeText(officialLastName) === normalizeText(inputLastName),
      official: officialLastName || null,
    },
  };
  const matched = Boolean(
    member &&
      (!wantsIdentityValidation ||
        checks.firstName.matched &&
          checks.lastName.matched &&
          checks.fullName.matched &&
          checks.emailAddress.matched),
  );
  const status = member ? (wantsIdentityValidation ? (matched ? "verified" : "mismatch") : "found") : "not_found";

  return jsonResponse({
    status,
    matched,
    checks,
    inputEmailAddress,
    inputFirstName,
    inputFullName,
    inputLastName,
    member,
    memberNumber,
    officialEmailAddress: officialEmailAddress || null,
    officialExpirationDate: normalizeDate(member?.memberExpirationDate) || null,
    officialFirstName: officialFirstName || null,
    officialFullName: officialFullName || null,
    officialLastName: officialLastName || null,
    payload,
  });
});
