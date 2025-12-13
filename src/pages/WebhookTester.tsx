import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Send, CheckCircle, XCircle, Loader2, Copy } from 'lucide-react';

const WebhookTester = () => {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [platform, setPlatform] = useState('whatsapp');
  const [messageType, setMessageType] = useState('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ success: boolean; data?: unknown; error?: string } | null>(null);

  const handleTest = async () => {
    if (!phone.trim()) {
      toast({ title: 'Erro', description: 'Telefone é obrigatório', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      const payload: Record<string, string> = {
        phone: phone.trim(),
        message: message.trim(),
        platform,
        message_type: messageType,
      };

      if (mediaUrl.trim()) {
        payload.media_url = mediaUrl.trim();
      }

      console.log('Sending payload:', JSON.stringify(payload, null, 2));

      const { data, error } = await supabase.functions.invoke('automation-send', {
        body: payload,
      });

      if (error) {
        console.error('Function error:', error);
        setResponse({ success: false, error: error.message });
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        console.log('Function response:', data);
        setResponse({ success: true, data });
        toast({ title: 'Sucesso', description: 'Requisição enviada com sucesso!' });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('Request error:', err);
      setResponse({ success: false, error: errorMessage });
      toast({ title: 'Erro', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getPayloadPreview = () => {
    const payload: Record<string, string> = {
      phone: phone.trim() || '5511999999999',
      message: message.trim() || 'Mensagem de teste',
      platform,
      message_type: messageType,
    };
    if (mediaUrl.trim()) {
      payload.media_url = mediaUrl.trim();
    }
    return JSON.stringify(payload, null, 2);
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(getPayloadPreview());
    toast({ title: 'Copiado!', description: 'Payload copiado para a área de transferência' });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Testador de Webhook</h1>
          <p className="text-muted-foreground">Teste a função automation-send diretamente do app</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Parâmetros</CardTitle>
              <CardDescription>Configure os dados da requisição</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input
                  id="phone"
                  placeholder="5511999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  placeholder="Digite a mensagem de teste..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={messageType} onValueChange={setMessageType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="audio">Áudio</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                      <SelectItem value="document">Documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mediaUrl">URL da Mídia (opcional)</Label>
                <Input
                  id="mediaUrl"
                  placeholder="https://..."
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
              </div>

              <Button onClick={handleTest} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Testar Função
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Preview do Payload</CardTitle>
                  <Button variant="ghost" size="sm" onClick={copyPayload}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
                  {getPayloadPreview()}
                </pre>
              </CardContent>
            </Card>

            {response && (
              <Card className={response.success ? 'border-green-500' : 'border-destructive'}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {response.success ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        Sucesso
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-destructive" />
                        Erro
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(response.success ? response.data : { error: response.error }, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">URL da Função</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="bg-muted p-2 rounded text-xs block break-all">
                  https://ahbjwpkpxqqrpvpzmqwa.functions.supabase.co/automation-send
                </code>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default WebhookTester;
