import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Clock, LogOut } from 'lucide-react';

const PendingApproval = () => {
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
            <Clock className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Aguardando Aprovação
          </h1>
          <p className="text-muted-foreground">
            Seu cadastro está sendo analisado. Você receberá acesso assim que um administrador aprovar sua conta.
          </p>
        </div>

        {profile && (
          <div className="bg-card border border-border rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground">Cadastrado como</p>
            <p className="font-medium text-foreground">
              {profile.full_name || profile.first_name || 'Usuário'}
            </p>
          </div>
        )}

        <Button
          variant="outline"
          onClick={signOut}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </div>
    </div>
  );
};

export default PendingApproval;
