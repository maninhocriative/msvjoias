import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email inválido' }),
  password: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
});

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const backendConfigured = isSupabaseConfigured;
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof typeof errors;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        const message = error.message || '';

        if (message.includes('Invalid login credentials')) {
          toast({
            title: 'Erro de Login',
            description: 'Email ou senha incorretos.',
            variant: 'destructive',
          });
        } else if (message.toLowerCase().includes('email not confirmed')) {
          toast({
            title: 'Email não confirmado',
            description: 'Confirme seu email pelo link enviado antes de fazer login.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro',
            description: message,
            variant: 'destructive',
          });
        }
        return;
      }

      toast({
        title: 'Login realizado',
        description: 'Você será redirecionado para o sistema.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-background/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-background/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-background/10 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-background/10 rounded-full" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center items-center w-full px-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-background/10 backdrop-blur-sm mb-8">
              <Sparkles className="w-10 h-10 text-background" />
            </div>
            <h1 className="text-5xl font-bold tracking-[0.4em] text-background mb-4">
              ACIUM
            </h1>
            <p className="text-background/60 text-lg max-w-md">
              Sistema inteligente de gestão e automação para sua loja
            </p>
          </div>
          
          {/* Features list */}
          <div className="mt-16 space-y-4">
            {['Gestão de Produtos', 'Atendimento via WhatsApp', 'Relatórios Inteligentes'].map((feature, i) => (
              <div 
                key={feature}
                className="flex items-center gap-3 text-background/70"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-background/50" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-foreground mb-4">
              <Sparkles className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-3xl font-bold tracking-[0.3em] text-foreground">
              ACIUM
            </h1>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Bem-vindo de volta
            </h2>
            <p className="text-muted-foreground">
              Entre com suas credenciais para acessar o sistema
            </p>
          </div>

          {!backendConfigured && (
            <div className="mb-6 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
              Backend não configurado. Verifique as variáveis de ambiente.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`h-12 px-4 transition-all duration-200 ${
                  errors.email 
                    ? 'border-destructive focus:ring-destructive/20' 
                    : 'focus:ring-2 focus:ring-foreground/10'
                }`}
              />
              {errors.email && (
                <p className="text-xs text-destructive mt-1">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`h-12 px-4 pr-12 transition-all duration-200 ${
                    errors.password 
                      ? 'border-destructive focus:ring-destructive/20' 
                      : 'focus:ring-2 focus:ring-foreground/10'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive mt-1">{errors.password}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]" 
              disabled={loading || !backendConfigured}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Novo por aqui?
              </span>
            </div>
          </div>

          {/* Register Link */}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="w-full h-12 flex items-center justify-center gap-2 border border-border rounded-lg text-foreground hover:bg-secondary transition-all duration-200 font-medium"
          >
            Criar conta com foto
            <span className="text-muted-foreground">→</span>
          </button>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Ao entrar, você concorda com nossos termos de uso
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
