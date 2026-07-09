const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NrhaEligibilityRequest = {
  classCode?: number;
  competitionLicenseNumber?: number;
  countryId?: number | null;
  date?: string;
  isEuroEvent?: boolean;
  memberNumber?: number;
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
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return numberValue;
}

function dateParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("date must use YYYY-MM-DD format.");
  }

  return value;
}

async function responsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
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

  let body: NrhaEligibilityRequest;

  try {
    body = (await request.json()) as NrhaEligibilityRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  let classCode: number;
  let competitionLicenseNumber: number;
  let memberNumber: number;
  let date: string;
  let countryId: number | null = null;

  try {
    classCode = numericParam(body.classCode, "classCode");
    competitionLicenseNumber = numericParam(body.competitionLicenseNumber, "competitionLicenseNumber");
    memberNumber = numericParam(body.memberNumber, "memberNumber");
    date = dateParam(body.date);

    if (body.countryId !== undefined && body.countryId !== null) {
      countryId = numericParam(body.countryId, "countryId");
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid eligibility parameters." }, 400);
  }

  const baseUrl = (Deno.env.get("NRHA_API_BASE_URL") ?? "https://data.nrha.com").replace(/\/+$/, "");
  const eligibilityUrl = new URL(`${baseUrl}/api/private/third-party/tools/events/eligibility-calculator`);

  eligibilityUrl.searchParams.set("class-code", String(classCode));
  eligibilityUrl.searchParams.set("competition-license-number", String(competitionLicenseNumber));
  eligibilityUrl.searchParams.set("date", date);
  eligibilityUrl.searchParams.set("member-number", String(memberNumber));

  if (countryId !== null) {
    eligibilityUrl.searchParams.set("country-id", String(countryId));
  }

  if (body.isEuroEvent !== undefined) {
    eligibilityUrl.searchParams.set("is-euro-event", String(Boolean(body.isEuroEvent)));
  }

  const nrhaResponse = await fetch(eligibilityUrl, {
    headers: {
      Accept: "application/json",
      Access: apiKey,
    },
  });

  const payload = await responsePayload(nrhaResponse);

  if (!nrhaResponse.ok) {
    return jsonResponse(
      {
        error: `NRHA returned status ${nrhaResponse.status}.`,
        nrha_status: nrhaResponse.status,
        payload,
      },
      502,
    );
  }

  const nrhaPayload = payload as NrhaEligibilityResponse;
  const eligible = Boolean(nrhaPayload.eligible);

  return jsonResponse({
    status: eligible ? "eligible" : "ineligible",
    eligible,
    parameters: nrhaPayload.parameters ?? null,
    reasons: Array.isArray(nrhaPayload.reasons) ? nrhaPayload.reasons : [],
    payload: nrhaPayload,
  });
});
