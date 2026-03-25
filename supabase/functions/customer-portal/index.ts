import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, rejectDisallowedOrigin } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req, "POST, OPTIONS");
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    // Create Supabase client with service role
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get user subscription data - only for the authenticated user
    const { data: subscription } = await supabaseService
      .from("subscriptions")
      .select("stripe_customer_id, email")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (!subscription?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this user");
    }

    logStep("User subscription data retrieved", { customerId: subscription.stripe_customer_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const appUrl = Deno.env.get("APP_URL") || "https://clipify-studio.lovable.app";
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    });

    logStep("Customer portal session created", { sessionId: portalSession.id, url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in customer-portal", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
