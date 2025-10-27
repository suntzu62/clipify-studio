import { useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { supabaseFunctions } from '@/integrations/supabase/client';

export function useSyncOAuth() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !user || syncedRef.current) return;

    const syncTokens = async () => {
      try {
        console.log('[useSyncOAuth] Starting token sync for user:', user.id);
        
        // Buscar conta Google do Clerk
        const accounts = user.externalAccounts?.filter(acc => acc.provider === 'google');
        if (!accounts || accounts.length === 0) {
          console.log('[useSyncOAuth] No Google account found');
          return;
        }

        const googleAccount = accounts[0] as any;
        const accessToken = googleAccount.accessToken;
        const refreshToken = googleAccount.refreshToken;
        const expiresAt = googleAccount.expiresAt;

        if (!accessToken) {
          console.log('[useSyncOAuth] Missing OAuth access token from Clerk');
          return;
        }

        console.log('[useSyncOAuth] Found OAuth tokens, calling clerk-oauth-sync edge function');

        // Chamar edge function para salvar no Supabase
        const clerkToken = await getToken({ template: 'supabase' });
        const { data, error } = await supabaseFunctions.functions.invoke('clerk-oauth-sync', {
          body: { 
            accessToken, 
            refreshToken: refreshToken || accessToken,
            expiresAt: expiresAt || Date.now() + 3600000,
            channelId: null,
            channelTitle: null
          },
          headers: {
            Authorization: `Bearer ${clerkToken}`,
          },
        });

        if (error) {
          console.error('[useSyncOAuth] Failed to sync OAuth tokens:', error);
        } else {
          console.log('[useSyncOAuth] Successfully synced tokens:', data);
          syncedRef.current = true;
        }
      } catch (err) {
        console.error('[useSyncOAuth] Error syncing OAuth tokens:', err);
      }
    };

    syncTokens();
  }, [isSignedIn, user, getToken]);
}
