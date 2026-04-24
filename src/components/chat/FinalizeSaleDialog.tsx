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

const CATEGORY_STYLES = [
  'border-sky-500/20 bg-sky-500/10 text-sky-300',
  'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  'border-amber-500/20 bg-amber-500/10 text-amber-300',
  'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300',
  'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
  'border-rose-500/20 bg-rose-500/10 text-rose-300',
];

const hashText = (value: string) =>
  value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

const getCategoryClass = (category: string | null) => {
  if (!category) return 'border-white/10 bg-white/5 text-slate-300';
  return CATEGORY_STYLES[hashText(category) % CATEGORY_STYLES.length];
};

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
  const [highlightedCatalogId, setHighlightedCatalogId] = useState<string | null>(null);
  const [highlightedSummaryId, setHighlightedSummaryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setSelectedItems([]);
    setNotes('');
    setSearchTerm('');
    setLoadError(null);
    setHighlightedCatalogId(null);
    setHighlightedSummaryId(null);

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

  useEffect(() => {
    if (!highlightedCatalogId && !highlightedSummaryId) return;

    const timer = setTimeout(() => {
      setHighlightedCatalogId(null);
      setHighlightedSummaryId(null);
    }, 550);

    return () => clearTimeout(timer);
  }, [highlightedCatalogId, highlightedSummaryId]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return products;

    return products.filter((product) => {
      const name = product.name?.toLowerCase() || '';
      const sku = product.sku?.toLowerCase() || '';
      const category = product.category?.toLowerCase() || '';
      return name.includes(term) || sku.includes(term) || category.includes(term);
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

    setHighlightedCatalogId(product.id);
    setHighlightedSummaryId(product.id);
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

    setHighlightedSummaryId(productId);
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[1140px] overflow-hidden border border-white/10 bg-[#0b1220] p-0 text-white shadow-2xl">
        <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b border-white/5 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-6 pb-5 pt-6">
            <DialogTitle className="text-[28px] font-semibold tracking-tight text-white">
              Finalizar venda no chat
            </DialogTitle>
            <p className="mt-1 text-sm text-slate-400">
              Selecione itens do estoque do CRM e feche a venda com um resumo claro.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.9fr]">
              <div className="min-w-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <User className="h-3.5 w-3.5" />
                      Vendedor
                    </div>
                    <p className="text-base font-semibold text-white">{sellerName}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Cliente
                    </div>
                    <p className="text-base font-semibold text-white">{customerName}</p>
                    <p className="mt-1 text-sm text-slate-500">{customerPhone}</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="border-b border-white/5 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">Produtos do estoque</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Clique em um item para adicionar na venda.
                        </p>
                      </div>

                      <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                        {filteredProducts.length} disponíveis
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar por nome, SKU ou categoria..."
                        className="h-11 rounded-2xl border-white/10 bg-slate-800/75 pl-9 text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="max-h-[500px] space-y-3 overflow-y-auto p-4">
                    {loadingProducts ? (
                      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando produtos...
                      </div>
                    ) : loadError ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-5 text-sm text-amber-300">
                        {loadError}
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
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
                              'w-full rounded-2xl border p-3 text-left transition-all duration-300',
                              outOfStock
                                ? 'cursor-not-allowed border-white/5 bg-slate-900/40 opacity-55'
                                : 'hover:-translate-y-0.5 hover:border-white/15 hover:bg-slate-800/65',
                              alreadyAdded
                                ? 'border-emerald-500/20 bg-emerald-500/[0.08]'
                                : 'border-white/8 bg-slate-900/55',
                              highlightedCatalogId === product.id &&
                                'scale-[1.01] border-emerald-400/35 shadow-[0_0_0_1px_rgba(52,211,153,0.08),0_14px_30px_rgba(16,185,129,0.12)]',
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border border-white/5 bg-slate-800">
                                {product.image_url ? (
                                  <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-slate-500">
                                    <Package className="h-7 w-7" />
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">
                                      {product.name}
                                    </p>

                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                      {product.sku && (
                                        <span className="font-mono text-[11px] text-slate-400">
                                          {product.sku}
                                        </span>
                                      )}

                                      {product.category && (
                                        <span
                                          className={cn(
                                            'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                            getCategoryClass(product.category),
                                          )}
                                        >
                                          {product.category}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {alreadyAdded && (
                                    <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                      {selectedItem?.quantity} un.
                                    </span>
                                  )}
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-emerald-300">
                                      {currency(Number(product.price || 0))}
                                    </span>

                                    <span
                                      className={cn(
                                        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                        outOfStock
                                          ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                                          : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
                                      )}
                                    >
                                      {product.totalStock === null
                                        ? 'Sem controle de estoque'
                                        : `${product.totalStock} em estoque`}
                                    </span>
                                  </div>

                                  <span
                                    className={cn(
                                      'text-xs font-medium',
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

              <div className="min-w-0 space-y-4">
                <div className="overflow-hidden rounded-3xl border border-emerald-500/15 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(16,185,129,0.03))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="border-b border-white/5 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">Resumo da venda</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Ajuste quantidades e revise antes de confirmar.
                        </p>
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white">
                        {selectedProducts.length} item(ns)
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto p-4">
                    {selectedProducts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/25 px-4 py-10 text-center">
                        <Package className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                        <p className="text-sm text-slate-400">
                          Adicione produtos do catálogo para montar a venda.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedProducts.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'rounded-2xl border border-white/10 bg-slate-950/35 p-3 transition-all duration-300',
                              highlightedSummaryId === item.id &&
                                'scale-[1.01] border-emerald-400/30 shadow-[0_12px_24px_rgba(16,185,129,0.10)]',
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/5 bg-slate-800">
                                {item.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-slate-500">
                                    <Package className="h-5 w-5" />
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white">
                                  {item.name}
                                </p>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  {item.sku && (
                                    <span className="font-mono text-[11px] text-slate-400">
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
                                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeQuantity(item.id, item.quantity - 1)
                                  }
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>

                                <div className="flex h-9 min-w-[54px] items-center justify-center rounded-xl border border-white/10 bg-slate-800/80 px-3 text-sm font-semibold text-white">
                                  {item.quantity}
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeQuantity(item.id, item.quantity + 1)
                                  }
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700"
                                >
                                  <Plus className="h-4 w-4" />
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
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <Label
                    htmlFor="sale-notes"
                    className="mb-3 block text-sm font-semibold text-white"
                  >
                    Observações
                  </Label>

                  <Textarea
                    id="sale-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Ex.: cliente confirmou no WhatsApp, entrega retirada na loja, pagamento combinado..."
                    rows={8}
                    className="resize-none rounded-2xl border-white/10 bg-slate-800/80 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 bg-[linear-gradient(180deg,rgba(10,14,23,0.88),rgba(10,14,23,0.98))] px-6 py-4 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Itens
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">{totalUnits}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Total da venda
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-300">
                    {currency(grandTotal)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  className="rounded-2xl border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  disabled={submitting || loadingProducts || selectedProducts.length === 0}
                  className="min-w-[180px] rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Confirmar venda'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FinalizeSaleDialog;
