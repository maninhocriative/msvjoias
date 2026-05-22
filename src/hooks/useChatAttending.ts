import { useCallback, useEffect, useRef } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

const ATTENDING_HEARTBEAT_MS = 60_000;

type UseChatAttendingParams = {
  conversationId?: string | null;
  userId?: string | null;
  userName?: string | null;
  enabled?: boolean;
};

export function useChatAttending({
  conversationId,
  userId,
  userName,
  enabled = true,
}: UseChatAttendingParams) {
  const activeConversationIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        accessTokenRef.current = data.session?.access_token ?? null;
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearAttendingWithKeepalive = useCallback(
    (targetConversationId: string) => {
      if (!userId || !accessTokenRef.current) return false;

      const query = new URLSearchParams({
        id: `eq.${targetConversationId}`,
        attending_by: `eq.${userId}`,
      });

      fetch(`${supabaseUrl}/rest/v1/conversations?${query.toString()}`, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessTokenRef.current}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          attending_by: null,
          attending_name: null,
          attending_since: null,
        }),
      }).catch(() => {
        // A limpeza normal por expiração cobre falhas no encerramento do browser.
      });

      return true;
    },
    [userId],
  );

  const clearAttending = useCallback(
    async (targetConversationId?: string | null, options?: { keepalive?: boolean }) => {
      if (!targetConversationId || !userId) return;

      if (activeConversationIdRef.current === targetConversationId) {
        activeConversationIdRef.current = null;
      }

      if (options?.keepalive && clearAttendingWithKeepalive(targetConversationId)) {
        return;
      }

      const { error } = await supabase
        .from('conversations')
        .update({
          attending_by: null,
          attending_name: null,
          attending_since: null,
        })
        .eq('id', targetConversationId)
        .eq('attending_by', userId);

      if (error) {
        console.error('Error clearing chat attending marker:', error);
      }
    },
    [clearAttendingWithKeepalive, userId],
  );

  const markAttending = useCallback(
    async (targetConversationId: string) => {
      if (!targetConversationId || !userId) return;

      activeConversationIdRef.current = targetConversationId;

      const { error } = await supabase
        .from('conversations')
        .update({
          attending_by: userId,
          attending_name: userName || 'Vendedor',
          attending_since: new Date().toISOString(),
        })
        .eq('id', targetConversationId);

      if (error) {
        console.error('Error marking chat attending marker:', error);
      }
    },
    [userId, userName],
  );

  useEffect(() => {
    if (!enabled || !conversationId || !userId) {
      if (activeConversationIdRef.current) {
        void clearAttending(activeConversationIdRef.current);
      }
      return;
    }

    void markAttending(conversationId);

    const heartbeat = window.setInterval(() => {
      if (activeConversationIdRef.current === conversationId) {
        void markAttending(conversationId);
      }
    }, ATTENDING_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      void clearAttending(conversationId);
    };
  }, [clearAttending, conversationId, enabled, markAttending, userId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const targetConversationId = activeConversationIdRef.current;
      if (!targetConversationId) return;

      void clearAttending(targetConversationId, { keepalive: true });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [clearAttending]);
}
