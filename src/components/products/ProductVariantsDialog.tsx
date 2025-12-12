import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  stock: number;
  created_at: string;
  updated_at: string;
}

interface ProductVariantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

const ProductVariantsDialog = ({ 
  open, 
  onOpenChange, 
  productId, 
  productName 
}: ProductVariantsDialogProps) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSize, setNewSize] = useState('');
  const [newStock, setNewStock] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open && productId) {
      fetchVariants();
    }
  }, [open, productId]);

  const fetchVariants = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('size');

      if (error) throw error;
      setVariants(data || []);
    } catch (error) {
      console.error('Error fetching variants:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as variações.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariant = async () => {
    if (!newSize.trim()) {
      toast({
        title: 'Erro',
        description: 'Informe o tamanho.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('product_variants')
        .insert([{
          product_id: productId,
          size: newSize.trim().toUpperCase(),
          stock: parseInt(newStock) || 0,
        }]);

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Erro',
            description: 'Este tamanho já existe para este produto.',
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }

      toast({ title: 'Sucesso', description: 'Variação adicionada!' });
      setNewSize('');
      setNewStock('');
      fetchVariants();
    } catch (error) {
      console.error('Error adding variant:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar a variação.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateStock = async (variantId: string, newStockValue: number) => {
    try {
      const { error } = await supabase
        .from('product_variants')
        .update({ stock: newStockValue })
        .eq('id', variantId);

      if (error) throw error;

      setVariants(variants.map(v => 
        v.id === variantId ? { ...v, stock: newStockValue } : v
      ));
    } catch (error) {
      console.error('Error updating stock:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o estoque.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta variação?')) return;

    try {
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Variação excluída!' });
      fetchVariants();
    } catch (error) {
      console.error('Error deleting variant:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir a variação.',
        variant: 'destructive',
      });
    }
  };

  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Tamanhos e Estoque - {productName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Add new variant */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="newSize">Tamanho</Label>
              <Input
                id="newSize"
                placeholder="Ex: P, M, G, 38, 40..."
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="newStock">Estoque</Label>
              <Input
                id="newStock"
                type="number"
                min="0"
                placeholder="0"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
              />
            </div>
            <Button onClick={handleAddVariant} size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Variants table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Tamanho</TableHead>
                  <TableHead className="font-semibold">Estoque</TableHead>
                  <TableHead className="font-semibold">Disponível</TableHead>
                  <TableHead className="font-semibold text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : variants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Package className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-muted-foreground text-sm">Nenhum tamanho cadastrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  variants.map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-medium">{variant.size}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          className="w-20 h-8"
                          value={variant.stock}
                          onChange={(e) => handleUpdateStock(variant.id, parseInt(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          variant.stock > 0 
                            ? 'bg-foreground text-background' 
                            : 'bg-destructive/10 text-destructive'
                        }`}>
                          {variant.stock > 0 ? 'Em estoque' : 'Esgotado'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteVariant(variant.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Total stock */}
          {variants.length > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Total em estoque:</span>
              <span className="font-semibold">{totalStock} unidades</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductVariantsDialog;
