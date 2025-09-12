import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-USAGE] ${step}${detailsStr}`);
};

// Verify Clerk JWT token and extract user ID
async function verifyClerkToken(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  
  try {
    // Decode JWT payload (in production, you should verify the signature against Clerk's JWKS)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    if (!payload.sub) {
      throw new Error('Invalid token: missing subject');
    }
    
    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error('Token expired');
    }
    
    return payload.sub;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Verify authentication
    const clerkUserId = await verifyClerkToken(req.headers.get("authorization"));
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
      status: 401,
    });
  }
});