// Supabase Edge Function: staff account creation (legacy endpoint name retained to avoid
// changing the portal URL). No invitation emails or invitation links are sent.
// Deploy with: supabase functions deploy koetsa-invite-staff
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const allowedRoles = new Set([
  "general_manager", "sales_manager", "sales_consultant",
  "office_administrator", "technical_manager", "installer",
  "finance_officer", "super_admin",
]);
function makeTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*-_";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const chars = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
    ...Array.from(bytes.slice(4), b => all[b % all.length]),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i % bytes.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  let publishableKeys: Record<string, string> = {};
  let secretKeys: Record<string, string> = {};
  try {
    publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  } catch {
    return respond({ error: "Supabase keys are not configured correctly." }, 500);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKeys.default;
  const serviceKey = secretKeys.default;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: "Staff account service is not configured." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond({ error: "Sign in before creating an employee account." }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: "Your session is invalid or expired." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: callerError } = await admin
    .from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (callerError || !caller?.is_active || !["super_admin", "general_manager"].includes(caller.role)) {
    return respond({ error: "Only the Super Admin or General Manager can create employee accounts." }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return respond({ error: "Invalid request body." }, 400); }
  const fullName = String(body.full_name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const department = String(body.department || "").trim().slice(0, 80);
  const jobTitle = String(body.job_title || "").trim().slice(0, 100);
  const startDate = body.employment_start_date ? String(body.employment_start_date) : null;
  const role = String(body.role || "sales_consultant");
  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !department || !jobTitle) {
    return respond({ error: "Enter a valid name, email, department and job title." }, 400);
  }
  if (!allowedRoles.has(role)) return respond({ error: "Select a valid staff role." }, 400);
  if (caller.role === "general_manager" && role === "super_admin") {
    return respond({ error: "Only a Super Admin can create another Super Admin." }, 403);
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return respond({ error: "Employment start date must be a valid date." }, 400);
  }

  const temporaryPassword = makeTemporaryPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return respond({ error: createError?.message || "Employee account could not be created." }, 400);
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    email,
    phone: phone || null,
    department,
    job_title: jobTitle,
    employment_start_date: startDate,
    role,
    is_active: true,
    must_change_password: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return respond({ error: "The account could not be completed; the incomplete account was removed. " + profileError.message }, 500);
  }

  await admin.from("audit_logs").insert({
    actor_id: authData.user.id,
    table_name: "profiles",
    record_id: created.user.id,
    action: "CREATE",
    changed_fields: ["email", "full_name", "phone", "department", "job_title", "employment_start_date", "role", "is_active", "must_change_password"],
  });

  // This is the only response containing the temporary password. It is never stored or logged.
  return respond({
    success: true,
    email,
    temporary_password: temporaryPassword,
    is_active: true,
    must_change_password: true,
    message: "Employee account created and activated. The employee must change the temporary password at first sign-in.",
  });
});
