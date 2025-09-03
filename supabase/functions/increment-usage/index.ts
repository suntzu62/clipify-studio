import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://clipify-studio.lovable.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INCREMENT-USAGE] ${step}${detailsStr}`);
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

    const { minutes = 0, shorts = 0, idempotencyKey } = await req.json();
    
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 10) {
      throw new Error("Valid idempotencyKey is required (minimum 10 characters)");
    }

    // Input validation with maximum limits to prevent abuse
    const MAX_MINUTES_INCREMENT = 1440; // 24 hours max
    const MAX_SHORTS_INCREMENT = 1000; // 1000 shorts max
    
    if (typeof minutes !== 'number' || minutes < 0 || minutes > MAX_MINUTES_INCREMENT) {
      throw new Error(`Invalid minutes value. Must be between 0 and ${MAX_MINUTES_INCREMENT}`);
    }
    
    if (typeof shorts !== 'number' || shorts < 0 || shorts > MAX_SHORTS_INCREMENT) {
      throw new Error(`Invalid shorts value. Must be between 0 and ${MAX_SHORTS_INCREMENT}`);
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

    // Check if this idempotency key was already processed for this user
    const { data: existingEvent } = await supabaseService
      .from("usage_events")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .eq("clerk_user_id", clerkUserId) // Add user check for security
      .single();

    if (existingEvent) {
      logStep("Idempotency key already processed, skipping", { idempotencyKey });
      return new Response(JSON.stringify({ success: true, message: "Already processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Get current usage - only for the authenticated user
    const { data: currentUsage } = await supabaseService
      .from("usage")
      .select("*")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (!currentUsage) {
      throw new Error("Usage record not found. Please ensure user is properly initialized.");
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

    // Record the usage event (for idempotency) - only for authenticated user
    await supabaseService
      .from("usage_events")
      .insert({
        clerk_user_id: clerkUserId,
        idempotency_key: idempotencyKey,
        minutes,
        shorts,
      });

    // Update usage - only for authenticated user
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
      status: 401,
    });
  }
});