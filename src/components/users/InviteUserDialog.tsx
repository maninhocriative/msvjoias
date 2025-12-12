import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface InviteUserDialogProps {
  onSuccess: () => void;
}

export const InviteUserDialog = ({ onSuccess }: InviteUserDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('vendedor');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleInvite = async () => {
    if (!email || !password || !fullName) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Create user via signUp (this creates the auth user and triggers profile creation)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Assign role to the new user
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert([{ user_id: authData.user.id, role }]);

        if (roleError) {
          console.error('Error assigning role:', roleError);
          // User was created but role assignment failed
          toast({
            title: 'Aviso',
            description: 'Usuário criado, mas não foi possível atribuir a permissão. Atribua manualmente.',
          });
        } else {
          toast({
            title: 'Sucesso',
            description: 'Usuário criado com sucesso! Um email de confirmação foi enviado.',
          });
        }

        setOpen(false);
        setEmail('');
        setFullName('');
        setPassword('');
        setRole('vendedor');
        onSuccess();
      }
    } catch (error: any) {
      console.error('Error inviting user:', error);
      
      let errorMessage = 'Não foi possível criar o usuário.';
      if (error.message?.includes('already registered')) {
        errorMessage = 'Este email já está cadastrado.';
      }
      
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="w-4 h-4" />
          Adicionar Usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Adicionar Novo Usuário
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome Completo *</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do usuário"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha *</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha inicial"
            />
            <p className="text-xs text-muted-foreground">
              O usuário poderá alterar a senha depois
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Permissão</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">Vendedor</SelectItem>
                <SelectItem value="gerente">Gerente</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleInvite} className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              'Criar Usuário'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
