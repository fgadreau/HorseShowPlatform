import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "noreply@showscore.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, associationName, invitationUrl, role, locale } = await req.json();

    if (!email || !invitationUrl) {
      return new Response(
        JSON.stringify({ error: "email et invitationUrl sont requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isFr = !locale || locale.startsWith("fr");
    const resolvedName = associationName || "une association";
    const resolvedRole = role || "member";

    const subject = isFr
      ? `Invitation à rejoindre ${resolvedName} sur ShowScore`
      : `Invitation to join ${resolvedName} on ShowScore`;

    const html = isFr
      ? `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin-top:0">Tu as été invité à rejoindre <strong>${resolvedName}</strong></h2>
          <p>Tu as reçu une invitation pour accéder à l'association <strong>${resolvedName}</strong> sur ShowScore en tant que <strong>${resolvedRole}</strong>.</p>
          <p>Clique sur le bouton ci-dessous pour créer ton compte ou te connecter :</p>
          <a href="${invitationUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin:16px 0">
            Accepter l'invitation
          </a>
          <p style="color:#6b7280;font-size:13px;margin-top:24px">
            Si tu n'attendais pas cette invitation, tu peux ignorer ce courriel.<br>
            Lien alternatif : <a href="${invitationUrl}">${invitationUrl}</a>
          </p>
        </div>`
      : `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin-top:0">You've been invited to join <strong>${resolvedName}</strong></h2>
          <p>You received an invitation to access <strong>${resolvedName}</strong> on ShowScore as <strong>${resolvedRole}</strong>.</p>
          <p>Click the button below to create your account or sign in:</p>
          <a href="${invitationUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin:16px 0">
            Accept invitation
          </a>
          <p style="color:#6b7280;font-size:13px;margin-top:24px">
            If you weren't expecting this invitation, you can ignore this email.<br>
            Alternative link: <a href="${invitationUrl}">${invitationUrl}</a>
          </p>
        </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(
        JSON.stringify({ error: data?.message || "Erreur envoi email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-invitation-email error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
