import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, rejectDisallowedOrigin } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
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
    const productPro = Deno.env.get("STRIPE_PRODUCT_PRO");
    const productScale = Deno.env.get("STRIPE_PRODUCT_SCALE");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!productPro) throw new Error("STRIPE_PRODUCT_PRO is not set");
    if (!productScale) throw new Error("STRIPE_PRODUCT_SCALE is not set");
    
    logStep("Stripe configuration verified");

    const { plan } = await req.json();
    if (!plan || !["pro", "scale"].includes(plan)) {
      throw new Error("Invalid plan. Must be 'pro' or 'scale'");
    }
    
    logStep("Request data received", { plan, clerkUserId });

    // Create Supabase client with service role for secure operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get user subscription data - only for the authenticated user
    const { data: subscription } = await supabaseService
      .from("subscriptions")
      .select("email, stripe_customer_id")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (!subscription?.email) {
      throw new Error("User subscription record not found");
    }

    logStep("User subscription data retrieved", { email: subscription.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    // Check/create Stripe customer
    let customerId = subscription.stripe_customer_id;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: subscription.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({ email: subscription.email });
        customerId = customer.id;
        
        // Update subscription record with customer ID - only for authenticated user
        await supabaseService
          .from("subscriptions")
          .update({ stripe_customer_id: customerId })
          .eq("clerk_user_id", clerkUserId);
      }
      logStep("Stripe customer created/retrieved", { customerId });
    }

    // Get product prices
    const productId = plan === "pro" ? productPro : productScale;
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
    
    if (prices.data.length === 0) {
      throw new Error(`No active price found for product: ${productId}`);
    }

    const priceId = prices.data[0].id;
    logStep("Price retrieved", { productId, priceId });

    // Create checkout session
    const appUrl = Deno.env.get("APP_URL") || "https://clipify-studio.lovable.app";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${appUrl}/billing?success=true`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      metadata: {
        clerk_user_id: clerkUserId,
        plan: plan,
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-checkout", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
