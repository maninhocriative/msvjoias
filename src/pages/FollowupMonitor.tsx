import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  RefreshCw, 
  MessageCircle, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Users,
  Send,
  Timer,
  History
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Conversation {
  id: string;
  phone: string;
  status: string;
  followup_count: number;
  last_message_at: string | null;
  created_at: string | null;
}

interface Message {
  id: string;
  role: string;
  message: string;
  created_at: string | null;
  node: string | null;
}

const FOLLOWUP_INTERVALS = [
  { minutes: 3, label: "3 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 120, label: "2 horas" },
  { minutes: 360, label: "6 horas" },
];

export default function FollowupMonitor() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const { toast } = useToast();

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('aline_conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as conversas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('aline_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens",
        variant: "destructive",
      });
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    
    // Auto refresh a cada 30 segundos
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const getFollowupStatus = (followupCount: number, lastMessageAt: string | null) => {
    if (followupCount >= 5) {
      return { label: "Concluído", color: "bg-muted text-muted-foreground", icon: CheckCircle2 };
    }
    
    const nextFollowup = FOLLOWUP_INTERVALS[followupCount];
    if (!nextFollowup) {
      return { label: "Sem mais follow-ups", color: "bg-muted text-muted-foreground", icon: CheckCircle2 };
    }

    if (!lastMessageAt) {
      return { label: `Aguardando ${nextFollowup.label}`, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: Clock };
    }

    const lastTime = new Date(lastMessageAt).getTime();
    const now = Date.now();
    const elapsed = (now - lastTime) / 60000; // minutos
    
    if (elapsed >= nextFollowup.minutes) {
      return { label: "Pronto para enviar", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: Send };
    }

    const remaining = Math.ceil(nextFollowup.minutes - elapsed);
    return { 
      label: `${remaining} min restantes`, 
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", 
      icon: Timer 
    };
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  const activeConversations = conversations.filter(c => c.status === 'active');
  const completedConversations = conversations.filter(c => c.status !== 'active' || c.followup_count >= 5);

  const stats = {
    total: conversations.length,
    active: activeConversations.filter(c => c.followup_count < 5).length,
    waiting: activeConversations.filter(c => {
      const status = getFollowupStatus(c.followup_count, c.last_message_at);
      return status.label.includes("restantes");
    }).length,
    ready: activeConversations.filter(c => {
      const status = getFollowupStatus(c.followup_count, c.last_message_at);
      return status.label === "Pronto para enviar";
    }).length,
    completed: completedConversations.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitor de Follow-ups</h1>
          <p className="text-muted-foreground">
            Acompanhe os follow-ups automáticos enviados pela Aline
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Follow-up</CardTitle>
            <MessageCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
            <Timer className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.waiting}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pronto p/ Enviar</CardTitle>
            <Send className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.ready}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Leads com Follow-up
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Follow-ups Enviados</TableHead>
                <TableHead>Próximo Follow-up</TableHead>
                <TableHead>Última Mensagem</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conv) => {
                const followupStatus = getFollowupStatus(conv.followup_count, conv.last_message_at);
                const StatusIcon = followupStatus.icon;
                
                return (
                  <TableRow key={conv.id}>
                    <TableCell className="font-mono">
                      {formatPhone(conv.phone)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={conv.status === 'active' ? 'default' : 'secondary'}>
                        {conv.status === 'active' ? 'Ativo' : conv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{conv.followup_count}</span>
                        <span className="text-muted-foreground">/ 5</span>
                        <div className="flex gap-1">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                i < conv.followup_count 
                                  ? 'bg-primary' 
                                  : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={followupStatus.color} variant="secondary">
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {followupStatus.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {conv.last_message_at 
                        ? formatDistanceToNow(new Date(conv.last_message_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {conv.created_at 
                        ? formatDistanceToNow(new Date(conv.created_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedConversation(conv)}
                      >
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Ver Conversa
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog para ver conversa */}
      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Histórico - {selectedConversation && formatPhone(selectedConversation.phone)}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            {messagesLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>Nenhuma mensagem encontrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-primary/10 ml-8'
                        : 'bg-muted mr-8'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {msg.role === 'user' ? 'Cliente' : 'Aline'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {msg.created_at 
                          ? new Date(msg.created_at).toLocaleString('pt-BR')
                          : ''
                        }
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    {msg.node && (
                      <span className="text-xs text-muted-foreground mt-1 block">
                        Node: {msg.node}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
