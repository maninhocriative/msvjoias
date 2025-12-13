import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pencil, Trash2, Users, Shield, UserCog, ShoppingBag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole, AppRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { InviteUserDialog } from '@/components/users/InviteUserDialog';
import { PendingUsersSection } from '@/components/users/PendingUsersSection';

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  role_id: string | null;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
};

const roleIcons: Record<string, React.ReactNode> = {
  admin: <Shield className="w-4 h-4" />,
  gerente: <UserCog className="w-4 h-4" />,
  vendedor: <ShoppingBag className="w-4 h-4" />,
};

const UsersPage = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para acessar esta página.',
        variant: 'destructive',
      });
      navigate('/');
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, created_at');

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role');

      if (rolesError) throw rolesError;

      // Get user emails from auth (via profiles id which is user_id)
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: '', // We'll need to get this from somewhere else or store in profiles
          full_name: profile.full_name,
          role: userRole?.role as AppRole || null,
          role_id: userRole?.id || null,
          created_at: profile.created_at,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os usuários.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditRole = (user: UserWithRole) => {
    setEditingUser(user);
    setSelectedRole(user.role || '');
    setDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;

    try {
      if (editingUser.role_id && !selectedRole) {
        // Remove role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('id', editingUser.role_id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Permissão removida!' });
      } else if (editingUser.role_id && selectedRole) {
        // Update role
        const { error } = await supabase
          .from('user_roles')
          .update({ role: selectedRole })
          .eq('id', editingUser.role_id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Permissão atualizada!' });
      } else if (!editingUser.role_id && selectedRole) {
        // Create role
        const { error } = await supabase
          .from('user_roles')
          .insert([{ user_id: editingUser.id, role: selectedRole }]);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Permissão atribuída!' });
      }

      setDialogOpen(false);
      setEditingUser(null);
      setSelectedRole('');
      fetchUsers();
    } catch (error) {
      console.error('Error saving role:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a permissão.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveRole = async (user: UserWithRole) => {
    if (!user.role_id) return;
    if (!confirm(`Tem certeza que deseja remover a permissão de ${user.full_name || 'este usuário'}?`)) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', user.role_id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Permissão removida!' });
      fetchUsers();
    } catch (error) {
      console.error('Error removing role:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover a permissão.',
        variant: 'destructive',
      });
    }
  };

  if (roleLoading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie permissões e acessos</p>
        </div>
        <InviteUserDialog onSuccess={fetchUsers} />
      </div>

      {/* Pending approvals section */}
      <PendingUsersSection onApprovalChange={fetchUsers} />

      {/* Permissions legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5" />
            <span className="font-semibold">Administrador</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Acesso total: usuários, produtos, estoque, pedidos e relatórios
          </p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <UserCog className="w-5 h-5" />
            <span className="font-semibold">Gerente</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Produtos, estoque, pedidos e relatórios
          </p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-5 h-5" />
            <span className="font-semibold">Vendedor</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Visualizar produtos e gerenciar pedidos
          </p>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">Usuário</TableHead>
              <TableHead className="font-semibold">Permissão</TableHead>
              <TableHead className="font-semibold">Cadastro</TableHead>
              <TableHead className="font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                  Carregando usuários...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Nenhum usuário encontrado</p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{user.full_name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground">ID: {user.id.slice(0, 8)}...</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.role ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-foreground text-background">
                        {roleIcons[user.role]}
                        {roleLabels[user.role]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">Sem permissão</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditRole(user)}
                        title="Editar permissão"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {user.role && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRole(user)}
                          title="Remover permissão"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit role dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar Permissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground">Usuário</p>
              <p className="font-medium">{editingUser?.full_name || 'Sem nome'}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Permissão</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma permissão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveRole} className="w-full">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
