import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  Camera, 
  Check, 
  X, 
  Loader2, 
  User, 
  Mail, 
  Phone, 
  Instagram,
  Calendar,
  Shield,
  UserCog,
  ShoppingBag,
  Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole, AppRole } from '@/hooks/useUserRole';
import { z } from 'zod';

interface UserProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  instagram: string | null;
  avatar_url: string | null;
  approved: boolean;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

interface UserRoleData {
  id: string;
  role: AppRole;
}

const profileSchema = z.object({
  firstName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(50),
  lastName: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres').max(50),
  phone: z.string().min(10, 'Telefone inválido').max(20),
  instagram: z.string().min(1, 'Instagram é obrigatório').max(50),
});

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

const UserDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para acessar esta página.',
        variant: 'destructive',
      });
      navigate('/users');
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin && id) {
      fetchUserData();
    }
  }, [isAdmin, id]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const fetchUserData = async () => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (profileError) throw profileError;

      setProfile(profileData);
      setFirstName(profileData.first_name || '');
      setLastName(profileData.last_name || '');
      setPhone(profileData.phone || '');
      setInstagram(profileData.instagram || '');
      setAvatarUrl(profileData.avatar_url);

      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('id, role')
        .eq('user_id', id)
        .maybeSingle();

      if (roleData) {
        setUserRole(roleData);
        setSelectedRole(roleData.role);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do usuário.',
        variant: 'destructive',
      });
      navigate('/users');
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 400, height: 400 } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível acessar a câmera.',
        variant: 'destructive',
      });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = 400;
      canvas.height = 400;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(200, 200, 200, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(video, 0, 0, 400, 400);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
            setAvatarFile(file);
            setAvatarUrl(URL.createObjectURL(blob));
          }
        }, 'image/jpeg', 0.9);
      }
      
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate avatar is required
    if (!avatarUrl && !avatarFile) {
      setErrors({ avatar: 'Foto é obrigatória' });
      toast({
        title: 'Foto obrigatória',
        description: 'O usuário precisa ter uma foto.',
        variant: 'destructive',
      });
      return;
    }

    try {
      profileSchema.parse({
        firstName,
        lastName,
        phone,
        instagram,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
        return;
      }
    }

    setSaving(true);

    try {
      let uploadedAvatarUrl = avatarUrl;

      // Upload new avatar if captured
      if (avatarFile && id) {
        const fileName = `${id}/avatar.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(fileName, avatarFile, { upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('chat-media')
            .getPublicUrl(fileName);
          uploadedAvatarUrl = publicUrl;
        }
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          phone,
          instagram,
          avatar_url: uploadedAvatarUrl,
        })
        .eq('id', id);

      if (profileError) throw profileError;

      // Handle role update
      if (userRole && selectedRole) {
        // Update existing role
        await supabase
          .from('user_roles')
          .update({ role: selectedRole })
          .eq('id', userRole.id);
      } else if (userRole && !selectedRole) {
        // Remove role
        await supabase
          .from('user_roles')
          .delete()
          .eq('id', userRole.id);
      } else if (!userRole && selectedRole) {
        // Create new role
        await supabase
          .from('user_roles')
          .insert([{ user_id: id, role: selectedRole }]);
      }

      toast({
        title: 'Sucesso',
        description: 'Dados do usuário atualizados!',
      });

      navigate('/users');
    } catch (error) {
      console.error('Error saving user:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar os dados.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (roleLoading || loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin || !profile) {
    return null;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/users')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            Detalhes do Usuário
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize e edite os dados do usuário
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-border mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Foto do Usuário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              {showCamera ? (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-40 h-40 rounded-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2 mt-4 justify-center">
                    <Button
                      type="button"
                      size="sm"
                      onClick={capturePhoto}
                      className="gap-1"
                    >
                      <Check className="w-4 h-4" />
                      Capturar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={stopCamera}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Avatar className={`w-40 h-40 border-4 ${errors.avatar ? 'border-red-500' : 'border-border'}`}>
                    <AvatarImage src={avatarUrl || undefined} alt="Foto do usuário" />
                    <AvatarFallback className="text-3xl">
                      {getInitials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startCamera}
                    className="gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    {avatarUrl ? 'Tirar nova foto' : 'Tirar foto'}
                  </Button>
                  {errors.avatar && (
                    <p className="text-xs text-red-500">{errors.avatar}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Nome"
                    className={`pl-10 ${errors.firstName ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.firstName && (
                  <p className="text-xs text-red-500">{errors.firstName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Sobrenome *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Sobrenome"
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && (
                  <p className="text-xs text-red-500">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.phone && (
                <p className="text-xs text-red-500">{errors.phone}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram *</Label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="instagram"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@usuario"
                  className={`pl-10 ${errors.instagram ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.instagram && (
                <p className="text-xs text-red-500">{errors.instagram}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Permissão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="role">Nível de Acesso</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma permissão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="gerente">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-4 h-4" />
                      Gerente
                    </div>
                  </SelectItem>
                  <SelectItem value="vendedor">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4" />
                      Vendedor
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {selectedRole && (
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedRole === 'admin' && 'Acesso total: usuários, produtos, estoque, pedidos e relatórios'}
                  {selectedRole === 'gerente' && 'Produtos, estoque, pedidos e relatórios'}
                  {selectedRole === 'vendedor' && 'Visualizar produtos e gerenciar pedidos'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Informações do Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Cadastro:</span>
              <span>{new Date(profile.created_at).toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Status:</span>
              <span className={profile.approved ? 'text-green-600' : 'text-yellow-600'}>
                {profile.approved ? 'Aprovado' : 'Pendente'}
              </span>
            </div>
            {profile.approved_at && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Aprovado em:</span>
                <span>{new Date(profile.approved_at).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/users')}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="flex-1 gap-2">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default UserDetail;
