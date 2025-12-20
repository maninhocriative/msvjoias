import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, Clock, Instagram, Phone, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface PendingUser {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  instagram: string | null;
  created_at: string;
}

interface PendingUsersSectionProps {
  onApprovalChange?: () => void;
}

export const PendingUsersSection = ({ onApprovalChange }: PendingUsersSectionProps) => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, avatar_url, phone, instagram, created_at')
        .eq('approved', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUsers(data || []);
    } catch (error) {
      console.error('Error fetching pending users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string, userName: string) => {
    setProcessingId(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq('id', userId);

      if (error) throw error;

      // Send approval email notification
      try {
        await supabase.functions.invoke('send-approval-email', {
          body: { userId, userName },
        });
      } catch (emailError) {
        console.error('Error sending approval email:', emailError);
      }

      toast({
        title: 'Usuário aprovado',
        description: `${userName} agora tem acesso ao sistema.`,
      });

      fetchPendingUsers();
      onApprovalChange?.();
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível aprovar o usuário.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string, userName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o cadastro de ${userName}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setProcessingId(userId);
    try {
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });

      if (error) throw error;

      toast({
        title: 'Usuário excluído',
        description: `${userName} foi removido do sistema.`,
      });

      fetchPendingUsers();
      onApprovalChange?.();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o usuário.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getDisplayName = (user: PendingUser) => {
    if (user.full_name) return user.full_name;
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return 'Sem nome';
  };

  const getInitials = (user: PendingUser) => {
    const name = getDisplayName(user);
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (pendingUsers.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6 border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-amber-600 dark:text-amber-500" />
          <span>Cadastros Pendentes</span>
          <span className="ml-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500 text-white">
            {pendingUsers.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3">
          {pendingUsers.map((pendingUser) => (
            <div
              key={pendingUser.id}
              className="flex items-center justify-between p-4 bg-background rounded-lg border cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/users/${pendingUser.id}`)}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Avatar className="w-12 h-12 border-2 border-muted">
                  <AvatarImage src={pendingUser.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                    {getInitials(pendingUser)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">
                    {getDisplayName(pendingUser)}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    {pendingUser.instagram && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Instagram className="w-3.5 h-3.5" />
                        @{pendingUser.instagram.replace('@', '')}
                      </span>
                    )}
                    {pendingUser.phone && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        {pendingUser.phone}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(pendingUser.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove(pendingUser.id, getDisplayName(pendingUser));
                  }}
                  disabled={processingId === pendingUser.id}
                  className="gap-1.5"
                >
                  {processingId === pendingUser.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReject(pendingUser.id, getDisplayName(pendingUser));
                  }}
                  disabled={processingId === pendingUser.id}
                  className="gap-1.5 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                >
                  <X className="w-4 h-4" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};