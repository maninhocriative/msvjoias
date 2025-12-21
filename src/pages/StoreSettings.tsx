import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Percent, RefreshCw, Bell, Phone } from 'lucide-react';

interface StoreSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

const StoreSettings = () => {
  const [settings, setSettings] = useState<StoreSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [cashbackPercentage, setCashbackPercentage] = useState('5');
  const [notificationWhatsapp, setNotificationWhatsapp] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('store_settings')
        .select('*');

      if (error) throw error;
      
      setSettings(data || []);
      
      const cashbackSetting = data?.find(s => s.key === 'cashback_percentage');
      if (cashbackSetting) {
        setCashbackPercentage(cashbackSetting.value);
      }

      const notificationSetting = data?.find(s => s.key === 'notification_whatsapp');
      if (notificationSetting) {
        setNotificationWhatsapp(notificationSetting.value);
      }
    } catch (error: any) {
      toast.error('Erro ao carregar configurações: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    setSaving(key);
    try {
      const existingSetting = settings.find(s => s.key === key);
      
      if (existingSetting) {
        const { error } = await supabase
          .from('store_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('store_settings')
          .insert({ key, value });
        if (error) throw error;
      }

      toast.success('Configuração salva com sucesso!');
      fetchSettings();
    } catch (error: any) {
      toast.error('Erro ao salvar configuração: ' + error.message);
    } finally {
      setSaving(null);
    }
  };

  const saveCashbackPercentage = async () => {
    const percentage = parseFloat(cashbackPercentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      toast.error('Porcentagem deve ser entre 0 e 100');
      return;
    }
    await saveSetting('cashback_percentage', cashbackPercentage);
  };

  const saveNotificationWhatsapp = async () => {
    const cleaned = notificationWhatsapp.replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 13) {
      toast.error('Número de telefone inválido. Use o formato: 5592984145531');
      return;
    }
    await saveSetting('notification_whatsapp', cleaned);
  };

  const formatPhoneDisplay = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 12) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold">Configurações da Loja</h1>
        <p className="text-muted-foreground">Gerencie as configurações gerais do sistema</p>
      </div>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notificações de Pedidos
          </CardTitle>
          <CardDescription>
            Configure o número de WhatsApp para receber notificações quando novos pedidos entrarem no CRM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notification-whatsapp">Número do WhatsApp</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="notification-whatsapp"
                  type="text"
                  placeholder="5592984145531"
                  value={notificationWhatsapp}
                  onChange={(e) => setNotificationWhatsapp(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={saveNotificationWhatsapp} disabled={saving === 'notification_whatsapp'}>
                {saving === 'notification_whatsapp' ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Formato: código do país + DDD + número (ex: 5592984145531)
            </p>
            {notificationWhatsapp && (
              <p className="text-sm text-muted-foreground">
                Número formatado: <span className="font-medium">{formatPhoneDisplay(notificationWhatsapp)}</span>
              </p>
            )}
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Como funciona:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Quando um novo pedido pendente for criado, você receberá uma mensagem neste WhatsApp</li>
              <li>A notificação inclui dados do cliente, produto, tamanho e valor</li>
              <li>Deixe em branco para desativar as notificações</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Cashback Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Programa de Fidelidade
          </CardTitle>
          <CardDescription>
            Configure a porcentagem de cashback que os clientes recebem em cada compra
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cashback">Porcentagem de Cashback (%)</Label>
            <div className="flex gap-2">
              <Input
                id="cashback"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={cashbackPercentage}
                onChange={(e) => setCashbackPercentage(e.target.value)}
                className="max-w-32"
              />
              <Button onClick={saveCashbackPercentage} disabled={saving === 'cashback_percentage'}>
                {saving === 'cashback_percentage' ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Ex: Se definido como 5%, uma compra de R$100 gera R$5 de cashback para o cliente.
            </p>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Como funciona:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>O cashback é creditado automaticamente ao finalizar uma venda vinculada a um cliente</li>
              <li>O cliente pode usar o saldo acumulado como desconto em compras futuras</li>
              <li>Você pode ajustar manualmente o saldo de qualquer cliente na página de Clientes</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreSettings;
