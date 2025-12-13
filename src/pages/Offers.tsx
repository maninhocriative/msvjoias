import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Gift, Percent, Edit, Trash2, ExternalLink, Copy } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { Product } from '@/lib/supabase';

interface Offer {
  id: string;
  product_id: string;
  promotional_price: number;
  start_date: string;
  end_date: string;
  gift_description: string | null;
  active: boolean;
  created_at: string;
  products?: Product;
}

const Offers = () => {
  const { isAdmin, isGerente } = useUserRole();
  const canManage = isAdmin || isGerente;

  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  const [formData, setFormData] = useState({
    product_id: '',
    promotional_price: '',
    start_date: '',
    end_date: '',
    gift_description: '',
    active: true,
  });

  useEffect(() => {
    fetchOffers();
    fetchProducts();
  }, []);

  const fetchOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*, products(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOffers(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar ofertas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar produtos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_id || !formData.promotional_price || !formData.start_date || !formData.end_date) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const offerData = {
        product_id: formData.product_id,
        promotional_price: parseFloat(formData.promotional_price),
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        gift_description: formData.gift_description || null,
        active: formData.active,
      };

      if (editingOffer) {
        const { error } = await supabase
          .from('offers')
          .update(offerData)
          .eq('id', editingOffer.id);

        if (error) throw error;
        toast.success('Oferta atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('offers')
          .insert(offerData);

        if (error) throw error;
        toast.success('Oferta criada com sucesso!');
      }

      setDialogOpen(false);
      resetForm();
      fetchOffers();
    } catch (error: any) {
      toast.error('Erro ao salvar oferta: ' + error.message);
    }
  };

  const handleDelete = async (offer: Offer) => {
    if (!confirm('Excluir esta oferta?')) return;

    try {
      const { error } = await supabase
        .from('offers')
        .delete()
        .eq('id', offer.id);

      if (error) throw error;
      toast.success('Oferta excluída com sucesso!');
      fetchOffers();
    } catch (error: any) {
      toast.error('Erro ao excluir oferta: ' + error.message);
    }
  };

  const toggleActive = async (offer: Offer) => {
    try {
      const { error } = await supabase
        .from('offers')
        .update({ active: !offer.active })
        .eq('id', offer.id);

      if (error) throw error;
      fetchOffers();
    } catch (error: any) {
      toast.error('Erro ao atualizar oferta: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: '',
      promotional_price: '',
      start_date: '',
      end_date: '',
      gift_description: '',
      active: true,
    });
    setEditingOffer(null);
  };

  const openEditDialog = (offer: Offer) => {
    setEditingOffer(offer);
    setFormData({
      product_id: offer.product_id,
      promotional_price: offer.promotional_price.toString(),
      start_date: offer.start_date.slice(0, 16),
      end_date: offer.end_date.slice(0, 16),
      gift_description: offer.gift_description || '',
      active: offer.active,
    });
    setDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getOfferStatus = (offer: Offer) => {
    const now = new Date();
    const start = new Date(offer.start_date);
    const end = new Date(offer.end_date);

    if (!offer.active) return { label: 'Inativa', variant: 'secondary' as const };
    if (now < start) return { label: 'Agendada', variant: 'outline' as const };
    if (now > end) return { label: 'Expirada', variant: 'destructive' as const };
    return { label: 'Ativa', variant: 'default' as const };
  };

  const getDiscountPercentage = (original: number, promo: number) => {
    return Math.round(((original - promo) / original) * 100);
  };

  const copyOfferLink = (offer: Offer) => {
    const link = `${window.location.origin}/offer/${offer.id}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copiado!');
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Ofertas Relâmpago</h1>
          <p className="text-muted-foreground">Gerencie promoções e ofertas especiais</p>
        </div>

        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Oferta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingOffer ? 'Editar Oferta' : 'Nova Oferta'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Select
                    value={formData.product_id}
                    onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} - {formatCurrency(product.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promotional_price">Preço Promocional *</Label>
                  <Input
                    id="promotional_price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.promotional_price}
                    onChange={(e) => setFormData({ ...formData, promotional_price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Início *</Label>
                    <Input
                      id="start_date"
                      type="datetime-local"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">Término *</Label>
                    <Input
                      id="end_date"
                      type="datetime-local"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gift_description">Brinde (opcional)</Label>
                  <Textarea
                    id="gift_description"
                    value={formData.gift_description}
                    onChange={(e) => setFormData({ ...formData, gift_description: e.target.value })}
                    placeholder="Ex: Ganhe um chaveiro exclusivo"
                    rows={2}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Oferta ativa</Label>
                  <Switch
                    id="active"
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingOffer ? 'Salvar' : 'Criar Oferta'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Offers Grid */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Gift className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma oferta cadastrada</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {offers.map((offer) => {
            const product = offer.products;
            const status = getOfferStatus(offer);
            const discount = product ? getDiscountPercentage(product.price, offer.promotional_price) : 0;

            return (
              <Card key={offer.id} className={!offer.active ? 'opacity-60' : ''}>
                <CardContent className="p-4 space-y-4">
                  {/* Product Image */}
                  {product?.image_url && (
                    <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                      {discount > 0 && (
                        <div className="absolute top-2 right-2 bg-destructive text-destructive-foreground px-2 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                          <Percent className="w-3 h-3" />
                          {discount}% OFF
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product Info */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {offer.gift_description && (
                        <Badge variant="outline" className="gap-1">
                          <Gift className="w-3 h-3" /> Brinde
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold">{product?.name || 'Produto não encontrado'}</h3>
                    {product && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-muted-foreground line-through text-sm">
                          {formatCurrency(product.price)}
                        </span>
                        <span className="text-lg font-bold text-primary">
                          {formatCurrency(offer.promotional_price)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Gift */}
                  {offer.gift_description && (
                    <div className="p-2 bg-muted rounded text-sm">
                      🎁 {offer.gift_description}
                    </div>
                  )}

                  {/* Dates */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Início: {formatDate(offer.start_date)}</div>
                    <div>Término: {formatDate(offer.end_date)}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => copyOfferLink(offer)}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar Link
                    </Button>
                    {canManage && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(offer)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(offer)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Offers;
