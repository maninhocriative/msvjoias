import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface SaleProduct {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  active: boolean | null;
}

interface FinalizeSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerName: string;
  customerName: string;
  customerPhone: string;
  onConfirm: (payload: {
    productId: string;
    productName: string;
    productSku: string | null;
    unitPrice: number;
    quantity: number;
    notes: string;
  }) => Promise<void>;
}

const FinalizeSaleDialog = ({
  open,
  onOpenChange,
  sellerName,
  customerName,
  customerPhone,
  onConfirm,
}: FinalizeSaleDialogProps) => {
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!open) return;

    setSelectedProductId('');
    setQuantity('1');
    setNotes('');
    setSearchTerm('');
    setLoadError(null);

    const fetchProducts = async () => {
      try {
        setLoadingProducts(true);

        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, price, active')
          .order('name', { ascending: true });

        if (error) throw error;

        const loadedProducts = (data || []) as SaleProduct[];

        setProducts(loadedProducts);

        if (loadedProducts.length === 0) {
          setLoadError('Nenhum produto cadastrado foi encontrado.');
        }
      } catch (error: any) {
        console.error('Erro ao carregar produtos:', error);
        setProducts([]);
        setLoadError(error?.message || 'Não foi possível carregar os produtos.');
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [open]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return products;

    return products.filter((product) => {
      const name = product.name?.toLowerCase() || '';
      const sku = product.sku?.toLowerCase() || '';
      return name.includes(term) || sku.includes(term);
    });
  }, [products, searchTerm]);

  const parsedQuantity = Math.max(1, Number(quantity) || 1);
  const totalPrice = selectedProduct
    ? Number(selectedProduct.price || 0) * parsedQuantity
    : 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedProduct) return;

    try {
      setSubmitting(true);

      await onConfirm({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        productSku: selectedProduct.sku || null,
        unitPrice: Number(selectedProduct.price || 0),
        quantity: parsedQuantity,
        notes: notes.trim(),
      });

      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && onOpenChange(value)}>
      <DialogContent className="sm:max-w-[620px] bg-slate-900 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Finalizar venda no chat</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-800/60 p-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">
                <User className="w-3.5 h-3.5" />
                Vendedor
              </div>
              <p className="text-sm font-medium text-white">{sellerName}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-800/60 p-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500 mb-2">
                <ShoppingBag className="w-3.5 h-3.5" />
                Cliente
              </div>
              <p className="text-sm font-medium text-white">{customerName}</p>
              <p className="text-xs text-slate-500 mt-1">{customerPhone}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Produto vendido</Label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nome ou SKU..."
                className="pl-9 bg-slate-800/70 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-800/35 overflow-hidden">
              <div className="max-h-56 overflow-y-auto">
                {loadingProducts ? (
                  <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando produtos...
                  </div>
                ) : loadError ? (
                  <div className="px-4 py-4 text-sm text-amber-300">
                    {loadError}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-400">
                    Nenhum produto encontrado para essa busca.
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const isSelected = selectedProductId === product.id;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setSelectedProductId(product.id)}
                        className={cn(
                          'w-full px-4 py-3 text-left border-b border-white/5 transition-colors',
                          'hover:bg-white/5',
                          isSelected && 'bg-emerald-500/10',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {product.name}
                            </p>

                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              {product.sku && (
                                <span className="text-xs text-slate-400 font-mono">
                                  {product.sku}
                                </span>
                              )}

                              <span className="text-xs text-emerald-300 font-semibold">
                                R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
                              </span>

                              {product.active === false && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  Inativo
                                </span>
                              )}
                            </div>
                          </div>

                          <div
                            className={cn(
                              'mt-0.5 shrink-0 w-5 h-5 rounded-full border flex items-center justify-center',
                              isSelected
                                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                                : 'border-slate-600 text-transparent',
                            )}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="sale-quantity" className="text-slate-300">
                Quantidade
              </Label>
              <Input
                id="sale-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="bg-slate-800/70 border-white/10 text-white"
              />
            </div>

            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/8 p-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
                <Package className="w-3.5 h-3.5" />
                Resumo da venda
              </div>

              {selectedProduct ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-white">
                    {selectedProduct.name}
                    {selectedProduct.sku ? ` (${selectedProduct.sku})` : ''}
                  </p>
                  <p className="text-xs text-slate-400">
                    Unitário: R$ {Number(selectedProduct.price || 0).toFixed(2).replace('.', ',')}
                  </p>
                  <p className="text-sm font-semibold text-emerald-300">
                    Total: R$ {totalPrice.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Selecione um produto para ver o resumo.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sale-notes" className="text-slate-300">
              Observações
            </Label>
            <Textarea
              id="sale-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex.: cliente confirmou no WhatsApp, entrega retirada na loja..."
              rows={4}
              className="bg-slate-800/70 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={submitting || loadingProducts || !selectedProductId}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando venda...
                </>
              ) : (
                'Confirmar venda'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FinalizeSaleDialog;
