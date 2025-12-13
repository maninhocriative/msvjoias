import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Percent, RefreshCw } from 'lucide-react';

interface StoreSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

const StoreSettings = () => {
  const [settings, setSettings] = useState<StoreSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cashbackPercentage, setCashbackPercentage] = useState('5');

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
    } catch (error: any) {
      toast.error('Erro ao carregar configurações: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveCashbackPercentage = async () => {
    const percentage = parseFloat(cashbackPercentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      toast.error('Porcentagem deve ser entre 0 e 100');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('store_settings')
        .update({ value: cashbackPercentage })
        .eq('key', 'cashback_percentage');

      if (error) throw error;
      toast.success('Configurações salvas com sucesso!');
      fetchSettings();
    } catch (error: any) {
      toast.error('Erro ao salvar configurações: ' + error.message);
    } finally {
      setSaving(false);
    }
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
              <Button onClick={saveCashbackPercentage} disabled={saving}>
                {saving ? (
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

      {/* Other Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Outras Configurações</CardTitle>
          <CardDescription>
            Configurações adicionais do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm">
            Mais configurações serão adicionadas em breve...
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreSettings;
