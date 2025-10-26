import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificação adequada do service role
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!serviceRoleKey) {
      console.error('[migrate-encrypt-tokens] SUPABASE_SERVICE_ROLE_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'configuration_error', 
          message: 'Service role key not configured' 
        }), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 500 
        }
      );
    }
    
    // Comparar header exato com service role key (não apenas substring)
    const expectedHeader = `Bearer ${serviceRoleKey}`;
    if (!authHeader || authHeader !== expectedHeader) {
      console.warn('[migrate-encrypt-tokens] Unauthorized access attempt', {
        hasAuthHeader: !!authHeader,
        headerMatches: authHeader === expectedHeader
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'unauthorized', 
          message: 'Valid service role key required' 
        }), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 401 
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    console.log('Starting token encryption migration...');

    // Buscar todos os registros
    const { data: accounts, error: fetchError } = await supabase
      .from('youtube_accounts')
      .select('id, user_id, access_token, refresh_token');

    if (fetchError) {
      throw new Error(`Failed to fetch accounts: ${fetchError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No accounts to migrate', count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${accounts.length} accounts to check`);

    let migrated = 0;
    let skipped = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const account of accounts) {
      try {
        // Verificar se já está criptografado (formato: base64.base64 ou base64.base64.base64)
        const isEncrypted = (token: string | null) => {
          if (!token) return false;
          const parts = token.split('.');
          return parts.length >= 2 && parts.every(p => /^[A-Za-z0-9+/=]+$/.test(p));
        };

        const accessTokenNeedsEncryption = account.access_token && !isEncrypted(account.access_token);
        const refreshTokenNeedsEncryption = account.refresh_token && !isEncrypted(account.refresh_token);

        if (!accessTokenNeedsEncryption && !refreshTokenNeedsEncryption) {
          console.log(`Skipping account ${account.user_id} (already encrypted)`);
          skipped++;
          continue;
        }

        console.log(`Encrypting tokens for account ${account.user_id}...`);

        // Criptografar tokens
        const encryptedAccessToken = accessTokenNeedsEncryption && account.access_token
          ? await encryptToken(account.access_token)
          : account.access_token;

        const encryptedRefreshToken = refreshTokenNeedsEncryption && account.refresh_token
          ? await encryptToken(account.refresh_token)
          : account.refresh_token;

        // Atualizar no banco
        const { error: updateError } = await supabase
          .from('youtube_accounts')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            updated_at: new Date().toISOString()
          })
          .eq('id', account.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        console.log(`Successfully encrypted tokens for account ${account.user_id}`);
        migrated++;
      } catch (err: any) {
        console.error(`Failed to encrypt tokens for account ${account.user_id}:`, err.message);
        errors.push({
          user_id: account.user_id,
          error: err.message
        });
      }
    }

    console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total: accounts.length,
        migrated,
        skipped,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error('Migration error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
