import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    
    if (!signature) {
      throw new Error("No stripe signature found");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook verified", { eventType: event.type });
    } catch (err) {
      logStep("Webhook verification failed", { error: err.message });
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    // Create Supabase client with service role
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerk_user_id;
        const plan = session.metadata?.plan as "pro" | "scale";
        
        if (!clerkUserId || !plan) {
          logStep("Missing metadata in checkout session", { clerkUserId, plan });
          break;
        }

        logStep("Processing checkout completion", { clerkUserId, plan, sessionId: session.id });

        // Update subscription
        await supabaseService
          .from("subscriptions")
          .update({
            plan: plan,
            status: "active",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          })
          .eq("clerk_user_id", clerkUserId);

        // Reset usage for new billing cycle
        const quotas = {
          pro: { minutes: 300, shorts: 500 },
          scale: { minutes: 1200, shorts: 2000 }
        };

        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await supabaseService
          .from("usage")
          .upsert({
            clerk_user_id: clerkUserId,
            period_start: now.toISOString(),
            period_end: periodEnd.toISOString(),
            minutes_quota: quotas[plan].minutes,
            minutes_used: 0,
            shorts_quota: quotas[plan].shorts,
            shorts_used: 0,
          }, { onConflict: "clerk_user_id" });

        logStep("Subscription activated and usage reset", { plan, quotas: quotas[plan] });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Find user by customer ID
        const { data: userSub } = await supabaseService
          .from("subscriptions")
          .select("clerk_user_id")
          .eq("stripe_customer_id", subscription.customer as string)
          .single();

        if (!userSub) {
          logStep("User not found for customer", { customerId: subscription.customer });
          break;
        }

        logStep("Processing subscription update", { 
          subscriptionId: subscription.id, 
          status: subscription.status,
          clerkUserId: userSub.clerk_user_id 
        });

        await supabaseService
          .from("subscriptions")
          .update({
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("clerk_user_id", userSub.clerk_user_id);

        logStep("Subscription updated in database");
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Find user by customer ID
        const { data: userSub } = await supabaseService
          .from("subscriptions")
          .select("clerk_user_id")
          .eq("stripe_customer_id", subscription.customer as string)
          .single();

        if (!userSub) {
          logStep("User not found for customer", { customerId: subscription.customer });
          break;
        }

        logStep("Processing subscription cancellation", { 
          subscriptionId: subscription.id,
          clerkUserId: userSub.clerk_user_id 
        });

        // Downgrade to free plan
        await supabaseService
          .from("subscriptions")
          .update({
            plan: "free",
            status: "canceled",
            stripe_subscription_id: null,
            current_period_end: null,
          })
          .eq("clerk_user_id", userSub.clerk_user_id);

        // Reset to free quota
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await supabaseService
          .from("usage")
          .upsert({
            clerk_user_id: userSub.clerk_user_id,
            period_start: now.toISOString(),
            period_end: periodEnd.toISOString(),
            minutes_quota: 30,
            minutes_used: 0,
            shorts_quota: 100,
            shorts_used: 0,
          }, { onConflict: "clerk_user_id" });

        logStep("Subscription canceled and downgraded to free");
        break;
      }

      default:
        logStep("Unhandled event type", { eventType: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in stripe-webhook", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});