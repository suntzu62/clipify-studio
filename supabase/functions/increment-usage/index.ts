import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INCREMENT-USAGE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { clerkUserId, minutes = 0, shorts = 0, idempotencyKey } = await req.json();
    
    if (!clerkUserId || !idempotencyKey) {
      throw new Error("clerkUserId and idempotencyKey are required");
    }

    if (minutes === 0 && shorts === 0) {
      throw new Error("At least one of minutes or shorts must be greater than 0");
    }

    logStep("Request data received", { clerkUserId, minutes, shorts, idempotencyKey });

    // Create Supabase client with service role
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Check if this idempotency key was already processed
    const { data: existingEvent } = await supabaseService
      .from("usage_events")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existingEvent) {
      logStep("Idempotency key already processed, skipping", { idempotencyKey });
      return new Response(JSON.stringify({ success: true, message: "Already processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Get current usage
    const { data: currentUsage } = await supabaseService
      .from("usage")
      .select("*")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (!currentUsage) {
      throw new Error("Usage record not found. Please ensure user is initialized.");
    }

    // Check if user has enough quota
    const newMinutesUsed = currentUsage.minutes_used + minutes;
    const newShortsUsed = currentUsage.shorts_used + shorts;

    if (newMinutesUsed > currentUsage.minutes_quota) {
      logStep("Quota exceeded for minutes", { 
        current: currentUsage.minutes_used, 
        adding: minutes, 
        quota: currentUsage.minutes_quota 
      });
      return new Response(JSON.stringify({ 
        error: "Quota exceeded", 
        type: "QUOTA_EXCEEDED_MINUTES",
        remaining: currentUsage.minutes_quota - currentUsage.minutes_used 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402, // Payment Required
      });
    }

    if (newShortsUsed > currentUsage.shorts_quota) {
      logStep("Quota exceeded for shorts", { 
        current: currentUsage.shorts_used, 
        adding: shorts, 
        quota: currentUsage.shorts_quota 
      });
      return new Response(JSON.stringify({ 
        error: "Quota exceeded", 
        type: "QUOTA_EXCEEDED_SHORTS",
        remaining: currentUsage.shorts_quota - currentUsage.shorts_used 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402, // Payment Required
      });
    }

    // Record the usage event (for idempotency)
    await supabaseService
      .from("usage_events")
      .insert({
        clerk_user_id: clerkUserId,
        idempotency_key: idempotencyKey,
        minutes,
        shorts,
      });

    // Update usage
    const { data: updatedUsage } = await supabaseService
      .from("usage")
      .update({
        minutes_used: newMinutesUsed,
        shorts_used: newShortsUsed,
      })
      .eq("clerk_user_id", clerkUserId)
      .select()
      .single();

    logStep("Usage updated successfully", { 
      minutesUsed: newMinutesUsed,
      shortsUsed: newShortsUsed,
      minutesRemaining: updatedUsage.minutes_quota - newMinutesUsed,
      shortsRemaining: updatedUsage.shorts_quota - newShortsUsed,
    });

    return new Response(JSON.stringify({ 
      success: true,
      usage: {
        minutesUsed: newMinutesUsed,
        shortsUsed: newShortsUsed,
        minutesRemaining: updatedUsage.minutes_quota - newMinutesUsed,
        shortsRemaining: updatedUsage.shorts_quota - newShortsUsed,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in increment-usage", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});