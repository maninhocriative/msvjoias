import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Som de notificação usando Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Criar um som de notificação agradável
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Tom inicial (mais alto)
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
    
    // Envelope de volume
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.15);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    
    oscillator.type = 'sine';
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
    
    return true;
  } catch (error) {
    console.error('Erro ao tocar som de notificação:', error);
    return false;
  }
};

interface AlineConversationPayload {
  id: string;
  phone: string;
  status: string;
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  assignment_reason?: string;
}

export const useAssignmentNotification = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const previousAssignmentsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  const handleNewAssignment = useCallback((data: AlineConversationPayload) => {
    // Só notificar se a conversa foi atribuída ao usuário logado
    if (!user || data.assigned_seller_id !== user.id) return;
    
    // Verificar se já notificamos sobre esta conversa (evita duplicatas)
    const assignmentKey = `${data.id}-${data.assigned_seller_id}`;
    if (previousAssignmentsRef.current.has(assignmentKey)) return;
    
    // Adicionar ao set de atribuições já notificadas
    previousAssignmentsRef.current.add(assignmentKey);
    
    // Tocar som de notificação
    playNotificationSound();
    
    // Mostrar toast
    toast({
      title: '🔔 Nova conversa atribuída!',
      description: `Você foi designado para atender ${data.phone}`,
    });
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;

    // Carregar atribuições existentes para não notificar sobre elas
    const loadExistingAssignments = async () => {
      const { data } = await supabase
        .from('aline_conversations')
        .select('id, assigned_seller_id')
        .eq('assigned_seller_id', user.id);
      
      if (data) {
        data.forEach(conv => {
          previousAssignmentsRef.current.add(`${conv.id}-${conv.assigned_seller_id}`);
        });
      }
      isInitializedRef.current = true;
    };

    loadExistingAssignments();

    // Monitorar novas atribuições em tempo real
    const channel = supabase
      .channel('assignment-notifications')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'aline_conversations',
        },
        (payload) => {
          if (!isInitializedRef.current) return;
          
          const newData = payload.new as AlineConversationPayload;
          const oldData = payload.old as AlineConversationPayload;
          
          // Verificar se o assigned_seller_id mudou para o usuário atual
          if (
            newData.assigned_seller_id === user.id && 
            oldData.assigned_seller_id !== user.id
          ) {
            handleNewAssignment(newData);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'aline_conversations',
        },
        (payload) => {
          if (!isInitializedRef.current) return;
          
          const newData = payload.new as AlineConversationPayload;
          
          // Verificar se a conversa foi inserida já atribuída ao usuário atual
          if (newData.assigned_seller_id === user.id) {
            handleNewAssignment(newData);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, handleNewAssignment]);
};
