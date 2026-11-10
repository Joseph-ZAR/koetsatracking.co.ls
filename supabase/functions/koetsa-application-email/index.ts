// Supabase Edge Function: koetsa-application-email
// Required Supabase secrets: RESEND_API_KEY, KOETSA_EMAIL_FROM
// KOETSA_EMAIL_FROM must be an address on a domain verified with Resend.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("KOETSA_EMAIL_FROM");
  if (!resendKey || !from) return json({ success: false, error: "Email service is not configured." }, 503);

  try {
    const body = await req.json();
    const ref = String(body.applicationRef ?? "").trim();
    const a = body.applicant ?? {};
    const name = String(a.name ?? "").trim();
    const email = String(a.email ?? "").trim();
    const phone = String(a.phone ?? "").trim();
    if (!/^KTS-[0-9]{4}-[0-9]{6}$/.test(ref) || !name || !email || !phone || email.length > 160) {
      return json({ success: false, error: "Application details are incomplete or invalid." }, 400);
    }

    const fields: [string, unknown][] = [
      ["Application reference", ref], ["Applicant", name], ["Phone / WhatsApp", phone],
      ["Email", email], ["Town / address", a.address], ["Package", body.packageName],
      ["Payment option", body.paymentLabel], ["Once-off amount", `M${body.setupAmount ?? 0}`],
      ["Monthly amount", `M${body.monthlyAmount ?? 0}`], ["Total", `M${body.totalAmount ?? 0}`],
      ["Number of vehicles", a.vehicleCount], ["Vehicle details", a.vehicle], ["VIN / chassis", a.vin],
      ["Installation location", a.location], ["Preferred installation date", a.date], ["Additional notes", a.notes],
    ];
    const rows = fields.map(([label, value]) => `<tr><th align="left" style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</th><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(value || "Not provided")}</td></tr>`).join("");
    const internalHtml = `<div style="font-family:Arial,sans-serif;color:#172033"><h2>New Koetsa website application</h2><p>A new customer application has been submitted through the Koetsa website.</p><p><strong>Reference: ${escapeHtml(ref)}</strong></p><table style="border-collapse:collapse;width:100%">${rows}</table></div>`;
    const applicantHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:640px"><h2 style="color:#bd202e">Thank you for applying to Koetsa Tracking Systems</h2><p>Dear ${escapeHtml(name)},</p><p>We confirm that we have received your application successfully.</p><p>Your application reference is <strong>${escapeHtml(ref)}</strong>.</p><p>A Koetsa consultant will be in touch with you <strong>no later than 24 hours</strong> to provide further assistance, discuss your requirements and guide you through the next steps.</p><p>Thank you for considering Koetsa Tracking Systems. We look forward to helping you secure your journey and protect your assets.</p><p>Kind regards,<br><strong>Koetsa Tracking Systems (Pty) Ltd</strong><br>+266 5343 0023<br>info@koetsatracking.co.ls</p></div>`;

    const send = async (to: string, subject: string, html: string, replyTo?: string) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Email provider error (${response.status}): ${JSON.stringify(result)}`);
      return result;
    };

    // Send the internal notification and customer acknowledgement.
    const [internal, acknowledgement] = await Promise.all([
      send("rangoajanepatrick@gmail.com", `New Koetsa application — ${ref}`, internalHtml, email),
      send(email, `Koetsa application received — ${ref}`, applicantHtml),
    ]);
    return json({ success: true, applicationRef: ref, internalEmailId: internal.id, acknowledgementEmailId: acknowledgement.id });
  } catch (error) {
    console.error("koetsa-application-email error:", error);
    return json({ success: false, error: "The application was saved, but email notifications could not be completed." }, 502);
  }
});
