import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, rejectDisallowedOrigin } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-USAGE] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req, "POST, GET, OPTIONS");
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) {
    return originRejection;
  }

  try {
    logStep("Function started");

    // Verify authentication
    const auth = await requireUser(req);
    if ("error" in auth) {
      return new Response(JSON.stringify({ error: auth.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: auth.status,
      });
    }
    const clerkUserId = auth.userId;
    logStep("User authenticated", { clerkUserId });

    // Create Supabase client with service role
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get subscription info - only for the authenticated user
    const { data: subscription, error: subError } = await supabaseService
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("clerk_user_id", clerkUserId)
      .single();

    // If subscription doesn't exist, return default values instead of auto-creating
    if (subError && subError.code === 'PGRST116') { // No rows returned
      logStep("Subscription not found, returning default values");
      
      const result = {
        plan: "free",
        status: "active",
        minutesUsed: 0,
        minutesQuota: 30,
        minutesRemaining: 30,
        shortsUsed: 0,
        shortsQuota: 100,
        shortsRemaining: 100,
        periodEnd: null,
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (subError) {
      throw new Error(`Database error: ${subError.message}`);
    }

    // Get usage info - only for the authenticated user
    const { data: usage, error: usageError } = await supabaseService
      .from("usage")
      .select("*")
      .eq("clerk_user_id", clerkUserId)
      .single();

    let usageData = usage;
    if (usageError && usageError.code === 'PGRST116') { // No rows returned
      logStep("Usage not found, returning default values");
      
      // Return default usage instead of auto-creating
      usageData = {
        minutes_quota: 30,
        minutes_used: 0,
        shorts_quota: 100,
        shorts_used: 0,
        period_end: null,
      };
    } else if (usageError) {
      throw new Error(`Database error: ${usageError.message}`);
    }

    const plan = subscription?.plan || "free";
    const status = subscription?.status || "active";
    const minutesRemaining = Math.max(0, (usageData?.minutes_quota || 30) - (usageData?.minutes_used || 0));
    const shortsRemaining = Math.max(0, (usageData?.shorts_quota || 100) - (usageData?.shorts_used || 0));

    const result = {
      plan,
      status,
      minutesUsed: usageData?.minutes_used || 0,
      minutesQuota: usageData?.minutes_quota || 30,
      minutesRemaining,
      shortsUsed: usageData?.shorts_used || 0,
      shortsQuota: usageData?.shorts_quota || 100,
      shortsRemaining,
      periodEnd: usageData?.period_end || subscription?.current_period_end,
    };

    logStep("Usage data retrieved", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in get-usage", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
