import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, UserCheck, Bot, ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AssignmentEvent {
  id: string;
  ts: string;
  payload: {
    action: string;
    previous_status: string;
    new_status: string;
    seller_id: string | null;
    seller_name: string | null;
    reason: string | null;
    timestamp: string;
  };
}

interface AssignmentHistoryPanelProps {
  phone: string;
}

const AssignmentHistoryPanel = ({ phone }: AssignmentHistoryPanelProps) => {
  const [events, setEvents] = useState<AssignmentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!phone) return;

      setLoading(true);
      try {
        const normalizedPhone = phone.replace(/\D/g, '');
        
        const { data, error } = await supabase
          .from('conversation_events')
          .select('id, ts, payload')
          .eq('phone', normalizedPhone)
          .eq('type', 'assignment')
          .order('ts', { ascending: false })
          .limit(20);

        if (error) throw error;
        setEvents((data as AssignmentEvent[]) || []);
      } catch (error) {
        console.error('Error fetching assignment history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [phone]);

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'takeover':
        return 'Atendimento assumido';
      case 'auto_forward':
        return 'Encaminhado automaticamente';
      case 'release':
        return 'Devolvido para Aline';
      default:
        return action;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'takeover':
      case 'auto_forward':
        return <UserCheck className="w-4 h-4 text-emerald-400" />;
      case 'release':
        return <Bot className="w-4 h-4 text-cyan-400" />;
      default:
        return <ArrowRight className="w-4 h-4 text-slate-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'takeover':
        return 'border-l-emerald-500 bg-emerald-500/5';
      case 'auto_forward':
        return 'border-l-amber-500 bg-amber-500/5';
      case 'release':
        return 'border-l-cyan-500 bg-cyan-500/5';
      default:
        return 'border-l-slate-500 bg-slate-500/5';
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="w-5 h-5 mx-auto border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 mt-2">Carregando histórico...</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-6 text-center">
        <History className="w-10 h-10 mx-auto mb-3 text-slate-600" />
        <p className="text-sm text-slate-400">Nenhum histórico de atribuição</p>
        <p className="text-xs text-slate-500 mt-1">
          Os eventos aparecerão aqui quando houver atribuições
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-1 py-2">
        <History className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-medium text-slate-400 uppercase">
          Histórico de Atribuições ({events.length})
        </span>
      </div>
      
      <ScrollArea className="max-h-[300px]">
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className={cn(
                'p-3 rounded-lg border-l-2 transition-colors',
                getActionColor(event.payload.action)
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getActionIcon(event.payload.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">
                      {getActionLabel(event.payload.action)}
                    </p>
                  </div>
                  
                  {event.payload.seller_name && (
                    <p className="text-sm text-emerald-400 mt-0.5">
                      {event.payload.seller_name}
                    </p>
                  )}
                  
                  {event.payload.reason && (
                    <p className="text-xs text-slate-400 mt-1">
                      {event.payload.reason}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>
                      {format(new Date(event.ts), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AssignmentHistoryPanel;
