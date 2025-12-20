import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, Trash2, Users, Shield, UserCog, ShoppingBag, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole, AppRole } from '@/hooks/useUserRole';
import { useNavigate } from 'react-router-dom';
import { InviteUserDialog } from '@/components/users/InviteUserDialog';
import { PendingUsersSection } from '@/components/users/PendingUsersSection';

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
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

const roleColors: Record<string, string> = {
  admin: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  gerente: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  vendedor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const UsersPage = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
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
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, created_at')
        .eq('approved', true);

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role');

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: '',
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
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
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('id', editingUser.role_id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Permissão removida!' });
      } else if (editingUser.role_id && selectedRole) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: selectedRole })
          .eq('id', editingUser.role_id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Permissão atualizada!' });
      } else if (!editingUser.role_id && selectedRole) {
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

  const openDeleteDialog = (user: UserWithRole) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleteDialogOpen(false);
    setDeletingId(userToDelete.id);
    try {
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId: userToDelete.id },
      });

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Usuário excluído!' });
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o usuário.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
      setUserToDelete(null);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (roleLoading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie permissões e acessos</p>
        </div>
        <InviteUserDialog onSuccess={fetchUsers} />
      </div>

      {/* Pending approvals section */}
      <PendingUsersSection onApprovalChange={fetchUsers} />

      {/* Permissions legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card className="border-rose-200 dark:border-rose-900/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
              <Shield className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Administrador</p>
              <p className="text-xs text-muted-foreground">Acesso total ao sistema</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-900/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <UserCog className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Gerente</p>
              <p className="text-xs text-muted-foreground">Produtos, estoque e relatórios</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Vendedor</p>
              <p className="text-xs text-muted-foreground">Visualizar e gerenciar pedidos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Usuários Ativos
            <span className="ml-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground">
              {users.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Nenhum usuário encontrado</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Avatar className="w-10 h-10 border">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {user.full_name || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Desde {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      {user.role ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                          {roleIcons[user.role]}
                          {roleLabels[user.role]}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem permissão</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditRole(user);
                      }}
                      title="Editar permissão"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(user);
                      }}
                      disabled={deletingId === user.id}
                      title="Excluir usuário"
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      {deletingId === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit role dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editar Permissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12">
                <AvatarImage src={editingUser?.avatar_url || undefined} />
                <AvatarFallback className="bg-muted">
                  {getInitials(editingUser?.full_name || null)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{editingUser?.full_name || 'Sem nome'}</p>
                <p className="text-sm text-muted-foreground">
                  {editingUser?.role ? roleLabels[editingUser.role] : 'Sem permissão'}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Nova Permissão</Label>
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-semibold">{userToDelete?.full_name || 'este usuário'}</span>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersPage;