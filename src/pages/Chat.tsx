import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, Conversation, Message, LeadStatus } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Paperclip, Search, MessageSquare, Mic, Bot, User, Phone, ArrowLeft, MoreVertical, UserCheck, RefreshCw, MessageCircle, Sparkles, X, Loader2, Users, UserPlus, Camera, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { LeadStatusSelect, LeadStatusBadge } from '@/components/chat/LeadStatusSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TypingIndicator from '@/components/chat/TypingIndicator';
import SellerToolsPanel from '@/components/chat/SellerToolsPanel';
import AssignSellerDialog from '@/components/chat/AssignSellerDialog';
import MessageItem from '@/components/chat/MessageItem';
import ConversationItem from '@/components/chat/ConversationItem';

import { useSellerPresence, assignConversationToSeller } from '@/hooks/useSellerPresence';
import { useUserRole } from '@/hooks/useUserRole';
import { Badge } from '@/components/ui/badge';
import { useAssignmentNotification } from '@/hooks/useAssignmentNotification';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';


interface AlineConversation {
  id: string;
  phone: string;
  status: string;
  assigned_seller_id?: string;
  assigned_seller_name?: string;
  assignment_reason?: string;
  assigned_at?: string;
}

interface CustomerProfile {
  whatsapp: string;
  name?: string;
  profile_pic_url?: string;
}

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 200);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAttendant, setFilterAttendant] = useState<string>('all');
  const [alineStatus, setAlineStatus] = useState<string | null>(null);
  const [alineStatusMap, setAlineStatusMap] = useState<Record<string, AlineConversation>>({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, CustomerProfile>>({});
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScroll = useRef(true);
  const lastMessageCount = useRef(0);
  const { toast } = useToast();
  const { onlineSellers, getRandomOnlineSeller, startChatting, stopChatting } = useSellerPresence();
  const { isAdmin, isGerente } = useUserRole();
  
  // Hook para notificações de atribuição de conversa
  useAssignmentNotification();

  const updateLeadStatus = async (conversationId: string, status: LeadStatus) => {
    setUpdatingLeadStatus(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ lead_status: status })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => prev.map(c => 
        c.id === conversationId ? { ...c, lead_status: status } : c
      ));
      
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, lead_status: status } : null);
      }

      toast({ title: 'Status atualizado!' });
    } catch (error) {
      console.error('Error updating lead status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingLeadStatus(false);
    }
  };

  const handleTakeover = async (action: 'takeover' | 'release') => {
    if (!selectedConversation) return;
    
    setTakingOver(true);
    try {
      const { data, error } = await supabase.functions.invoke('aline-takeover', {
        body: {
          phone: selectedConversation.contact_number,
          action,
        },
      });

      if (error) throw error;

      const newStatus = action === 'takeover' ? 'human_takeover' : 'active';
      
      // Atualizar o status local da Aline
      setAlineStatus(newStatus);
      
      // Atualizar o mapa de status para refletir na contagem e filtro
      setAlineStatusMap(prev => ({
        ...prev,
        [selectedConversation.contact_number]: {
          ...prev[selectedConversation.contact_number],
          status: newStatus,
        }
      }));

      toast({
        title: action === 'takeover' ? '✋ Atendimento assumido' : '🤖 Devolvido para Aline',
        description: data.message,
      });
    } catch (error) {
      console.error('Takeover error:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o atendimento.',
        variant: 'destructive',
      });
    } finally {
      setTakingOver(false);
    }
  };

  // Função para atribuir conversa a um vendedor específico
  const handleAssignToSeller = async (sellerId: string, sellerName: string) => {
    if (!selectedConversation) return;
    
    setTakingOver(true);
    try {
      const { data, error } = await supabase.functions.invoke('aline-takeover', {
        body: {
          phone: selectedConversation.contact_number,
          action: 'takeover',
          seller_id: sellerId,
          seller_name: sellerName,
          reason: 'Atribuição manual via painel',
        },
      });

      if (error) throw error;

      // Atualizar o status local
      setAlineStatus('human_takeover');
      setAlineStatusMap(prev => ({
        ...prev,
        [selectedConversation.contact_number]: {
          ...prev[selectedConversation.contact_number],
          status: 'human_takeover',
          assigned_seller_id: sellerId,
          assigned_seller_name: sellerName,
        }
      }));

      toast({
        title: '✅ Conversa atribuída',
        description: `Conversa atribuída para ${sellerName}`,
      });
    } catch (error) {
      console.error('Assignment error:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atribuir a conversa.',
        variant: 'destructive',
      });
    } finally {
      setTakingOver(false);
    }
  };


  useEffect(() => {
    if (selectedConversation) {
      // Reset scroll tracking for new conversation
      lastMessageCount.current = 0;
      shouldAutoScroll.current = true;
      
      fetchMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
      setIsContactTyping(false);
      fetchAlineStatus(selectedConversation.contact_number);
      
      // Marcar que está atendendo esta conversa
      startChatting(selectedConversation.contact_number);
      
      const channel = supabase
        .channel(`messages-${selectedConversation.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` },
          (payload) => {
            console.log('[Chat] Nova mensagem via realtime:', payload.new);
            if (!(payload.new as Message).is_from_me) setIsContactTyping(false);
            setMessages((prev) => {
              // Prevent duplicates by checking id
              if (prev.some(m => m.id === (payload.new as Message).id)) return prev;
              return [...prev, payload.new as Message];
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConversation.id}` },
          (payload) => {
            setMessages((prev) => 
              prev.map((msg) => msg.id === (payload.new as Message).id ? { ...msg, ...payload.new } : msg)
            );
          }
        )
        .subscribe((status) => {
          console.log('[Chat] Subscription status:', status);
        });

      // Fallback: Poll a cada 15s (reduced frequency for better performance)
      const pollInterval = setInterval(() => {
        fetchMessages(selectedConversation.id);
      }, 15000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
        // Marcar que parou de atender quando sair da conversa
        stopChatting();
      };
    } else {
      // Se não tem conversa selecionada, garantir que não está marcado como atendendo
      stopChatting();
    }
  }, [selectedConversation?.id, startChatting, stopChatting]);

  // Smart scroll: only auto-scroll if user is at the bottom or new conversation
  useEffect(() => {
    const isNewConversation = messages.length > 0 && lastMessageCount.current === 0;
    const hasNewMessages = messages.length > lastMessageCount.current;
    
    if (isNewConversation) {
      // New conversation selected - scroll to bottom immediately
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else if (hasNewMessages && shouldAutoScroll.current) {
      // New messages and user is at bottom - smooth scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    
    lastMessageCount.current = messages.length;
  }, [messages]);
  
  // Track scroll position to determine if auto-scroll should happen
  const handleMessagesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    shouldAutoScroll.current = isAtBottom;
  }, []);

  const fetchConversations = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      // Ordenar por última mensagem para conversas novas aparecerem no topo
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setConversations(data || []);
      
      // Buscar status de atendimento de todas as conversas com dados completos
      if (data && data.length > 0) {
        const phones = data.map(c => c.contact_number);
        const { data: alineData } = await supabase
          .from('aline_conversations')
          .select('id, phone, status, assigned_seller_id, assigned_seller_name, assignment_reason, assigned_at')
          .in('phone', phones);
        
        // Buscar dados de clientes para fotos
        const { data: customersData } = await supabase
          .from('customers')
          .select('whatsapp, name, profile_pic_url')
          .in('whatsapp', phones);
        
        if (alineData) {
          const statusMap: Record<string, AlineConversation> = {};
          alineData.forEach(ac => {
            statusMap[ac.phone] = ac;
          });
          setAlineStatusMap(statusMap);
        }
        
        // Salvar perfis dos clientes
        if (customersData) {
          const profilesMap: Record<string, CustomerProfile> = {};
          customersData.forEach(c => {
            profilesMap[c.whatsapp] = { 
              whatsapp: c.whatsapp, 
              name: c.name,
              profile_pic_url: c.profile_pic_url 
            };
          });
          setCustomerProfiles(profilesMap);
          
          // Buscar fotos de perfil para telefones que não têm foto
          const phonesWithoutPic = phones.filter(p => 
            !customersData.find(c => c.whatsapp === p && c.profile_pic_url)
          );
          
          if (phonesWithoutPic.length > 0 && phonesWithoutPic.length <= 20) {
            // Buscar fotos em background (não bloquear a UI)
            supabase.functions.invoke('zapi-profile-picture', {
              body: { phones: phonesWithoutPic.slice(0, 10) }
            }).then(({ data }) => {
              if (data?.results) {
                const newProfiles: Record<string, CustomerProfile> = {};
                data.results.forEach((r: { phone: string; profilePicUrl: string | null }) => {
                  if (r.profilePicUrl) {
                    newProfiles[r.phone] = {
                      whatsapp: r.phone,
                      profile_pic_url: r.profilePicUrl
                    };
                  }
                });
                if (Object.keys(newProfiles).length > 0) {
                  setCustomerProfiles(prev => ({ ...prev, ...newProfiles }));
                }
              }
            }).catch(err => console.log('Profile pic fetch error:', err));
          }
        }
      }
      
      if (showToast) {
        toast({ title: '✅ Atualizado!', description: `${data?.length || 0} conversas carregadas` });
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      if (showToast) {
        toast({ title: 'Erro', description: 'Não foi possível atualizar', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // useEffect para buscar conversas e monitorar mudanças em tempo real
  useEffect(() => {
    fetchConversations(false);

    const convChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations(false)
      )
      .subscribe();

    // Canal para monitorar mudanças no status de atendimento (aline_conversations)
    // OTIMIZADO: Só atualizar o mapa local, não recarregar toda a lista
    const alineChannel = supabase
      .channel('aline-conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aline_conversations' },
        (payload) => {
          // Só atualizar o mapa de status, NÃO recarregar conversas
          const updated = payload.new as AlineConversation;
          if (updated && updated.phone) {
            setAlineStatusMap(prev => {
              // Só atualizar se realmente mudou algo relevante
              const current = prev[updated.phone];
              if (current?.status === updated.status && 
                  current?.assigned_seller_id === updated.assigned_seller_id) {
                return prev; // Sem mudança, evitar re-render
              }
              return {
                ...prev,
                [updated.phone]: updated
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(alineChannel);
    };
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, is_from_me, media_url, message_type, status, conversation_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100); // Limit for performance

      if (error) throw error;
      // Filtrar mensagens vazias (callbacks salvos por erro)
      const validMessages = (data || []).filter(msg => 
        msg.content?.trim() || msg.media_url
      );
      setMessages(validMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, []);

  const markAsRead = async (conversationId: string) => {
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
  };

  const fetchAlineStatus = async (phone: string) => {
    try {
      const { data, error } = await supabase
        .from('aline_conversations')
        .select('status')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching aline status:', error);
        setAlineStatus(null);
        return;
      }

      setAlineStatus(data?.status || null);
    } catch (error) {
      console.error('Error fetching aline status:', error);
      setAlineStatus(null);
    }
  };

  // Helper to add optimistic message to UI instantly
  const addOptimisticMessage = useCallback((content: string, messageType = 'text', mediaUrl: string | null = null): string => {
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: selectedConversation?.id || '',
      content,
      message_type: messageType,
      media_url: mediaUrl,
      is_from_me: true,
      status: 'sending',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    shouldAutoScroll.current = true;
    return tempId;
  }, [selectedConversation?.id]);

  // Helper to mark optimistic message as failed
  const markOptimisticFailed = useCallback((tempId: string) => {
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
  }, []);

  // Helper to remove optimistic message (when real one arrives via realtime)
  const removeOptimistic = useCallback((tempId: string) => {
    setMessages(prev => prev.filter(m => m.id !== tempId));
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || sending) return;

    const msg = newMessage;
    setNewMessage('');
    await sendMessageDirect(msg);
  };

  const sendMessageDirect = async (messageText: string) => {
    if (!messageText.trim() || !selectedConversation) return;

    // Optimistic: show message instantly
    const tempId = addOptimisticMessage(messageText);

    // Fire and forget - don't block UI
    supabase.functions.invoke('automation-send', {
      body: {
        conversation_id: selectedConversation.id,
        phone: selectedConversation.contact_number,
        message: messageText,
        message_type: 'text',
        platform: selectedConversation.platform || 'whatsapp',
      },
    }).then(({ error }) => {
      if (error) {
        markOptimisticFailed(tempId);
        toast({ title: 'Erro', description: 'Não foi possível enviar a mensagem.', variant: 'destructive' });
      }
      // On success, realtime will deliver the real message - remove optimistic after a delay
      setTimeout(() => removeOptimistic(tempId), 3000);
    }).catch(() => {
      markOptimisticFailed(tempId);
      toast({ title: 'Erro', description: 'Não foi possível enviar a mensagem.', variant: 'destructive' });
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

    let messageType = 'document';
    if (file.type.startsWith('image/')) messageType = 'image';
    else if (file.type.startsWith('audio/')) messageType = 'audio';
    else if (file.type.startsWith('video/')) messageType = 'video';

    // Optimistic: show file message instantly
    const tempId = addOptimisticMessage(file.name, messageType);
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: file.name,
          message_type: messageType,
          media_url: publicUrl,
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;
      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch (error) {
      console.error('Error uploading file:', error);
      markOptimisticFailed(tempId);
      toast({ title: 'Erro', description: 'Não foi possível enviar o arquivo.', variant: 'destructive' });
    }
  };

  // Timer para exibir duração da gravação
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
      }, 100);
    } else {
      setRecordingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, recordingStartTime]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          setAudioChunks([...chunks]);
        }
      };
      
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await uploadAudio(blob);
        stream.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        setAudioChunks([]);
      };

      // Gravar em intervalos para permitir parar a qualquer momento
      recorder.start(100);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      toast({ title: '🎙️ Gravando áudio', description: 'Clique no ⏹️ para enviar' });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({ title: 'Erro', description: 'Não foi possível acessar o microfone.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setMediaRecorder(null);
    setIsRecording(false);
    setRecordingStartTime(null);
  };

  const cancelRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    setMediaRecorder(null);
    setIsRecording(false);
    setRecordingStartTime(null);
    setAudioChunks([]);
    toast({ title: 'Gravação cancelada' });
  };

  const uploadAudio = async (blob: Blob) => {
    if (!selectedConversation || blob.size < 1000) {
      toast({ title: 'Áudio muito curto', description: 'Grave por mais tempo' });
      return;
    }
    
    // Optimistic: show audio message instantly
    const tempId = addOptimisticMessage('🎤 Áudio', 'audio');

    try {
      const fileName = `audio-${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, blob);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: 'Áudio',
          message_type: 'audio',
          media_url: publicUrl,
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;
      setTimeout(() => removeOptimistic(tempId), 3000);
    } catch (error) {
      console.error('Error uploading audio:', error);
      markOptimisticFailed(tempId);
      toast({ title: 'Erro', description: 'Não foi possível enviar o áudio.', variant: 'destructive' });
    }
  };

  // Capturar screenshot da tela e enviar
  const captureAndSendScreenshot = async () => {
    if (!selectedConversation) return;
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { mediaSource: 'screen' } as any
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      stream.getTracks().forEach(track => track.stop());
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 0.9);
      });
      
      if (!blob) throw new Error('Failed to capture screenshot');
      
      // Optimistic
      const tempId = addOptimisticMessage('📸 Screenshot', 'image');

      const fileName = `screenshot-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, blob);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(fileName);

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: selectedConversation.id,
          phone: selectedConversation.contact_number,
          message: 'Screenshot',
          message_type: 'image',
          media_url: publicUrl,
          platform: selectedConversation.platform || 'whatsapp',
        },
      });

      if (error) throw error;
      setTimeout(() => removeOptimistic(tempId), 3000);
      
    } catch (error: any) {
      console.error('Error capturing screenshot:', error);
      if (error.name === 'NotAllowedError') {
        toast({ title: 'Permissão negada', description: 'Você precisa permitir o compartilhamento de tela.', variant: 'destructive' });
      } else {
        toast({ title: 'Erro', description: 'Não foi possível capturar a tela.', variant: 'destructive' });
      }
    }
    }
  };

  // Função para formatar duração da gravação
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredConversations = useMemo(() => {
    const searchLower = debouncedSearchTerm.toLowerCase();
    return conversations
      .filter((conv) => {
        // Usar nome do cliente da tabela customers se disponível
        const customerProfile = customerProfiles[conv.contact_number];
        const displayName = customerProfile?.name || conv.contact_name || '';
        
        const matchesSearch = !debouncedSearchTerm || 
          displayName.toLowerCase().includes(searchLower) ||
          conv.contact_number?.includes(debouncedSearchTerm);
        const matchesStatus = filterStatus === 'all' || conv.lead_status === filterStatus;
        
        // Filtro por atendente
        const convAlineData = alineStatusMap[conv.contact_number];
        const convStatus = convAlineData?.status;
        const isHumanAttendant = convStatus === 'human_takeover';
        const isAlineAttendant = convStatus === 'active' || !convStatus;
        const matchesAttendant = filterAttendant === 'all' || 
          (filterAttendant === 'vendedor' && isHumanAttendant) ||
          (filterAttendant === 'aline' && isAlineAttendant);
        
        return matchesSearch && matchesStatus && matchesAttendant;
      })
      // Ordenar por última mensagem (mais recente primeiro)
      .sort((a, b) => {
        const dateA = new Date((a as any).last_message_at || a.created_at || 0).getTime();
        const dateB = new Date((b as any).last_message_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });
  }, [conversations, debouncedSearchTerm, filterStatus, filterAttendant, alineStatusMap, customerProfiles]);

  // Memoized grouped messages for better performance
  const groupedMessages = useMemo(() => {
    return messages.reduce((groups, message) => {
      const date = new Date(message.created_at || '').toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(message);
      return groups;
    }, {} as Record<string, Message[]>);
  }, [messages]);

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const statusFilters = [
    { key: 'all', label: 'Todos', emoji: '📋' },
    { key: 'novo', label: 'Novos', emoji: '🆕' },
    { key: 'quente', label: 'Quentes', emoji: '🔥' },
    { key: 'frio', label: 'Frios', emoji: '❄️' },
    { key: 'comprador', label: 'Compradores', emoji: '💰' },
  ];

  const attendantFilters = [
    { key: 'all', label: 'Todos', icon: null },
    { key: 'aline', label: 'Aline', icon: Bot },
    { key: 'vendedor', label: 'Vendedor', icon: User },
  ];

  const statusCounts: Record<string, number> = {
    all: conversations.length,
    novo: conversations.filter(c => c.lead_status === 'novo').length,
    quente: conversations.filter(c => c.lead_status === 'quente').length,
    frio: conversations.filter(c => c.lead_status === 'frio').length,
    comprador: conversations.filter(c => c.lead_status === 'comprador').length,
  };

  const attendantCounts: Record<string, number> = {
    all: conversations.length,
    aline: conversations.filter(c => alineStatusMap[c.contact_number]?.status !== 'human_takeover').length,
    vendedor: conversations.filter(c => alineStatusMap[c.contact_number]?.status === 'human_takeover').length,
  };

  return (
    <div className="h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Sidebar de Conversas */}
      <div className={cn(
        'w-full md:w-[380px] lg:w-[420px] flex flex-col shrink-0 bg-slate-900/80 backdrop-blur-xl border-r border-white/5',
        selectedConversation && 'hidden md:flex'
      )}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                {unreadTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Chat CRM</h1>
                <p className="text-xs text-slate-400">{conversations.length} conversas</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchConversations(true)}
              disabled={refreshing}
              className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl"
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Vendedores Online - Compacto */}
          <div className="mb-3 px-3 py-2 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-lg border border-emerald-500/20">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="relative">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                </div>
                <span className="text-xs font-medium text-emerald-300">
                  {onlineSellers.length > 0 ? `${onlineSellers.length} online` : 'Offline'}
                </span>
              </div>
              
              {onlineSellers.length > 0 ? (
                <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
                  {onlineSellers.map((seller) => (
                    <button 
                      key={seller.user_id} 
                      onClick={() => {
                        if (selectedConversation) {
                          handleAssignToSeller(seller.user_id, seller.full_name || 'Vendedor');
                        } else {
                          toast({
                            title: 'Selecione uma conversa',
                            description: `Para atribuir a ${seller.full_name || 'Vendedor'}, selecione primeiro.`,
                          });
                        }
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/60 rounded-full border border-white/5 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all group shrink-0"
                      title={`Atribuir para ${seller.full_name || 'Vendedor'}`}
                    >
                      <div className="relative">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {(seller.full_name || 'V').charAt(0).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border border-slate-800 rounded-full" />
                      </div>
                      <span className="text-[10px] text-slate-300 group-hover:text-emerald-300 transition-colors max-w-[60px] truncate">
                        {(seller.full_name || 'Vendedor').split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-slate-500">Aline atendendo</span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500/50 h-11 rounded-xl"
            />
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="px-3 py-2 grid grid-cols-5 gap-1.5 border-b border-white/5">
          {statusFilters.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={cn(
                'px-2 py-2 rounded-lg text-[10px] font-medium transition-all flex flex-col items-center gap-0.5',
                filterStatus === key 
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' 
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white'
              )}
            >
              <span className="text-base">{emoji}</span>
              <span className="truncate w-full text-center">{statusCounts[key]}</span>
            </button>
          ))}
        </div>

        {/* Attendant Filter */}
        <div className="px-3 py-2 flex gap-2 border-b border-white/5">
          {attendantFilters.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFilterAttendant(key)}
              className={cn(
                'flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5',
                filterAttendant === key 
                  ? key === 'aline' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : key === 'vendedor'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-700 text-white border border-white/10'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-transparent'
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{label}</span>
              <span className="ml-1 text-[10px] opacity-70">({attendantCounts[key]})</span>
            </button>
          ))}
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-sm text-slate-400">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-slate-600" />
              </div>
              <p className="font-medium text-slate-300">Nenhuma conversa</p>
              <p className="text-sm text-slate-500 text-center mt-1">
                {searchTerm ? 'Tente outra busca' : 'As mensagens aparecerão aqui'}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {filteredConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedConversation?.id === conv.id}
                  customerProfile={customerProfiles[conv.contact_number]}
                  alineData={alineStatusMap[conv.contact_number]}
                  onClick={() => setSelectedConversation(conv)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        !selectedConversation && 'hidden md:flex'
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-[72px] px-5 border-b border-white/5 flex items-center justify-between bg-slate-900/80 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden shrink-0 -ml-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                
                <div className="relative">
                  {customerProfiles[selectedConversation.contact_number]?.profile_pic_url ? (
                    <img
                      src={customerProfiles[selectedConversation.contact_number].profile_pic_url}
                      alt={selectedConversation.contact_name || 'Cliente'}
                      className="w-11 h-11 rounded-2xl object-cover shadow-lg"
                    />
                  ) : (
                    <div className={cn(
                      'w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-semibold text-white shadow-lg',
                      selectedConversation.platform === 'instagram' 
                        ? 'bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400' 
                        : 'bg-gradient-to-br from-emerald-400 to-cyan-500'
                    )}>
                      {(selectedConversation.contact_name || selectedConversation.contact_number).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Indicador de online do cliente - verde pulsante quando tiver atividade recente */}
                  {(() => {
                    const alineConv = alineStatusMap[selectedConversation.contact_number];
                    // Considerar "online" se teve mensagem nos últimos 5 minutos
                    const isRecentlyActive = messages.length > 0 && messages[messages.length - 1]?.created_at && 
                      new Date().getTime() - new Date(messages[messages.length - 1].created_at!).getTime() < 5 * 60 * 1000;
                    
                    if (isRecentlyActive) {
                      return (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" title="Ativo recentemente" />
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white truncate">{selectedConversation.contact_name || selectedConversation.contact_number}</p>
                    {/* Indicador de Atendimento */}
                    {alineStatus && (
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shrink-0',
                        alineStatus === 'human_takeover' 
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      )}>
                        {alineStatus === 'human_takeover' ? (
                          <>
                            <User className="w-3 h-3" />
                            Vendedor
                          </>
                        ) : (
                          <>
                            <Bot className="w-3 h-3" />
                            Aline
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <span>{selectedConversation.contact_number}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                    <LeadStatusBadge status={(selectedConversation.lead_status as LeadStatus) || 'novo'} />
                    {/* Mostrar vendedor atribuído */}
                    {alineStatusMap[selectedConversation.contact_number]?.assigned_seller_name && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-600" />
                        <span className="flex items-center gap-1 text-amber-400">
                          <UserCheck className="w-3 h-3" />
                          {alineStatusMap[selectedConversation.contact_number]?.assigned_seller_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <LeadStatusSelect
                  value={(selectedConversation.lead_status as LeadStatus) || 'novo'}
                  onChange={(status) => updateLeadStatus(selectedConversation.id, status)}
                  disabled={updatingLeadStatus}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-slate-800 border-white/10">
                    <DropdownMenuItem 
                      onClick={() => handleTakeover('takeover')}
                      disabled={takingOver}
                      className="text-slate-200 focus:bg-white/10 focus:text-white"
                    >
                      <UserCheck className="w-4 h-4 mr-2" />
                      Assumir atendimento
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleTakeover('release')}
                      disabled={takingOver}
                      className="text-slate-200 focus:bg-white/10 focus:text-white"
                    >
                      <Bot className="w-4 h-4 mr-2" />
                      Devolver para Aline
                    </DropdownMenuItem>
                    {/* Opção de atribuir vendedor - apenas para admin/gerente */}
                    {(isAdmin || isGerente) && (
                      <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem 
                          onClick={() => setAssignDialogOpen(true)}
                          className="text-emerald-400 focus:bg-emerald-500/10 focus:text-emerald-300"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Atribuir vendedor
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem className="text-slate-200 focus:bg-white/10 focus:text-white">
                      <Phone className="w-4 h-4 mr-2" />
                      Ligar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-hidden bg-[#0b141a]" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}>
              <ScrollArea className="h-full" onScrollCapture={handleMessagesScroll}>
                <div ref={messagesContainerRef} className="px-4 md:px-12 lg:px-20 py-4 space-y-1 max-w-4xl mx-auto min-h-full">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-20 h-20 rounded-3xl bg-slate-800/50 flex items-center justify-center mb-4">
                        <Sparkles className="w-10 h-10 text-emerald-500/50" />
                      </div>
                      <p className="text-slate-400 text-center font-medium">Nenhuma mensagem ainda</p>
                      <p className="text-slate-600 text-sm mt-1">Inicie uma conversa</p>
                    </div>
                  ) : (
                    Object.entries(groupedMessages).map(([date, msgs]) => (
                      <div key={date}>
                        {/* Date Separator */}
                        <div className="flex justify-center my-4">
                          <span className="px-4 py-1.5 rounded-xl bg-slate-800/80 text-[11px] text-slate-400 font-medium shadow-lg backdrop-blur-sm">
                            {formatDate(msgs[0].created_at || '')}
                          </span>
                        </div>

                        {/* Messages - Using memoized component */}
                        {msgs.map((message, idx) => (
                          <MessageItem
                            key={message.id}
                            message={message}
                            showTail={idx === 0 || msgs[idx - 1]?.is_from_me !== message.is_from_me}
                          />
                        ))}
                      </div>
                    ))
                  )}
                  
                  {isContactTyping && selectedConversation && (
                    <TypingIndicator contactName={selectedConversation.contact_name || ''} />
                  )}
                  
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </ScrollArea>
            </div>

            {/* Input Area */}
            <div className="px-4 py-3 bg-slate-900/95 backdrop-blur-xl border-t border-white/5 shrink-0">
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
                {/* Recording indicator bar */}
                {isRecording && (
                  <div className="flex items-center justify-between mb-3 px-4 py-2 bg-rose-500/20 border border-rose-500/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-rose-400 font-medium">Gravando áudio</span>
                      <span className="text-rose-300 font-mono">{formatRecordingTime(recordingDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={cancelRecording}
                        className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 h-8 px-3"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={stopRecording}
                        className="bg-rose-500 hover:bg-rose-600 text-white h-8 px-3"
                      >
                        <Square className="w-3 h-3 mr-1.5" />
                        Enviar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  {/* Attachment Button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 h-10 w-10 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || isRecording}
                    title="Anexar arquivo"
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>

                  {/* Screenshot Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 h-10 w-10 transition-colors"
                    onClick={captureAndSendScreenshot}
                    disabled={sending || isRecording}
                    title="Capturar e enviar print"
                  >
                    <Camera className="w-5 h-5" />
                  </Button>
                  
                  {/* Input Container */}
                  <div className="flex-1 relative bg-slate-800/60 rounded-2xl border border-white/5 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Digite uma mensagem..."
                      className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0 h-11 px-4 pr-12 text-[15px]"
                      disabled={sending || isRecording}
                    />
                    
                    {/* Send while typing button - inside input */}
                    {newMessage.trim() && (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={sending}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-md transition-all"
                        title="Enviar (Enter)"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Main action button - Audio or Send */}
                  {!isRecording && (
                    <Button
                      type="button"
                      size="icon"
                      className="shrink-0 rounded-xl h-10 w-10 transition-all bg-slate-800/80 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400"
                      onClick={startRecording}
                      disabled={sending}
                      title="Gravar áudio"
                    >
                      <Mic className="w-5 h-5" />
                    </Button>
                  )}
                </div>
                
                {/* Helper text */}
                <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    Anexos
                  </span>
                  <span className="flex items-center gap-1">
                    <Camera className="w-3 h-3" />
                    Print
                  </span>
                  <span className="flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    Áudio
                  </span>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-900/50">
            <div className="text-center">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-6">
                <MessageCircle className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Chat CRM</h2>
              <p className="text-slate-400 max-w-sm">
                Selecione uma conversa para começar a atender seus leads
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Seller Tools Panel - Icon toolbar */}
      {selectedConversation && (
        <div className="hidden lg:block shrink-0">
          <SellerToolsPanel
            phone={selectedConversation.contact_number}
            contactName={selectedConversation.contact_name || ''}
            conversationId={selectedConversation.id}
            onSendMessage={sendMessageDirect}
          />
        </div>
      )}

      {/* Dialog para atribuir vendedor (apenas admin/gerente) */}
      {selectedConversation && (isAdmin || isGerente) && (
        <AssignSellerDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          conversationPhone={selectedConversation.contact_number}
          currentSellerId={alineStatusMap[selectedConversation.contact_number]?.assigned_seller_id}
          currentSellerName={alineStatusMap[selectedConversation.contact_number]?.assigned_seller_name}
          onAssigned={() => {
            fetchConversations(false);
            fetchAlineStatus(selectedConversation.contact_number);
          }}
        />
      )}
    </div>
  );
};

export default Chat;
