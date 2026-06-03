const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GvlEiaResponse = {
  id?: number;
  type?: string;
  serialNumber?: string;
  animal?: {
    id?: number;
    name?: string;
    dob?: string;
    registeredName?: {
      name?: string;
    };
  };
  metadata?: {
    status?: string;
    voidedBy?: string | null;
    voidReason?: string | null;
    voidDate?: string | null;
  };
  test?: {
    sampledDate?: string;
    result?: string;
    type?: string;
    accession?: string;
    gvlId?: string;
    lab?: string;
  };
  effectiveDate?: string;
  signingTimestamp?: string;
  lastUpdated?: string;
};

type VerifyRequest = {
  url?: string;
  uuid?: string;
  horseName?: string;
  horseDateOfBirth?: string | null;
  horseBirthYear?: number | null;
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

function parseGvlCertificateId(value: string | undefined) {
  const rawValue = value?.trim();

  if (!rawValue) {
    return null;
  }

  const uuidMatch = rawValue.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuidMatch?.[0].toLowerCase() ?? null;
}

function normalizeName(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function firstDate(...values: Array<string | undefined>) {
  const value = values.find(Boolean);
  return value ? value.slice(0, 10) : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: VerifyRequest;

  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const certificateId = parseGvlCertificateId(body.url || body.uuid);

  if (!certificateId) {
    return jsonResponse({ error: "Lien GVL invalide." }, 400);
  }

  const gvlResponse = await fetch(`https://gvlcertcheck.ai/api/check/${certificateId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HorseShowPlatform/1.0",
    },
  });

  if (!gvlResponse.ok) {
    return jsonResponse({ error: `GVL a retourne le statut ${gvlResponse.status}.` }, 502);
  }

  const payload = (await gvlResponse.json()) as GvlEiaResponse;
  const warnings: string[] = [];
  const horseName = payload.animal?.registeredName?.name || payload.animal?.name || null;
  const horseDateOfBirth = firstDate(payload.animal?.dob);
  const submittedHorseName = body.horseName?.trim();
  const submittedHorseDateOfBirth = firstDate(body.horseDateOfBirth ?? undefined);
  const namesMatch = !submittedHorseName || normalizeName(submittedHorseName) === normalizeName(horseName ?? undefined);
  const dateOfBirthMatches = !submittedHorseDateOfBirth || submittedHorseDateOfBirth === horseDateOfBirth;
  const birthYearMatches = Boolean(submittedHorseDateOfBirth) || !body.horseBirthYear || horseDateOfBirth?.slice(0, 4) === String(body.horseBirthYear);
  const isSigned = payload.metadata?.status === "SIGNED";
  const isVoided = Boolean(payload.metadata?.voidedBy || payload.metadata?.voidReason || payload.metadata?.voidDate);
  const isEia = payload.type === "EIA";
  const isNegative = payload.test?.result === "Negative";

  if (!isEia) {
    warnings.push("NOT_EIA_DOCUMENT");
  }

  if (!isSigned) {
    warnings.push("NOT_SIGNED");
  }

  if (isVoided) {
    warnings.push("VOIDED");
  }

  if (!isNegative) {
    warnings.push("NOT_NEGATIVE");
  }

  if (!namesMatch) {
    warnings.push("HORSE_NAME_MISMATCH");
  }

  if (!dateOfBirthMatches) {
    warnings.push("HORSE_DOB_MISMATCH");
  }

  if (!birthYearMatches) {
    warnings.push("HORSE_BIRTH_YEAR_MISMATCH");
  }

  const verified = isEia && isSigned && !isVoided && isNegative && namesMatch && dateOfBirthMatches && birthYearMatches;

  return jsonResponse({
    status: verified ? "verified" : "pending_review",
    source_url: `https://gvlcertcheck.ai/check/${certificateId}`,
    certificate_number: payload.serialNumber ?? (payload.id ? `EIA-${payload.id}` : null),
    issuer_name: payload.test?.lab ?? "GlobalVetLink",
    test_or_administered_on: firstDate(payload.test?.sampledDate, payload.effectiveDate),
    result: payload.test?.result ?? null,
    horse_name: horseName,
    horse_date_of_birth: horseDateOfBirth,
    horse_external_id: payload.test?.gvlId ?? (payload.animal?.id ? String(payload.animal.id) : null),
    verification_source: "gvl_url",
    verified_at: verified ? new Date().toISOString() : null,
    warnings,
    payload,
  });
});
