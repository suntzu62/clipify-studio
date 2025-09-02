import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-USAGE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { clerkUserId } = await req.json();
    if (!clerkUserId) {
      throw new Error("clerkUserId is required");
    }

    logStep("Request data received", { clerkUserId });

    // Create Supabase client with service role
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get subscription info
    const { data: subscription, error: subError } = await supabaseService
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (subError) {
      logStep("Subscription not found, creating default", { error: subError.message });
      
      // Create default subscription
      await supabaseService
        .from("subscriptions")
        .upsert({
          clerk_user_id: clerkUserId,
          plan: "free",
          status: "active",
          email: `user_${clerkUserId}@temp.com`, // Will be updated when user provides email
        }, { onConflict: "clerk_user_id" });
    }

    // Get usage info
    const { data: usage, error: usageError } = await supabaseService
      .from("usage")
      .select("*")
      .eq("clerk_user_id", clerkUserId)
      .single();

    let usageData = usage;
    if (usageError || !usage) {
      logStep("Usage not found, creating default", { error: usageError?.message });
      
      // Create default usage
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const { data: newUsage } = await supabaseService
        .from("usage")
        .upsert({
          clerk_user_id: clerkUserId,
          period_start: now.toISOString(),
          period_end: periodEnd.toISOString(),
          minutes_quota: 30,
          minutes_used: 0,
          shorts_quota: 100,
          shorts_used: 0,
        }, { onConflict: "clerk_user_id" })
        .select()
        .single();
      
      usageData = newUsage;
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
      status: 500,
    });
  }
});