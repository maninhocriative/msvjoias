import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
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
  image_url: string | null;
  category: string | null;
  totalStock: number | null;
}

interface SelectedSaleItem {
  productId: string;
  quantity: number;
}

interface FinalizeSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerName: string;
  customerName: string;
  customerPhone: string;
  onConfirm: (payload: {
    items: Array<{
      productId: string;
      productName: string;
      productSku: string | null;
      unitPrice: number;
      quantity: number;
    }>;
    notes: string;
  }) => Promise<void>;
}

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const FinalizeSaleDialog = ({
  open,
  onOpenChange,
  sellerName,
  customerName,
  customerPhone,
  onConfirm,
}: FinalizeSaleDialogProps) => {
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedSaleItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!open) return;

    setSelectedItems([]);
    setNotes('');
    setSearchTerm('');
    setLoadError(null);

    const fetchProductsWithStock = async () => {
      try {
        setLoadingProducts(true);

        const [{ data: productsData, error: productsError }, { data: variantsData, error: variantsError }] =
          await Promise.all([
            supabase
              .from('products')
              .select('id, name, sku, price, active, image_url, category')
              .eq('active', true)
              .order('name', { ascending: true }),
            supabase.from('product_variants').select('product_id, stock'),
          ]);

        if (productsError) throw productsError;
        if (variantsError) throw variantsError;

        const stockByProduct: Record<string, number> = {};
        const hasVariants: Record<string, boolean> = {};

        (variantsData || []).forEach((variant: any) => {
          hasVariants[variant.product_id] = true;
          stockByProduct[variant.product_id] =
            (stockByProduct[variant.product_id] || 0) + Number(variant.stock || 0);
        });

        const loadedProducts: SaleProduct[] = (productsData || []).map((product: any) => ({
          id: product.id,
          name: product.name,
          sku: product.sku || null,
          price: Number(product.price || 0),
          active: product.active ?? true,
          image_url: product.image_url || null,
          category: product.category || null,
          totalStock: hasVariants[product.id] ? stockByProduct[product.id] || 0 : null,
        }));

        setProducts(loadedProducts);

        if (loadedProducts.length === 0) {
          setLoadError('Nenhum produto cadastrado foi encontrado.');
        }
      } catch (error: any) {
        console.error('Erro ao carregar produtos do CRM:', error);
        setProducts([]);
        setLoadError(error?.message || 'Não foi possível carregar os produtos.');
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProductsWithStock();
  }, [open]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return products;

    return products.filter((product) => {
      const name = product.name?.toLowerCase() || '';
      const sku = product.sku?.toLowerCase() || '';
      const category = product.category?.toLowerCase() || '';
      return (
        name.includes(term) ||
        sku.includes(term) ||
        category.includes(term)
      );
    });
  }, [products, searchTerm]);

  const selectedProducts = useMemo(() => {
    return selectedItems
      .map((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        if (!product) return null;

        return {
          ...product,
          quantity: item.quantity,
          total: Number(product.price || 0) * item.quantity,
        };
      })
      .filter(Boolean) as Array<SaleProduct & { quantity: number; total: number }>;
  }, [products, selectedItems]);

  const totalUnits = selectedProducts.reduce((sum, item) => sum + item.quantity, 0);
  const grandTotal = selectedProducts.reduce((sum, item) => sum + item.total, 0);

  const clampQuantity = (product: SaleProduct, value: number) => {
    if (product.totalStock === null) {
      return Math.max(1, value);
    }

    return Math.max(1, Math.min(value, Math.max(product.totalStock, 1)));
  };

  const handleAddProduct = (product: SaleProduct) => {
    if (product.totalStock !== null && product.totalStock <= 0) return;

    setSelectedItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) => {
          if (item.productId !== product.id) return item;

          return {
            ...item,
            quantity: clampQuantity(product, item.quantity + 1),
          };
        });
      }

      return [...prev, { productId: product.id, quantity: 1 }];
    });
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleChangeQuantity = (productId: string, nextValue: number) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;

    setSelectedItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        return {
          ...item,
          quantity: clampQuantity(product, nextValue),
        };
      }),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (selectedProducts.length === 0) return;

    try {
      setSubmitting(true);

      await onConfirm({
        items: selectedProducts.map((item) => ({
          productId: item.id,
          productName: item.name,
          productSku: item.sku || null,
          unitPrice: Number(item.price || 0),
          quantity: item.quantity,
        })),
        notes: notes.trim(),
      });

      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && onOpenChange(value)}>
      <DialogContent className="sm:max-w-[1040px] p-0 overflow-hidden border-white/10 bg-[#0f172a] text-white">
        <form onSubmit={handleSubmit} className="flex max-h-[88vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/5 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
            <DialogTitle className="text-2xl font-semibold text-white">
              Finalizar venda no chat
            </DialogTitle>
            <p className="text-sm text-slate-400 mt-1">
              Monte a venda com itens do estoque do CRM e confirme tudo em um só lugar.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4 min-w-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                      <User className="w-3.5 h-3.5" />
                      Vendedor
                    </div>
                    <p className="text-base font-semibold text-white">{sellerName}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      Cliente
                    </div>
                    <p className="text-base font-semibold text-white">{customerName}</p>
                    <p className="text-sm text-slate-500 mt-1">{customerPhone}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                  <div className="px-4 py-4 border-b border-white/5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Produtos do estoque</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Escolha um ou mais produtos para esta venda.
                        </p>
                      </div>

                      <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-semibold">
                        {filteredProducts.length} itens
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar por nome, SKU ou categoria..."
                        className="pl-9 h-11 bg-slate-800/80 border-white/10 text-white placeholder:text-slate-500 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto p-3 space-y-2">
                    {loadingProducts ? (
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-4 text-sm text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando produtos...
                      </div>
                    ) : loadError ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-300">
                        {loadError}
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-6 text-sm text-slate-400">
                        Nenhum produto encontrado para essa busca.
                      </div>
                    ) : (
                      filteredProducts.map((product) => {
                        const selectedItem = selectedItems.find(
                          (item) => item.productId === product.id,
                        );
                        const alreadyAdded = Boolean(selectedItem);
                        const outOfStock =
                          product.totalStock !== null && product.totalStock <= 0;

                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => handleAddProduct(product)}
                            disabled={outOfStock}
                            className={cn(
                              'w-full text-left rounded-2xl border p-3 transition-all',
                              outOfStock
                                ? 'border-white/5 bg-slate-900/40 opacity-60 cursor-not-allowed'
                                : alreadyAdded
                                  ? 'border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15'
                                  : 'border-white/8 bg-slate-900/55 hover:border-white/15 hover:bg-slate-800/70',
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-white/5 shrink-0">
                                {product.image_url ? (
                                  <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                                    <Package className="w-6 h-6" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">
                                      {product.name}
                                    </p>

                                    <div className="flex items-center gap-2 flex-wrap mt-1">
                                      {product.sku && (
                                        <span className="text-[11px] text-slate-400 font-mono">
                                          {product.sku}
                                        </span>
                                      )}

                                      {product.category && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/5">
                                          {product.category}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {alreadyAdded && (
                                    <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold shrink-0">
                                      {selectedItem?.quantity} un.
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-3 mt-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-emerald-300">
                                      {currency(Number(product.price || 0))}
                                    </span>

                                    <span
                                      className={cn(
                                        'text-[10px] px-2 py-0.5 rounded-full border',
                                        outOfStock
                                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                                          : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
                                      )}
                                    >
                                      {product.totalStock === null
                                        ? 'Sem controle de estoque'
                                        : `${product.totalStock} em estoque`}
                                    </span>
                                  </div>

                                  <span
                                    className={cn(
                                      'text-xs font-medium shrink-0',
                                      outOfStock
                                        ? 'text-rose-300'
                                        : alreadyAdded
                                          ? 'text-emerald-300'
                                          : 'text-slate-400',
                                    )}
                                  >
                                    {outOfStock
                                      ? 'Sem estoque'
                                      : alreadyAdded
                                        ? 'Adicionar mais'
                                        : 'Adicionar'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4 min-w-0">
                <div className="rounded-2xl border border-emerald-500/15 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(16,185,129,0.03))] p-4">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Resumo da venda</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Revise os itens antes de confirmar.
                      </p>
                    </div>

                    <div className="px-2.5 py-1 rounded-full bg-white/8 text-white text-xs font-semibold">
                      {selectedProducts.length} produto(s)
                    </div>
                  </div>

                  {selectedProducts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center">
                      <Package className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">
                        Adicione produtos do catálogo para montar a venda.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="max-h-[310px] overflow-y-auto pr-1 space-y-3">
                        {selectedProducts.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/10 bg-slate-950/35 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                  {item.name}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap mt-1">
                                  {item.sku && (
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      {item.sku}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-slate-400">
                                    {currency(Number(item.price || 0))} cada
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveProduct(item.id)}
                                className="p-2 rounded-xl text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-3 mt-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeQuantity(item.id, item.quantity - 1)
                                  }
                                  className="w-9 h-9 rounded-xl border border-white/10 bg-slate-800/80 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>

                                <div className="min-w-[52px] h-9 rounded-xl border border-white/10 bg-slate-800/80 flex items-center justify-center text-sm font-semibold text-white">
                                  {item.quantity}
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeQuantity(item.id, item.quantity + 1)
                                  }
                                  className="w-9 h-9 rounded-xl border border-white/10 bg-slate-800/80 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="text-right">
                                <p className="text-[11px] text-slate-400">Total do item</p>
                                <p className="text-sm font-semibold text-emerald-300">
                                  {currency(item.total)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-400">Quantidade total</span>
                          <span className="font-semibold text-white">{totalUnits}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-400">Valor da venda</span>
                          <span className="font-semibold text-emerald-300">
                            {currency(grandTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <Label
                    htmlFor="sale-notes"
                    className="text-sm font-semibold text-white mb-3 block"
                  >
                    Observações
                  </Label>
                  <Textarea
                    id="sale-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Ex.: cliente confirmou no WhatsApp, entrega retirada na loja, pagamento combinado..."
                    rows={7}
                    className="bg-slate-800/80 border-white/10 text-white placeholder:text-slate-500 rounded-xl resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/5 bg-slate-950/90">
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white rounded-xl"
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={submitting || loadingProducts || selectedProducts.length === 0}
                className="min-w-[170px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Confirmar venda'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FinalizeSaleDialog;
