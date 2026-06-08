import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Product } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Layers,
  Video,
  Image,
  FolderEdit,
  Search,
  Grid3X3,
  List,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowDownAZ,
  Boxes,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ProductVariantsDialog from '@/components/products/ProductVariantsDialog';
import ImportCSVDialog from '@/components/products/ImportCSVDialog';
import CategorySelect from '@/components/products/CategorySelect';
import { formatCurrency, normalizeForFilter } from '@/lib/formatters';
import { useCategories } from '@/hooks/useCategories';

interface ProductWithStock extends Product {
  totalStock?: number;
  color?: string | null;
  tags?: string[] | null;
  min_stock_alert?: number | null;
}

type ProductStatusFilter = 'all' | 'active' | 'inactive';
type StockFilter = 'all' | 'available' | 'low' | 'out';
type ProductSort = 'recent' | 'name' | 'price_desc' | 'price_asc' | 'stock_asc';
type AgentLine = 'aline' | 'keila' | 'kate' | 'malu' | 'human' | '';

const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const joinList = (value?: string[] | null) => (Array.isArray(value) ? value.join(', ') : '');

const inferAgentLineFromCategory = (category?: string | null): AgentLine => {
  if (category === 'pingente') return 'kate';
  if (category === 'oculos') return 'malu';
  if (category === 'aliancas' || category === 'aneis') return 'keila';
  return '';
};

const getStockState = (product: ProductWithStock): Exclude<StockFilter, 'all'> => {
  const stock = product.totalStock;
  if (stock === undefined) return 'available';
  if (stock <= 0) return 'out';
  if (stock <= (product.min_stock_alert ?? 5)) return 'low';
  return 'available';
};

