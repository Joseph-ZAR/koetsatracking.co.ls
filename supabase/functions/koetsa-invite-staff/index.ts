// Koetsa staff account creation and safe re-registration.
// The existing function name is retained so the current portal endpoint keeps working.
// No invitation email is sent. New/recovered accounts are active immediately and
// must change the generated temporary password at first sign-in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set([
  "general_manager", "sales_manager", "sales_consultant",
  "office_administrator", "technical_manager", "installer", "finance_officer",
  "super_admin",
]);

function makeTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*-_";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const chars = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
    ...Array.from(bytes.slice(4), b => all[b % all.length]),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[(i + 4) % bytes.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function findAuthUserByEmail(admin: any, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error("Could not check existing login accounts: " + error.message);
    const match = data.users.find((u: { email?: string }) => (u.email || "").toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  throw new Error("Could not safely verify whether this email already has an account. Contact the administrator.");
}

Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  let publishableKeys: Record<string, string> = {};
  let secretKeys: Record<string, string> = {};
  try {
    publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  } catch {
    return respond({ error: "Supabase key settings are not valid JSON. Check the Edge Function secrets." }, 500);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: "Staff account service is not configured. Check SUPABASE_URL, the publishable/anon key and the service-role secret." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond({ error: "Sign in before creating an employee account." }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: "Your session is invalid or expired. Sign in again." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: callerError } = await admin
    .from("profiles").select("role,is_active").eq("id", authData.user.id).single();
  if (callerError || !caller?.is_active || !["super_admin", "general_manager"].includes(caller.role)) {
    return respond({ error: "Only an active Super Admin or General Manager can create employee accounts." }, 403);
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
    return respond({ error: "Employment start date must use YYYY-MM-DD." }, 400);
  }

  const temporaryPassword = makeTemporaryPassword();
  let authUser: { id: string; email?: string } | null = null;
  let recoveredExistingAccount = false;

  try {
    const existing = await findAuthUserByEmail(admin, email);
    if (existing) {
      const { data: existingProfile, error: existingProfileError } = await admin
        .from("profiles").select("id,is_active,role").eq("id", existing.id).maybeSingle();
      if (existingProfileError) {
        return respond({ error: "The login exists, but its staff profile could not be checked. No changes were made. " + existingProfileError.message }, 500);
      }
      if (existingProfile?.is_active) {
        return respond({ error: "This email already belongs to an active Koetsa account. Use a different email, or suspend/delete the existing employee account first." }, 409);
      }
      const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata || {}), full_name: fullName },
      });
      if (updateError || !updated.user) {
        return respond({ error: "An account with this email still exists in Supabase Auth, but it could not be reactivated. " + (updateError?.message || "Unknown Auth error" ) }, 409);
      }
      authUser = { id: updated.user.id, email: updated.user.email || email };
      recoveredExistingAccount = true;
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) {
        const duplicate = /already|registered|exists/i.test(createError?.message || "");
        return respond({ error: duplicate
          ? "Supabase still recognises this email as registered, although the account was not found in the user list. Check Authentication → Users for this email and permanently delete the remaining Auth entry, then retry."
          : (createError?.message || "Employee account could not be created.") }, duplicate ? 409 : 400);
      }
      authUser = { id: created.user.id, email: created.user.email || email };
    }
  } catch (err) {
    return respond({ error: err instanceof Error ? err.message : "Could not check or create the employee login." }, 500);
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authUser.id,
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
    if (!recoveredExistingAccount) await admin.auth.admin.deleteUser(authUser.id);
    return respond({ error: "The login was prepared, but the staff profile could not be saved. " + profileError.message + (profileError.message.includes("must_change_password") ? " Apply migration 003_staff_temporary_password_onboarding.sql in the Supabase SQL Editor, then retry." : "" ) }, 500);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: authData.user.id,
    table_name: "profiles",
    record_id: authUser.id,
    action: recoveredExistingAccount ? "REREGISTER_STAFF" : "CREATE_STAFF",
    changed_fields: ["email", "full_name", "phone", "department", "job_title", "employment_start_date", "role", "is_active", "must_change_password"],
  });

  return respond({
    success: true,
    email,
    temporary_password: temporaryPassword,
    is_active: true,
    must_change_password: true,
    recovered_existing_account: recoveredExistingAccount,
    audit_warning: auditError ? "The account was created, but the audit event could not be saved: " + auditError.message : undefined,
    message: recoveredExistingAccount
      ? "The existing inactive login was re-registered, activated and given a new temporary password."
      : "Employee account created and activated. The employee must change the temporary password at first sign-in.",
  });
});
