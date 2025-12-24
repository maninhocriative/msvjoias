import { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash2, Package, Layers, Video, Image, FolderEdit, Search, Grid3X3, List, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ProductVariantsDialog from '@/components/products/ProductVariantsDialog';
import ImportCSVDialog from '@/components/products/ImportCSVDialog';
import { formatCategory, formatColor, allowedCategories } from '@/lib/formatters';

interface ProductWithStock extends Product {
  totalStock?: number;
}

const Products = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsDialogOpen, setVariantsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryDialogOpen, setBulkCategoryDialogOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    price: '',
    category: '',
    video_url: '',
    active: true,
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

      const uniqueCategories = [...new Set(
        productsData
          ?.map(p => p.category)
          .filter((c): c is string => !!c)
      )];
      setCategories(uniqueCategories);
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

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory]);

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
    setFormData({ name: '', sku: '', description: '', price: '', category: '', video_url: '', active: true });
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
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
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

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Produtos</h1>
          <p className="text-muted-foreground mt-1">
            {products.length} produtos no catálogo
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
                    <Select value={bulkCategory} onValueChange={setBulkCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedCategories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select 
                      value={formData.category} 
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedCategories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <Button type="submit" className="w-full">
                  {editingProduct ? 'Atualizar' : 'Criar'} Produto
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {allowedCategories.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex border rounded-lg overflow-hidden">
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
            >
              {selectedIds.length === filteredProducts.length ? 'Desmarcar' : 'Selecionar'} todos
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {paginatedProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => navigate(`/products/${product.id}`)}
              className={`group relative bg-card border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-foreground/20 ${
                selectedIds.includes(product.id) ? 'ring-2 ring-primary' : ''
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
                  variant={product.active ? "default" : "secondary"}
                  className="text-xs"
                >
                  {product.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>

              {/* Product Image */}
              <div className="aspect-square bg-muted relative overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-16 h-16 text-muted-foreground/30" />
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
                <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-foreground line-clamp-2 leading-snug">
                    {product.name}
                  </h3>
                </div>
                
                {product.sku && (
                  <p className="text-xs text-muted-foreground font-mono mb-2">
                    {product.sku}
                  </p>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-lg font-bold text-foreground">
                    R$ {product.price?.toFixed(2) || '0.00'}
                  </span>
                  
                  {product.totalStock !== undefined && (
                    <Badge 
                      variant={product.totalStock > 0 ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {product.totalStock} un.
                    </Badge>
                  )}
                </div>

                {product.category && (
                  <Badge variant="outline" className="mt-3 text-xs">
                    {formatCategory(product.category)}
                  </Badge>
                )}
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