const Products = () => {
  const navigate = useNavigate();
  const { categories: dbCategories } = useCategories();
  const formatCategory = (slug: string | null | undefined): string => {
    if (!slug) return '';
    const found = dbCategories.find(c => c.slug === slug);
    if (found) return found.label;
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  };
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsDialogOpen, setVariantsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryDialogOpen, setBulkCategoryDialogOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<ProductStatusFilter>('all');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');
  const [sortBy, setSortBy] = useState<ProductSort>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    price: '',
    category: '',
    video_url: '',
    active: true,
    agent_line: '' as AgentLine,
    ai_description: '',
    ai_tags: '',
    search_aliases: '',
    commercial_notes: '',
    included_items: '',
    restrictions: '',
    recommended_when: '',
    avoid_when: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      const { data: variantsData, error: variantsError } = await supabase
        .from('product_variants')
        .select('product_id, stock');

      if (variantsError) throw variantsError;

      const stockByProduct: Record<string, number> = {};
      variantsData?.forEach(v => {
        stockByProduct[v.product_id] = (stockByProduct[v.product_id] || 0) + v.stock;
      });

      const productsWithStock = (productsData || []).map(p => ({
        ...p,
        totalStock: stockByProduct[p.id] ?? undefined
      }));

      setProducts(productsWithStock);

    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os produtos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const catalogStats = useMemo(() => {
    const active = products.filter((product) => product.active).length;
    const out = products.filter((product) => getStockState(product) === 'out').length;
    const low = products.filter((product) => getStockState(product) === 'low').length;
    const withImage = products.filter((product) => Boolean(product.image_url)).length;

    return {
      active,
      inactive: products.length - active,
      out,
      low,
      withImage,
      withoutImage: products.length - withImage,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = normalizeForFilter(searchTerm);

    const filtered = products.filter(product => {
      const searchable = normalizeForFilter([
        product.name,
        product.sku,
        product.category,
        product.color,
        ...(product.tags || []),
        product.agent_line,
        product.ai_description,
        ...(product.ai_tags || []),
        ...(product.search_aliases || []),
        product.commercial_notes,
        product.included_items,
        product.restrictions,
        product.recommended_when,
        product.avoid_when,
      ].filter(Boolean).join(' '));
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' ? product.active : !product.active);
      const matchesStock = filterStock === 'all' || getStockState(product) === filterStock;

      return matchesSearch && matchesCategory && matchesStatus && matchesStock;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'pt-BR');
      if (sortBy === 'price_desc') return (b.price || 0) - (a.price || 0);
      if (sortBy === 'price_asc') return (a.price || 0) - (b.price || 0);
      if (sortBy === 'stock_asc') return (a.totalStock ?? Number.MAX_SAFE_INTEGER) - (b.totalStock ?? Number.MAX_SAFE_INTEGER);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [products, searchTerm, filterCategory, filterStatus, filterStock, sortBy]);

  const filteredProductIds = useMemo(
    () => filteredProducts.map((product) => product.id),
    [filteredProducts],
  );
  const selectedFilteredCount = selectedIds.filter((id) => filteredProductIds.includes(id)).length;

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, filterStatus, filterStock, sortBy]);

  const openVariantsDialog = (product: Product) => {
    setSelectedProduct(product);
    setVariantsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let imageUrl = editingProduct?.image_url || '';
      let imagesArray: string[] = editingProduct?.images || [];

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

      if (additionalImages.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of additionalImages) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('products')
            .upload(fileName, file);

          if (uploadError) {
            console.error('Error uploading additional image:', uploadError);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('products')
            .getPublicUrl(fileName);

          uploadedUrls.push(publicUrl);
        }
        imagesArray = [...imagesArray, ...uploadedUrls];
      }

      const productData = {
        name: formData.name,
        sku: formData.sku || null,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        video_url: formData.video_url || null,
        active: formData.active,
        image_url: imageUrl,
        images: imagesArray,
        agent_line: formData.agent_line || inferAgentLineFromCategory(formData.category) || null,
        ai_description: formData.ai_description || null,
        ai_tags: splitList(formData.ai_tags),
        search_aliases: splitList(formData.search_aliases),
        commercial_notes: formData.commercial_notes || null,
        included_items: formData.included_items || null,
        restrictions: formData.restrictions || null,
        recommended_when: formData.recommended_when || null,
        avoid_when: formData.avoid_when || null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Produto atualizado com sucesso!' });
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Produto criado com sucesso!' });
      }

      setDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o produto.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Produto excluído com sucesso!' });
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o produto.',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      description: '',
      price: '',
      category: '',
      video_url: '',
      active: true,
      agent_line: '',
      ai_description: '',
      ai_tags: '',
      search_aliases: '',
      commercial_notes: '',
      included_items: '',
      restrictions: '',
      recommended_when: '',
      avoid_when: '',
    });
    setImageFile(null);
    setAdditionalImages([]);
    setEditingProduct(null);
  };

  const openEditDialog = (product: Product, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku || '',
      description: product.description,
      price: product.price.toString(),
      category: product.category,
      video_url: product.video_url || '',
      active: product.active,
      agent_line: product.agent_line || inferAgentLineFromCategory(product.category),
      ai_description: product.ai_description || '',
      ai_tags: joinList(product.ai_tags),
      search_aliases: joinList(product.search_aliases),
      commercial_notes: product.commercial_notes || '',
      included_items: product.included_items || '',
      restrictions: product.restrictions || '',
      recommended_when: product.recommended_when || '',
      avoid_when: product.avoid_when || '',
    });
    setDialogOpen(true);
  };

  const toggleSelectProduct = (productId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFilteredCount === filteredProducts.length) {
      setSelectedIds(prev => prev.filter(id => !filteredProductIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredProductIds])));
    }
  };

  const handleBulkCategoryUpdate = async () => {
    if (!bulkCategory || selectedIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({ category: bulkCategory })
        .in('id', selectedIds);

      if (error) throw error;

      toast({ 
        title: 'Sucesso', 
        description: `Categoria atualizada para ${selectedIds.length} produto(s).` 
      });
      
      setBulkCategoryDialogOpen(false);
      setBulkCategory('');
      setSelectedIds([]);
      fetchProducts();
    } catch (error) {
      console.error('Error updating categories:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar as categorias.',
        variant: 'destructive',
      });
    }
  };

  const getStockBadgeClass = (product: ProductWithStock) => {
    const stockState = getStockState(product);
    if (stockState === 'out') return 'border-red-400/25 bg-red-500/10 text-red-300';
    if (stockState === 'low') return 'border-amber-400/25 bg-amber-500/10 text-amber-300';
    return 'border-slate-400/20 bg-slate-500/10 text-slate-200';
  };

  const getStockLabel = (product: ProductWithStock) => {
    if (product.totalStock === undefined) return 'sem var.';
    if (product.totalStock <= 0) return 'Esgotado';
    if (getStockState(product) === 'low') return `${product.totalStock} un. · baixo`;
    return `${product.totalStock} un.`;
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Produtos</h1>
            <Badge variant="outline" className="h-7 gap-1.5 border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {catalogStats.active} ativos
            </Badge>
            {catalogStats.out > 0 && (
              <Badge variant="outline" className="h-7 gap-1.5 border-red-400/25 bg-red-500/10 text-red-300">
                <XCircle className="h-3.5 w-3.5" />
                {catalogStats.out} esgotados
              </Badge>
            )}
            {catalogStats.low > 0 && (
              <Badge variant="outline" className="h-7 gap-1.5 border-amber-400/25 bg-amber-500/10 text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {catalogStats.low} baixo estoque
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length} no catálogo · {catalogStats.withoutImage} sem foto · {filteredProducts.length} no filtro atual
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.length > 0 && (
            <Dialog open={bulkCategoryDialogOpen} onOpenChange={setBulkCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FolderEdit className="w-4 h-4" />
                  Editar Categoria ({selectedIds.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>Alterar Categoria em Massa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Alterar a categoria de {selectedIds.length} produto(s) selecionado(s).
                  </p>
                  <div className="space-y-2">
                    <Label>Nova Categoria</Label>
                    <CategorySelect
                      value={bulkCategory}
                      onValueChange={setBulkCategory}
                      placeholder="Selecione uma categoria"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setBulkCategoryDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleBulkCategoryUpdate} disabled={!bulkCategory}>
                      Aplicar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          <ImportCSVDialog onImportComplete={fetchProducts} />
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
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
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Preço (R$) *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria</Label>
                    <CategorySelect
                      value={formData.category}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        category: value,
                        agent_line: formData.agent_line || inferAgentLineFromCategory(value),
                      })}
                      placeholder="Selecione uma categoria"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="video_url" className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    URL do Vídeo
                  </Label>
                  <Input
                    id="video_url"
                    type="url"
                    value={formData.video_url}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image" className="flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Imagem Principal
                  </Label>
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="additional_images">Imagens Adicionais</Label>
                  <Input
                    id="additional_images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setAdditionalImages(Array.from(e.target.files || []))}
                  />
                  {additionalImages.length > 0 && (
                    <p className="text-xs text-muted-foreground">{additionalImages.length} arquivo(s) selecionado(s)</p>
                  )}
                  {editingProduct?.images && editingProduct.images.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2">
                      {editingProduct.images.map((img, i) => (
                        <img key={i} src={img} alt={`Imagem ${i + 1}`} className="w-12 h-12 rounded object-cover border" />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="active"
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                  />
                  <Label htmlFor="active">Produto ativo</Label>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Inteligência do agente</p>
                    <p className="text-xs text-muted-foreground">Ajuda Keila, Kate e Malu a encontrar e explicar o produto corretamente.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Linha/agente</Label>
                      <Select
                        value={formData.agent_line || 'auto'}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          agent_line: value === 'auto' ? '' : value as AgentLine,
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Automático pela categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automático pela categoria</SelectItem>
                          <SelectItem value="keila">Keila · alianças/anéis</SelectItem>
                          <SelectItem value="kate">Kate · pingentes</SelectItem>
                          <SelectItem value="malu">Malu · óculos</SelectItem>
                          <SelectItem value="aline">Aline · geral</SelectItem>
                          <SelectItem value="human">Humano</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tags de IA</Label>
                      <Input
                        value={formData.ai_tags}
                        onChange={(e) => setFormData({ ...formData, ai_tags: e.target.value })}
                        placeholder="presente, premium, fotogravavel"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Aliases de busca</Label>
                    <Input
                      value={formData.search_aliases}
                      onChange={(e) => setFormData({ ...formData, search_aliases: e.target.value })}
                      placeholder="medalha, foto no pingente, armação feminina"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição para IA</Label>
                    <Textarea
                      value={formData.ai_description}
                      onChange={(e) => setFormData({ ...formData, ai_description: e.target.value })}
                      rows={2}
                      placeholder="Como o agente deve entender e vender este produto."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quando recomendar</Label>
                      <Textarea
                        value={formData.recommended_when}
                        onChange={(e) => setFormData({ ...formData, recommended_when: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quando evitar</Label>
                      <Textarea
                        value={formData.avoid_when}
                        onChange={(e) => setFormData({ ...formData, avoid_when: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Itens inclusos</Label>
                      <Input
                        value={formData.included_items}
                        onChange={(e) => setFormData({ ...formData, included_items: e.target.value })}
                        placeholder="Somente pingente; não acompanha corrente"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Restrições</Label>
                      <Input
                        value={formData.restrictions}
                        onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                        placeholder="Não chamar aço de ouro"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notas comerciais</Label>
                    <Textarea
                      value={formData.commercial_notes}
                      onChange={(e) => setFormData({ ...formData, commercial_notes: e.target.value })}
                      rows={2}
                      placeholder="Observações úteis para atendimento, objeções e fechamento."
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {editingProduct ? 'Atualizar' : 'Criar'} Produto
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 rounded-lg pl-10"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-11 w-[190px] rounded-lg">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {dbCategories.map(cat => (
                <SelectItem key={cat.slug} value={cat.slug}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ProductStatusFilter)}>
            <SelectTrigger className="h-11 w-[150px] rounded-lg">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStock} onValueChange={(value) => setFilterStock(value as StockFilter)}>
            <SelectTrigger className="h-11 w-[165px] rounded-lg">
              <Boxes className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Estoque" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo estoque</SelectItem>
              <SelectItem value="available">Disponível</SelectItem>
              <SelectItem value="low">Baixo estoque</SelectItem>
              <SelectItem value="out">Esgotado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ProductSort)}>
            <SelectTrigger className="h-11 w-[178px] rounded-lg">
              <ArrowDownAZ className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="name">Nome A-Z</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="stock_asc">Menor estoque</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex h-11 overflow-hidden rounded-lg border bg-card">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="rounded-none"
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              className="rounded-none"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>

          {filteredProducts.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={toggleSelectAll}
              className="h-11 rounded-lg px-4"
            >
              {selectedFilteredCount === filteredProducts.length ? 'Desmarcar' : 'Selecionar'} todos
            </Button>
          )}
        </div>
      </div>

      {/* Products Grid/List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando produtos...</p>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhum produto encontrado</h3>
          <p className="text-muted-foreground text-sm">
            {searchTerm || filterCategory !== 'all' 
              ? 'Tente ajustar os filtros de busca'
              : 'Comece adicionando seu primeiro produto'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {paginatedProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => navigate(`/products/${product.id}`)}
              className={`group relative overflow-hidden rounded-lg border bg-card cursor-pointer transition-all duration-200 hover:border-foreground/20 hover:shadow-lg ${
                selectedIds.includes(product.id) ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
              }`}
            >
              {/* Selection checkbox */}
              <div 
                className="absolute top-3 left-3 z-10"
                onClick={(e) => toggleSelectProduct(product.id, e)}
              >
                <Checkbox
                  checked={selectedIds.includes(product.id)}
                  className="bg-background/80 backdrop-blur-sm"
                />
              </div>

              {/* Status badge */}
              <div className="absolute top-3 right-3 z-10">
                <Badge 
                  variant="outline"
                  className={product.active
                    ? 'gap-1.5 border-emerald-400/25 bg-emerald-500/10 text-xs text-emerald-300'
                    : 'gap-1.5 border-slate-400/20 bg-slate-500/10 text-xs text-slate-300'}
                >
                  <span className={product.active ? 'h-1.5 w-1.5 rounded-full bg-emerald-400' : 'h-1.5 w-1.5 rounded-full bg-slate-400'} />
                  {product.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>

              {/* Product Image */}
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                    <Package className="w-14 h-14 text-muted-foreground/30" />
                  </div>
                )}

                {/* Media indicators */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1">
                  {(product.images?.length ?? 0) > 0 && (
                    <Badge variant="secondary" className="text-xs gap-1 bg-background/80 backdrop-blur-sm">
                      <Image className="w-3 h-3" />
                      +{product.images?.length}
                    </Badge>
                  )}
                  {product.video_url && (
                    <Badge variant="secondary" className="text-xs bg-background/80 backdrop-blur-sm">
                      <Video className="w-3 h-3" />
                    </Badge>
                  )}
                </div>

                {/* Quick actions on hover */}
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={(e) => { e.stopPropagation(); openVariantsDialog(product); }}
                    title="Gerenciar estoque"
                  >
                    <Layers className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={(e) => openEditDialog(product, e)}
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={(e) => handleDelete(product.id, e)}
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Product Info */}
              <div className="p-3.5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-foreground">
                    {product.name}
                  </h3>
                </div>
                
                <p className="mb-3 truncate font-mono text-[11px] text-muted-foreground">
                  {product.sku || 'sem SKU'}
                </p>

                <div className="flex items-end justify-between gap-3">
                  <span className="text-lg font-bold leading-none text-foreground">
                    {formatCurrency(product.price)}
                  </span>
                  
                  <Badge variant="outline" className={`shrink-0 text-[11px] ${getStockBadgeClass(product)}`}>
                    {getStockLabel(product)}
                  </Badge>
                </div>

                <div className="mt-3 flex min-h-6 flex-wrap items-center gap-1.5">
                  {product.category && (
                    <Badge variant="outline" className="text-[11px]">
                      {formatCategory(product.category)}
                    </Badge>
                  )}
                  {(product.images?.length ?? 0) > 0 && (
                    <span className="text-[11px] text-muted-foreground">{product.images?.length} fotos</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {paginatedProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => navigate(`/products/${product.id}`)}
              className={`flex items-center gap-4 p-4 bg-card border rounded-xl cursor-pointer transition-all hover:shadow-md hover:border-foreground/20 ${
                selectedIds.includes(product.id) ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div onClick={(e) => toggleSelectProduct(product.id, e)}>
                <Checkbox checked={selectedIds.includes(product.id)} />
              </div>

              <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{product.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  {product.sku && (
                    <span className="text-xs font-mono text-muted-foreground">{product.sku}</span>
                  )}
                  {product.category && (
                    <Badge variant="outline" className="text-xs">{formatCategory(product.category)}</Badge>
                  )}
                </div>
              </div>

              <div className="text-right">
                <p className="font-bold text-foreground">R$ {product.price?.toFixed(2) || '0.00'}</p>
                {product.totalStock !== undefined && (
                  <Badge 
                    variant={product.totalStock > 0 ? "secondary" : "destructive"}
                    className="text-xs mt-1"
                  >
                    {product.totalStock} un.
                  </Badge>
                )}
              </div>

              <Badge variant={product.active ? "default" : "secondary"}>
                {product.active ? 'Ativo' : 'Inativo'}
              </Badge>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openVariantsDialog(product)}
                >
                  <Layers className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => openEditDialog(product, e)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDelete(product.id, e)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <p className="text-sm text-muted-foreground">
            Mostrando {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} de {filteredProducts.length} produtos
          </p>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .map((page, index, array) => (
                  <div key={page} className="flex items-center">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-muted-foreground">...</span>
                    )}
                    <Button
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="min-w-[36px]"
                    >
                      {page}
                    </Button>
                  </div>
                ))}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Variants Dialog */}
      {selectedProduct && (
        <ProductVariantsDialog
          open={variantsDialogOpen}
          onOpenChange={(open) => {
            setVariantsDialogOpen(open);
            if (!open) {
              fetchProducts();
            }
          }}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
        />
      )}
    </div>
  );
};

export default Products;
