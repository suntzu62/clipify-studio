import { supabase } from "@/integrations/supabase/client";

export interface UsageData {
  plan: "free" | "pro" | "scale";
  status: string;
  minutesUsed: number;
  minutesQuota: number;
  minutesRemaining: number;
  shortsUsed: number;
  shortsQuota: number;
  shortsRemaining: number;
  periodEnd?: string;
}

export interface BillingError {
  error: string;
  type?: "QUOTA_EXCEEDED_MINUTES" | "QUOTA_EXCEEDED_SHORTS";
  remaining?: number;
}

export const createCheckoutSession = async (plan: "pro" | "scale", sessionToken: string) => {
  console.log("Creating checkout session", { plan });
  
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: { plan },
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (error) {
    console.error("Checkout creation error:", error);
    throw new Error(error.message || "Failed to create checkout session");
  }

  return data;
};

export const createCustomerPortalSession = async (sessionToken: string) => {
  console.log("Creating customer portal session");
  
  const { data, error } = await supabase.functions.invoke("customer-portal", {
    body: {},
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (error) {
    console.error("Customer portal creation error:", error);
    throw new Error(error.message || "Failed to create customer portal session");
  }

  return data;
};

export const getUsage = async (sessionToken: string): Promise<UsageData> => {
  console.log("Getting usage data");
  
  const { data, error } = await supabase.functions.invoke("get-usage", {
    body: {},
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (error) {
    console.error("Usage retrieval error:", error);
    throw new Error(error.message || "Failed to get usage data");
  }

  return data;
};

export const incrementUsage = async (
  sessionToken: string,
  usage: { minutes?: number; shorts?: number }, 
  idempotencyKey: string
) => {
  console.log("Incrementing usage", { usage, idempotencyKey });
  
  const { data, error } = await supabase.functions.invoke("increment-usage", {
    body: { 
      minutes: usage.minutes || 0, 
      shorts: usage.shorts || 0, 
      idempotencyKey 
    },
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (error) {
    console.error("Usage increment error:", error);
    throw error;
  }

  return data;
};

export const ensureQuota = async (
  sessionToken: string,
  neededMinutes: number = 0, 
  neededShorts: number = 0
): Promise<void> => {
  const usage = await getUsage(sessionToken);
  
  if (neededMinutes > usage.minutesRemaining) {
    throw new Error(`Insufficient minutes quota. Need ${neededMinutes}, have ${usage.minutesRemaining}`);
  }
  
  if (neededShorts > usage.shortsRemaining) {
    throw new Error(`Insufficient shorts quota. Need ${neededShorts}, have ${usage.shortsRemaining}`);
  }
};

export const getPlanDisplayName = (plan: string): string => {
  switch (plan) {
    case "free":
      return "Gratuito";
    case "pro":
      return "Pro";
    case "scale":
      return "Scale";
    default:
      return plan;
  }
};

export const getPlanPrice = (plan: string): string => {
  switch (plan) {
    case "free":
      return "R$ 0";
    case "pro":
      return "R$ 49,99";
    case "scale":
      return "R$ 199,99";
    default:
      return "N/A";
  }
};

export const getPlanFeatures = (plan: string): string[] => {
  switch (plan) {
    case "free":
      return [
        "30 minutos de processamento",
        "100 shorts por mês",
        "Qualidade HD",
        "Suporte por email"
      ];
    case "pro":
      return [
        "300 minutos de processamento",
        "500 shorts por mês",
        "Qualidade 4K",
        "Suporte prioritário",
        "Uploads em lote",
        "Analytics avançados"
      ];
    case "scale":
      return [
        "1200 minutos de processamento",
        "2000 shorts por mês",
        "Qualidade 8K",
        "Suporte 24/7",
        "API Access",
        "White-label",
        "Gerenciamento de equipe"
      ];
    default:
      return [];
  }
};