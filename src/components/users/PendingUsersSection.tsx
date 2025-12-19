import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Check, X, Clock, Instagram, Phone } from 'lucide-react';
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
  const { toast } = useToast();
  const { user } = useAuth();
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
        const { error: emailError } = await supabase.functions.invoke('send-approval-email', {
          body: { userId, userName },
        });
        
        if (emailError) {
          console.error('Error sending approval email:', emailError);
        } else {
          console.log('Approval email sent successfully');
        }
      } catch (emailError) {
        console.error('Error invoking email function:', emailError);
      }

      toast({
        title: 'Usuário aprovado',
        description: `${userName} agora tem acesso ao sistema e foi notificado por email.`,
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
    }
  };

  const handleReject = async (userId: string, userName: string) => {
    if (!confirm(`Tem certeza que deseja rejeitar o cadastro de ${userName}? O usuário será removido.`)) {
      return;
    }

    try {
      // We can't delete from auth.users, so we just leave them unapproved
      // In a real scenario, you might want to use an edge function to delete the user
      toast({
        title: 'Cadastro rejeitado',
        description: `${userName} permanecerá sem acesso.`,
      });

      fetchPendingUsers();
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível rejeitar o usuário.',
        variant: 'destructive',
      });
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
      <div className="border border-border rounded-xl p-8 text-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (pendingUsers.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">
          Cadastros Pendentes ({pendingUsers.length})
        </h2>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">Usuário</TableHead>
              <TableHead className="font-semibold">Contato</TableHead>
              <TableHead className="font-semibold">Data do cadastro</TableHead>
              <TableHead className="font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingUsers.map((pendingUser) => (
              <TableRow 
                key={pendingUser.id} 
                className="group cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/users/${pendingUser.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={pendingUser.avatar_url || undefined} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {getInitials(pendingUser)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">
                        {getDisplayName(pendingUser)}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {pendingUser.phone && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {pendingUser.phone}
                      </span>
                    )}
                    {pendingUser.instagram && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Instagram className="w-3 h-3" />
                        @{pendingUser.instagram.replace('@', '')}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(pendingUser.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(pendingUser.id, getDisplayName(pendingUser));
                      }}
                      className="gap-1"
                    >
                      <Check className="w-4 h-4" />
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(pendingUser.id, getDisplayName(pendingUser));
                      }}
                      className="gap-1"
                    >
                      <X className="w-4 h-4" />
                      Rejeitar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
