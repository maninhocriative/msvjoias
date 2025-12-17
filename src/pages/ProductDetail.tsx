import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import ProductVariantsDialog from '@/components/products/ProductVariantsDialog';
import { 
  ArrowLeft, 
  Save, 
  Package, 
  Video, 
  Image as ImageIcon, 
  Layers, 
  TrendingUp, 
  ShoppingCart,
  Eye,
  RefreshCw,
  Trash2,
  ExternalLink
} from 'lucide-react';

interface ProductVariant {
  id: string;
  size: string;
  stock: number;
}

interface ProductData {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  price: number | null;
  category: string | null;
  color: string | null;
  image_url: string | null;
  images: string[] | null;
  video_url: string | null;
  tags: string[] | null;
  active: boolean | null;
  min_stock_alert: number | null;
  created_at: string;
}

interface AutomationMetrics {
  sales_count: number;
  search_count: number;
  last_sale_date: string | null;
  conversion_rate: number;
  total_revenue?: number;
  recent_sales_30d?: number;
  orders_count?: number;
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [product, setProduct] = useState<ProductData | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [variantsDialogOpen, setVariantsDialogOpen] = useState(false);
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    price: '',
    category: '',
    color: '',
    video_url: '',
    tags: '',
    min_stock_alert: '',
    active: true,
  });
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);

  useEffect(() => {
    if (id) {
      fetchProduct();
      fetchVariants();
      fetchAutomationMetrics();
    }
  }, [id]);

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({ title: 'Erro', description: 'Produto não encontrado.', variant: 'destructive' });
        navigate('/products');
        return;
      }

      setProduct(data);
      setFormData({
        name: data.name || '',
        sku: data.sku || '',
        description: data.description || '',
        price: data.price?.toString() || '',
        category: data.category || '',
        color: data.color || '',
        video_url: data.video_url || '',
        tags: data.tags?.join(', ') || '',
        min_stock_alert: data.min_stock_alert?.toString() || '5',
        active: data.active ?? true,
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar o produto.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchVariants = async () => {
    try {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', id)
        .order('size');

      if (error) throw error;
      setVariants(data || []);
    } catch (error) {
      console.error('Error fetching variants:', error);
    }
  };

  const fetchAutomationMetrics = async () => {
    setLoadingMetrics(true);
    try {
      // Try to fetch metrics from automation API
      const { data, error } = await supabase.functions.invoke('product-metrics', {
        body: { product_id: id }
      });

      if (!error && data) {
        setMetrics(data);
      } else {
        // Fallback: calculate from messages table (product_interest)
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('id, created_at')
          .eq('product_interest', id);

        if (!messagesError) {
          setMetrics({
            sales_count: 0, // Would need orders table
            search_count: messagesData?.length || 0,
            last_sale_date: null,
            conversion_rate: 0,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
      setMetrics({
        sales_count: 0,
        search_count: 0,
        last_sale_date: null,
        conversion_rate: 0,
      });
    } finally {
      setLoadingMetrics(false);
    }
  };

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);

    try {
      let imageUrl = product.image_url || '';
      let imagesArray: string[] = product.images || [];

      // Upload main image
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('products')
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Upload additional images
      if (additionalImages.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of additionalImages) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('products')
            .upload(fileName, file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('products')
              .getPublicUrl(fileName);
            uploadedUrls.push(publicUrl);
          }
        }
        imagesArray = [...imagesArray, ...uploadedUrls];
      }

      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name,
          sku: formData.sku || null,
          description: formData.description || null,
          price: formData.price ? parseFloat(formData.price) : null,
          category: formData.category || null,
          color: formData.color || null,
          video_url: formData.video_url || null,
          tags: tagsArray.length > 0 ? tagsArray : null,
          min_stock_alert: formData.min_stock_alert ? parseInt(formData.min_stock_alert) : 5,
          active: formData.active,
          image_url: imageUrl,
          images: imagesArray,
        })
        .eq('id', product.id);

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Produto atualizado com sucesso!' });
      setImageFile(null);
      setAdditionalImages([]);
      fetchProduct();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({ title: 'Erro', description: 'Não foi possível salvar o produto.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;
      
      toast({ title: 'Sucesso', description: 'Produto excluído com sucesso!' });
      navigate('/products');
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({ title: 'Erro', description: 'Não foi possível excluir o produto.', variant: 'destructive' });
    }
  };

  const removeImage = (index: number) => {
    if (!product?.images) return;
    const newImages = [...product.images];
    newImages.splice(index, 1);
    setProduct({ ...product, images: newImages });
  };

  const totalStock = variants.reduce((acc, v) => acc + v.stock, 0);

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-[400px]" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-[200px]" />
              <Skeleton className="h-[200px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
              {product.name}
            </h1>
            <p className="text-muted-foreground mt-0.5">
              {product.sku ? `SKU: ${product.sku}` : 'Sem SKU'} • Criado em {new Date(product.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" />
                Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Produto *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">Código/SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Ex: CAM-001"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  placeholder="Descrição detalhada do produto..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Cor</Label>
                  <Input
                    id="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="casual, verão, promoção"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_stock_alert">Alerta de Estoque Mínimo</Label>
                  <Input
                    id="min_stock_alert"
                    type="number"
                    value={formData.min_stock_alert}
                    onChange={(e) => setFormData({ ...formData, min_stock_alert: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
                <Label htmlFor="active">Produto ativo</Label>
              </div>
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Mídia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Main Image Preview */}
              <div className="space-y-2">
                <Label>Imagem Principal</Label>
                <div className="flex items-start gap-4">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-32 h-32 rounded-lg object-cover border bg-muted"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center border">
                      <Package className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    />
                    {imageFile && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Novo arquivo: {imageFile.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Images */}
              <div className="space-y-2">
                <Label>Imagens Adicionais</Label>
                {product.images && product.images.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-3">
                    {product.images.map((img, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={img}
                          alt={`Imagem ${i + 1}`}
                          className="w-20 h-20 rounded-lg object-cover border"
                        />
                        <button
                          onClick={() => removeImage(i)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setAdditionalImages(Array.from(e.target.files || []))}
                />
                {additionalImages.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {additionalImages.length} novo(s) arquivo(s) selecionado(s)
                  </p>
                )}
              </div>

              {/* Video URL */}
              <div className="space-y-2">
                <Label htmlFor="video_url" className="flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  URL do Vídeo
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="video_url"
                    type="url"
                    value={formData.video_url}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    placeholder="https://..."
                    className="flex-1"
                  />
                  {formData.video_url && (
                    <Button variant="outline" size="icon" asChild>
                      <a href={formData.video_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stock */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Estoque
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setVariantsDialogOpen(true)}>
                  Gerenciar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground mb-3">{totalStock} un.</div>
              {variants.length > 0 ? (
                <div className="space-y-2">
                  {variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Tam. {v.size}</span>
                      <Badge variant={v.stock > 0 ? 'secondary' : 'destructive'}>
                        {v.stock} un.
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma variação cadastrada
                </p>
              )}
            </CardContent>
          </Card>

          {/* Metrics */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Métricas
                </CardTitle>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={fetchAutomationMetrics}
                  disabled={loadingMetrics}
                >
                  <RefreshCw className={`w-4 h-4 ${loadingMetrics ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <CardDescription>Dados da automação</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMetrics ? (
                <div className="space-y-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : metrics ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Vendas</span>
                    </div>
                    <span className="text-lg font-semibold">{metrics.sales_count}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Procuras</span>
                    </div>
                    <span className="text-lg font-semibold">{metrics.search_count}</span>
                  </div>
                  {metrics.total_revenue !== undefined && metrics.total_revenue > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm text-green-600 dark:text-green-400">Receita</span>
                      </div>
                      <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                        R$ {metrics.total_revenue.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {metrics.conversion_rate > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Conversão</span>
                      </div>
                      <span className="text-lg font-semibold">{metrics.conversion_rate.toFixed(1)}%</span>
                    </div>
                  )}
                  {metrics.recent_sales_30d !== undefined && metrics.recent_sales_30d > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {metrics.recent_sales_30d} venda(s) nos últimos 30 dias
                    </p>
                  )}
                  {metrics.last_sale_date && (
                    <p className="text-xs text-muted-foreground text-center">
                      Última venda: {new Date(metrics.last_sale_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Métricas não disponíveis
                </p>
              )}
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Visibilidade</span>
                  <Badge variant={formData.active ? 'default' : 'secondary'}>
                    {formData.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Estoque</span>
                  <Badge variant={totalStock > 0 ? 'secondary' : 'destructive'}>
                    {totalStock > 0 ? 'Disponível' : 'Esgotado'}
                  </Badge>
                </div>
                {product.min_stock_alert && totalStock <= product.min_stock_alert && totalStock > 0 && (
                  <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      ⚠️ Estoque baixo (mín: {product.min_stock_alert})
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Variants Dialog */}
      <ProductVariantsDialog
        open={variantsDialogOpen}
        onOpenChange={setVariantsDialogOpen}
        productId={product.id}
        productName={product.name}
      />
    </div>
  );
};

export default ProductDetail;
