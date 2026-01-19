import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface SellerPresence {
  id: string;
  user_id: string;
  full_name: string | null;
  is_online: boolean;
  last_seen_at: string;
}

export const useSellerPresence = () => {
  const { user, profile } = useAuth();
  const [onlineSellers, setOnlineSellers] = useState<SellerPresence[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscar vendedores online
  const fetchOnlineSellers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('seller_presence')
        .select('*')
        .eq('is_online', true)
        .gte('last_seen_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Online nos últimos 5 minutos

      if (error) throw error;
      setOnlineSellers(data || []);
    } catch (error) {
      console.error('Error fetching online sellers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Marcar o usuário como online
  const setOnline = useCallback(async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('seller_presence')
        .upsert({
          user_id: user.id,
          full_name: profile?.full_name || 'Vendedor',
          is_online: true,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error setting online status:', error);
    }
  }, [user, profile]);

  // Marcar como offline
  const setOffline = useCallback(async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('seller_presence')
        .update({ is_online: false })
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error setting offline status:', error);
    }
  }, [user]);

  // Atualizar heartbeat periodicamente
  useEffect(() => {
    if (!user) return;

    // Marcar como online ao carregar
    setOnline();

    // Atualizar a cada 30 segundos
    const heartbeatInterval = setInterval(() => {
      setOnline();
    }, 30000);

    // Marcar como offline ao sair
    const handleBeforeUnload = () => {
      setOffline();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setOffline();
    };
  }, [user, setOnline, setOffline]);

  // Buscar vendedores online e atualizar em tempo real
  useEffect(() => {
    fetchOnlineSellers();

    const channel = supabase
      .channel('seller-presence-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'seller_presence'
      }, () => {
        fetchOnlineSellers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOnlineSellers]);

  // Pegar um vendedor online aleatório (ou o primeiro)
  const getRandomOnlineSeller = useCallback(() => {
    if (onlineSellers.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * onlineSellers.length);
    return onlineSellers[randomIndex];
  }, [onlineSellers]);

  return {
    onlineSellers,
    loading,
    setOnline,
    setOffline,
    getRandomOnlineSeller,
    refetch: fetchOnlineSellers,
  };
};

// Função auxiliar para encaminhar conversa para vendedor
export const assignConversationToSeller = async (
  phone: string, 
  sellerId: string, 
  sellerName: string,
  reason: string
) => {
  try {
    // Atualizar a conversa Aline
    const { data: alineConv, error: findError } = await supabase
      .from('aline_conversations')
      .select('id')
      .eq('phone', phone.replace(/\D/g, ''))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;

    if (alineConv) {
      const { error: updateError } = await supabase
        .from('aline_conversations')
        .update({
          status: 'human_takeover',
          assigned_seller_id: sellerId,
          assigned_seller_name: sellerName,
          assigned_at: new Date().toISOString(),
          assignment_reason: reason,
        })
        .eq('id', alineConv.id);

      if (updateError) throw updateError;
    }

    return { success: true };
  } catch (error) {
    console.error('Error assigning conversation to seller:', error);
    return { success: false, error };
  }
};
