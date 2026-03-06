import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Send, Eye, Loader2, CheckCircle2, Gift, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DEFAULT_MESSAGE = `🌸 *Feliz Dia da Mulher!* 🌸

Que tal eternizar um momento especial? 💝

Nossos *pingentes em aço inox* com *fotogravação GRÁTIS* são o presente perfeito!

A partir de *R$ 139,00* ✨

📸 Envie a foto que deseja gravar e nós fazemos pra você!

Responda essa mensagem para saber mais! 💬`;

const DEFAULT_VIDEO_URL = 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co/storage/v1/object/public/products/campanha-dia-mulheres.mp4';

interface PreviewResult {
  total_conversations: number;
  buyers_excluded: number;
  already_sent: number;
  eligible: number;
  sample_phones: string[];
}

interface SendResult {
  sent: number;
  failed: number;
  remaining: number;
  total_eligible: number;
  errors: string[];
}

const CampaignBroadcast = () => {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [videoUrl, setVideoUrl] = useState(DEFAULT_VIDEO_URL);
  const [campaignId] = useState(`dia-mulheres-2026-${Date.now()}`);
  const [batchSize, setBatchSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('campaign-broadcast', {
        body: {
          campaign_id: campaignId,
          message,
          video_url: videoUrl || undefined,
          dry_run: true,
        }
      });

      if (error) throw error;
      setPreview(data);
      toast.success(`${data.eligible} clientes elegíveis encontrados`);
    } catch (err) {
      toast.error('Erro ao buscar preview: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!preview || preview.eligible === 0) {
      toast.error('Faça o preview primeiro');
      return;
    }

    const confirmed = window.confirm(
      `⚠️ Tem certeza que deseja enviar para ${Math.min(batchSize, preview.eligible)} clientes?\n\nIntervalo: 30s entre envios\nTempo estimado: ~${Math.min(batchSize, preview.eligible) * 0.5} minutos`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('campaign-broadcast', {
        body: {
          campaign_id: campaignId,
          message,
          video_url: videoUrl || undefined,
          dry_run: false,
          batch_size: batchSize,
        }
      });

      if (error) throw error;
      setSendResult(data);
      toast.success(`${data.sent} mensagens enviadas com sucesso!`);
    } catch (err) {
      toast.error('Erro no envio: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">📢 Campanha Dia das Mulheres</h1>
        <p className="text-muted-foreground mt-1">
          Disparo de vídeo + mensagem promocional para clientes que ainda não compraram
        </p>
      </div>

      {/* Anti-spam notice */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <Shield className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-500">Proteção anti-spam ativa</p>
            <ul className="text-muted-foreground mt-1 space-y-0.5">
              <li>• Intervalo de <strong>30 segundos</strong> entre cada envio</li>
              <li>• Cada cliente recebe <strong>apenas 1 mensagem</strong> (deduplicação por campanha)</li>
              <li>• Clientes que já compraram são <strong>excluídos automaticamente</strong></li>
              <li>• Envio em <strong>lotes controlados</strong></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Message editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mensagem da campanha</CardTitle>
          <CardDescription>Pingentes prata + fotogravação grátis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>URL do vídeo (opcional)</Label>
            <Input 
              value={videoUrl} 
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://... (vídeo da fotogravação)"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Texto da mensagem</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label>Tamanho do lote (por execução)</Label>
            <Input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              min={1}
              max={50}
              className="mt-1 w-32"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tempo estimado: ~{(batchSize * 30 / 60).toFixed(1)} minutos por lote
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handlePreview} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Preview (sem enviar)
        </Button>
        <Button onClick={handleSend} disabled={loading || !preview} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Disparar lote
        </Button>
      </div>

      {/* Preview result */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="w-5 h-5" /> Preview do disparo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{preview.total_conversations}</p>
                <p className="text-xs text-muted-foreground">Total conversas</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-red-500">{preview.buyers_excluded}</p>
                <p className="text-xs text-muted-foreground">Compradores (excluídos)</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-amber-500">{preview.already_sent}</p>
                <p className="text-xs text-muted-foreground">Já receberam</p>
              </div>
              <div className="text-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                <p className="text-2xl font-bold text-emerald-500">{preview.eligible}</p>
                <p className="text-xs text-muted-foreground">Elegíveis para envio</p>
              </div>
            </div>
            {preview.sample_phones.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Amostra: {preview.sample_phones.join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send result */}
      {sendResult && (
        <Card className="border-emerald-500/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Resultado do disparo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                <p className="text-2xl font-bold text-emerald-500">{sendResult.sent}</p>
                <p className="text-xs text-muted-foreground">Enviadas</p>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <p className="text-2xl font-bold text-red-500">{sendResult.failed}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{sendResult.remaining}</p>
                <p className="text-xs text-muted-foreground">Restantes</p>
              </div>
            </div>
            {sendResult.remaining > 0 && (
              <p className="text-sm text-amber-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Clique em "Disparar lote" novamente para continuar com os próximos {Math.min(batchSize, sendResult.remaining)} clientes
              </p>
            )}
            {sendResult.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-red-500">Erros:</p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {sendResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CampaignBroadcast;
