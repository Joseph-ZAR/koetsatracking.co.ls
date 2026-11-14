// Permanently delete a Koetsa employee's Supabase Auth account.
// Only an active Super Admin may call this function.
// Deploy: supabase functions deploy koetsa-delete-staff
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const anonKey = publishableKeys.default;
  const serviceKey = secretKeys.default;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: "Staff administration service is not configured." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond({ error: "Sign in before deleting an employee." }, 401);

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
  if (callerError || !caller?.is_active || caller.role !== "super_admin") {
    return respond({ error: "Only an active Super Admin can delete employee accounts." }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return respond({ error: "Invalid request body." }, 400); }
  const targetId = String(body.user_id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
    return respond({ error: "A valid employee account ID is required." }, 400);
  }
  if (targetId === authData.user.id) return respond({ error: "You cannot delete your own Super Admin account." }, 400);

  const { data: target, error: targetError } = await admin
    .from("profiles").select("id,full_name,email,role,is_active").eq("id", targetId).single();
  if (targetError || !target) return respond({ error: "Employee account was not found." }, 404);

  if (target.role === "super_admin" && target.is_active) {
    const { count, error: countError } = await admin.from("profiles")
      .select("id", { count: "exact", head: true }).eq("role", "super_admin").eq("is_active", true);
    if (countError) return respond({ error: "Could not verify the remaining Super Admin accounts." }, 500);
    if ((count || 0) <= 1) return respond({ error: "The last active Super Admin account cannot be deleted. Create or activate another Super Admin first." }, 400);
  }

  // Preserve operational history while removing references to the departing employee.
  const detachments = await Promise.all([
    admin.from("leads").update({ created_by: null }).eq("created_by", targetId),
    admin.from("leads").update({ assigned_to: null }).eq("assigned_to", targetId),
    admin.from("installations").update({ installed_by: null }).eq("installed_by", targetId),
    admin.from("payments").update({ recorded_by: null }).eq("recorded_by", targetId),
  ]);
  const failedDetachment = detachments.find((result) => result.error);
  if (failedDetachment?.error) {
    return respond({ error: "The employee's linked work records could not be safely detached. No account was deleted. " + failedDetachment.error.message }, 500);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: authData.user.id,
    table_name: "profiles",
    record_id: targetId,
    action: "DELETE_STAFF_ACCOUNT",
    changed_fields: ["auth_user", "profile", "staff_assignments"],
  });
  if (auditError) return respond({ error: "Could not record the deletion in the audit log. No account was deleted. " + auditError.message }, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
  if (deleteError) return respond({ error: "The employee's linked records were detached, but the login account could not be deleted. " + deleteError.message }, 500);

  return respond({ success: true, message: "Employee account permanently deleted. Operational records were retained." });
});
