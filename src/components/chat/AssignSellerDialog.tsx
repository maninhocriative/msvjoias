import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, UserCheck, Loader2, Circle, Check, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import AssignmentHistoryPanel from './AssignmentHistoryPanel';

interface SellerWithPresence {
  user_id: string;
  full_name: string | null;
  is_online: boolean;
  last_seen_at: string | null;
}

interface AssignSellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationPhone: string;
  currentSellerId?: string;
  currentSellerName?: string;
  onAssigned: () => void;
}

const AssignSellerDialog = ({
  open,
  onOpenChange,
  conversationPhone,
  currentSellerId,
  currentSellerName,
  onAssigned,
}: AssignSellerDialogProps) => {
  const [sellers, setSellers] = useState<SellerWithPresence[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchSellers();
    }
  }, [open]);

  const fetchSellers = async () => {
    setLoading(true);
    try {
      // Buscar vendedores com presença
      const { data: presenceData, error: presenceError } = await supabase
        .from('seller_presence')
        .select('user_id, full_name, is_online, last_seen_at')
        .order('is_online', { ascending: false })
        .order('last_seen_at', { ascending: false });

      if (presenceError) throw presenceError;

      // Também buscar todos os vendedores e gerentes do user_roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['vendedor', 'gerente', 'admin']);

      if (rolesError) throw rolesError;

      // Buscar perfis dos usuários com role
      const userIds = rolesData?.map(r => r.user_id) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      // Combinar dados: priorizar seller_presence, adicionar perfis que não estão lá
      const presenceMap = new Map<string, SellerWithPresence>();
      
      presenceData?.forEach(p => {
        presenceMap.set(p.user_id, {
          ...p,
          is_online: p.is_online && new Date(p.last_seen_at || 0).getTime() > Date.now() - 5 * 60 * 1000
        });
      });

      // Adicionar perfis que não estão no presence
      profilesData?.forEach(profile => {
        if (!presenceMap.has(profile.id)) {
          presenceMap.set(profile.id, {
            user_id: profile.id,
            full_name: profile.full_name,
            is_online: false,
            last_seen_at: null,
          });
        }
      });

      // Converter para array e ordenar
      const allSellers = Array.from(presenceMap.values()).sort((a, b) => {
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;
        return (a.full_name || '').localeCompare(b.full_name || '');
      });

      setSellers(allSellers);
    } catch (error) {
      console.error('Error fetching sellers:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar vendedores',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (sellerId: string, sellerName: string) => {
    setAssigning(sellerId);
    try {
      const { error } = await supabase.functions.invoke('aline-takeover', {
        body: {
          phone: conversationPhone,
          action: 'takeover',
          assignedSellerId: sellerId,
          assignedSellerName: sellerName,
          reason: 'Atribuído manualmente por administrador',
        },
      });

      if (error) throw error;

      toast({
        title: '✅ Vendedor atribuído',
        description: `${sellerName} agora está atendendo esta conversa`,
      });

      onAssigned();
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning seller:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atribuir o vendedor',
        variant: 'destructive',
      });
    } finally {
      setAssigning(null);
    }
  };

  const formatLastSeen = (date: string | null) => {
    if (!date) return 'nunca';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${diffDays}d atrás`;
  };

  const onlineSellers = sellers.filter(s => s.is_online);
  const offlineSellers = sellers.filter(s => !s.is_online);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            Atribuir Vendedor
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Selecione um vendedor para atender esta conversa
          </DialogDescription>
        </DialogHeader>

        {currentSellerName && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-2">
            <p className="text-sm text-amber-400">
              <strong>Atualmente:</strong> {currentSellerName} está atendendo
            </p>
          </div>
        )}

        <Tabs defaultValue="assign" className="w-full">
          <TabsList className="w-full bg-slate-800/50 border border-white/10">
            <TabsTrigger 
              value="assign" 
              className="flex-1 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
            >
              <UserCheck className="w-4 h-4 mr-2" />
              Atribuir
            </TabsTrigger>
            <TabsTrigger 
              value="history" 
              className="flex-1 data-[state=active]:bg-slate-700 data-[state=active]:text-white"
            >
              <History className="w-4 h-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="assign" className="mt-4">
            <ScrollArea className="max-h-[400px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              ) : sellers.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum vendedor encontrado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Vendedores Online */}
                  {onlineSellers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-400 uppercase">
                          Online ({onlineSellers.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {onlineSellers.map((seller) => (
                          <button
                            key={seller.user_id}
                            onClick={() => handleAssign(seller.user_id, seller.full_name || 'Vendedor')}
                            disabled={assigning === seller.user_id}
                            className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left',
                              'bg-slate-800/50 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20',
                              currentSellerId === seller.user_id && 'border-amber-500/30 bg-amber-500/10'
                            )}
                          >
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-semibold">
                                {(seller.full_name || 'V').charAt(0).toUpperCase()}
                              </div>
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white truncate">
                                {seller.full_name || 'Vendedor'}
                              </p>
                              <p className="text-xs text-emerald-400">Disponível agora</p>
                            </div>
                            {currentSellerId === seller.user_id ? (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                Atual
                              </Badge>
                            ) : assigning === seller.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            ) : (
                              <Check className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vendedores Offline */}
                  {offlineSellers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Circle className="w-2 h-2 fill-slate-500 text-slate-500" />
                        <span className="text-xs font-medium text-slate-500 uppercase">
                          Offline ({offlineSellers.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {offlineSellers.map((seller) => (
                          <button
                            key={seller.user_id}
                            onClick={() => handleAssign(seller.user_id, seller.full_name || 'Vendedor')}
                            disabled={assigning === seller.user_id}
                            className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left',
                              'bg-slate-800/30 hover:bg-slate-800/50 border border-transparent hover:border-white/10',
                              currentSellerId === seller.user_id && 'border-amber-500/30 bg-amber-500/10'
                            )}
                          >
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-semibold">
                                {(seller.full_name || 'V').charAt(0).toUpperCase()}
                              </div>
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-slate-600 border-2 border-slate-900 rounded-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-300 truncate">
                                {seller.full_name || 'Vendedor'}
                              </p>
                              <p className="text-xs text-slate-500">
                                Visto {formatLastSeen(seller.last_seen_at)}
                              </p>
                            </div>
                            {currentSellerId === seller.user_id ? (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                Atual
                              </Badge>
                            ) : assigning === seller.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="history" className="mt-4">
            <AssignmentHistoryPanel phone={conversationPhone} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 border-white/10 text-white hover:bg-slate-700"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignSellerDialog;
