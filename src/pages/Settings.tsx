import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle } from 'lucide-react';

const Settings = () => {
  const { toast } = useToast();
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);

  const handleWhatsAppConnect = () => {
    toast({
      title: 'WhatsApp Business',
      description: 'O WhatsApp já está conectado via Fiqon/automação. As mensagens são recebidas pelo webhook.',
    });
    setWhatsappConnected(true);
  };

  const handleInstagramConnect = () => {
    toast({
      title: 'Instagram',
      description: 'Para conectar o Instagram, você precisa criar um App no Facebook Developers e configurar a API do Instagram Graph.',
    });
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie as configurações do sistema</p>
      </div>

      <div className="space-y-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Webhook de Automação</CardTitle>
            <CardDescription>URL para receber mensagens da sua automação (Fiqon, n8n, Make, etc.)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value="https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/automation-webhook"
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText('https://ahbjwpkpxqqrpvpzmqwa.supabase.co/functions/v1/automation-webhook');
                    toast({ title: 'Copiado!', description: 'URL do webhook copiada.' });
                  }}
                >
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure sua automação para enviar mensagens via POST para esta URL
              </p>
            </div>
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
                <div className="w-10 h-10 rounded-lg bg-green-500 text-white flex items-center justify-center font-bold">
                  W
                </div>
                <div>
                  <p className="font-medium text-foreground">WhatsApp Business</p>
                  <p className="text-sm text-muted-foreground">
                    {whatsappConnected ? 'Conectado via Fiqon' : 'Conecte via automação (Fiqon, n8n, Make)'}
                  </p>
                </div>
              </div>
              {whatsappConnected ? (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Conectado</span>
                </div>
              ) : (
                <Button variant="outline" onClick={handleWhatsAppConnect}>Conectar</Button>
              )}
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-500 text-white flex items-center justify-center font-bold">
                  I
                </div>
                <div>
                  <p className="font-medium text-foreground">Instagram</p>
                  <p className="text-sm text-muted-foreground">
                    {instagramConnected ? 'Conectado via API' : 'Conecte via Facebook Developers'}
                  </p>
                </div>
              </div>
              {instagramConnected ? (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Conectado</span>
                </div>
              ) : (
                <Button variant="outline" onClick={handleInstagramConnect}>Conectar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
