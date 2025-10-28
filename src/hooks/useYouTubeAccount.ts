import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface YouTubeAccount {
  channel_id: string | null;
  channel_title: string | null;
  expiry_date: string;
}

export const useYouTubeAccount = () => {
  const { user } = useAuth();
  const [account, setAccount] = useState<YouTubeAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchAccount = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('youtube_accounts')
          .select('channel_id, channel_title, expiry_date')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned (not connected yet)
          console.error('Error fetching YouTube account:', error);
        }

        setAccount(data || null);
      } catch (err) {
        console.error('Failed to fetch YouTube account:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccount();
  }, [user]);

  const isConnected = !!account;
  const isExpired = account ? new Date(account.expiry_date) < new Date() : false;

  return { account, isConnected, isExpired, loading };
};
