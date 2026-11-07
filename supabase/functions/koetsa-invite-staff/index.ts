// Supabase Edge Function: koetsa-invite-staff
// Deploy with: supabase functions deploy koetsa-invite-staff
// Required secret: SUPABASE_SERVICE_ROLE_KEY (never place this in browser files).
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const anonKey = publishableKeys.default;
  const serviceKey = secretKeys.default;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: "Staff invitation service is not configured." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond({ error: "Sign in before inviting an employee." }, 401);

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
    return respond({ error: "Only the Super Admin or General Manager can invite employees." }, 403);
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

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (inviteError || !invited.user) {
    return respond({ error: inviteError?.message || "Invitation could not be sent." }, 400);
  }

  // Auth trigger creates the profile with the least-privileged role and inactive status.
  const { error: profileError } = await admin.from("profiles").upsert({
    id: invited.user.id,
    full_name: fullName,
    email,
    phone: phone || null,
    department,
    job_title: jobTitle,
    employment_start_date: startDate,
    role,
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (profileError) {
    // Keep the invited identity inactive; report that the manager should retry profile setup.
    return respond({ error: "The invitation was created, but the staff profile could not be completed. Contact the Super Admin. " + profileError.message }, 500);
  }

  await admin.from("audit_logs").insert({
    actor_id: authData.user.id,
    table_name: "profiles",
    record_id: invited.user.id,
    action: "INVITE",
    changed_fields: ["email", "full_name", "phone", "department", "job_title", "employment_start_date", "role", "is_active"],
  });

  return respond({ success: true, message: "Invitation email sent. The new staff profile is inactive until management activates it." });
});
