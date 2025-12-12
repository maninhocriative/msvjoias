import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

const Settings = () => {
  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie as configurações do sistema</p>
      </div>

      <div className="space-y-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Conexão Supabase</CardTitle>
            <CardDescription>Configure suas credenciais do Supabase</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supabaseUrl">Supabase URL</Label>
              <Input
                id="supabaseUrl"
                placeholder="https://seu-projeto.supabase.co"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabaseKey">Anon Key</Label>
              <Input
                id="supabaseKey"
                type="password"
                placeholder="••••••••••••••••••••"
                className="font-mono text-sm"
              />
            </div>
            <Button>Salvar Credenciais</Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
            <CardDescription>Configure suas preferências de notificação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Novas mensagens</p>
                <p className="text-sm text-muted-foreground">Receba alertas quando uma nova mensagem chegar</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Novos pedidos</p>
                <p className="text-sm text-muted-foreground">Receba alertas quando um novo pedido for feito</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Sons de notificação</p>
                <p className="text-sm text-muted-foreground">Reproduzir sons ao receber notificações</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Integrações</CardTitle>
            <CardDescription>Conecte serviços externos ao seu sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-foreground text-background flex items-center justify-center font-bold">
                  W
                </div>
                <div>
                  <p className="font-medium text-foreground">WhatsApp Business</p>
                  <p className="text-sm text-muted-foreground">Conecte sua conta do WhatsApp</p>
                </div>
              </div>
              <Button variant="outline">Conectar</Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-foreground text-background flex items-center justify-center font-bold">
                  I
                </div>
                <div>
                  <p className="font-medium text-foreground">Instagram</p>
                  <p className="text-sm text-muted-foreground">Conecte sua conta do Instagram</p>
                </div>
              </div>
              <Button variant="outline">Conectar</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
