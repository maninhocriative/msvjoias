import { useState, useEffect } from 'react';
import { supabase, Product } from '@/lib/supabase';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Package, Layers, Video, Image } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ProductVariantsDialog from '@/components/products/ProductVariantsDialog';
import ImportCSVDialog from '@/components/products/ImportCSVDialog';

interface ProductWithStock extends Product {
  totalStock?: number;
}

const Products = () => {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsDialogOpen, setVariantsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
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
      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      // Fetch stock totals for each product
      const { data: variantsData, error: variantsError } = await supabase
        .from('product_variants')
        .select('product_id, stock');

      if (variantsError) throw variantsError;

      // Calculate total stock per product
      const stockByProduct: Record<string, number> = {};
      variantsData?.forEach(v => {
        stockByProduct[v.product_id] = (stockByProduct[v.product_id] || 0) + v.stock;
      });

      // Merge stock info with products
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

  const openVariantsDialog = (product: Product) => {
    setSelectedProduct(product);
    setVariantsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let imageUrl = editingProduct?.image_url || '';
      let imagesArray: string[] = editingProduct?.images || [];

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

  const handleDelete = async (id: string) => {
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

  const openEditDialog = (product: Product) => {
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

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">Produtos</h1>
          <p className="text-muted-foreground mt-1">Gerencie seu catálogo de produtos</p>
        </div>

        <div className="flex items-center gap-2">
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
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
              <Button type="submit" className="w-full">
                {editingProduct ? 'Atualizar' : 'Criar'} Produto
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">Produto</TableHead>
              <TableHead className="font-semibold">SKU</TableHead>
              <TableHead className="font-semibold">Categoria</TableHead>
              <TableHead className="font-semibold">Preço</TableHead>
              <TableHead className="font-semibold">Estoque</TableHead>
              <TableHead className="font-semibold">Mídia</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Carregando produtos...
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Nenhum produto encontrado</p>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover bg-muted"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{product.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{product.sku || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{product.category || '—'}</TableCell>
                  <TableCell className="font-medium">R$ {product.price?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell>
                    {product.totalStock !== undefined ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        product.totalStock > 0 
                          ? 'bg-muted text-foreground' 
                          : 'bg-destructive/10 text-destructive'
                      }`}>
                        {product.totalStock} un.
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {product.image_url && <Image className="w-4 h-4 text-muted-foreground" />}
                      {(product.images?.length ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">+{product.images?.length}</span>
                      )}
                      {product.video_url && <Video className="w-4 h-4 text-muted-foreground" />}
                      {!product.image_url && !product.video_url && <span className="text-muted-foreground text-xs">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      product.active 
                        ? 'bg-foreground text-background' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {product.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openVariantsDialog(product)}
                        title="Gerenciar tamanhos e estoque"
                      >
                        <Layers className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(product)}
                        title="Editar produto"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(product.id)}
                        title="Excluir produto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Variants Dialog */}
      {selectedProduct && (
        <ProductVariantsDialog
          open={variantsDialogOpen}
          onOpenChange={(open) => {
            setVariantsDialogOpen(open);
            if (!open) {
              fetchProducts(); // Refresh to update stock counts
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
