import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
// Tabs removed - using icon toolbar instead
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ShoppingCart, 
  Package, 
  User, 
  Wallet, 
  Send, 
  Copy, 
  Check, 
  Loader2,
  MapPin,
  CreditCard,
  Truck,
  Store,
  Search,
  X,
  History,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SellerToolsPanelProps {
  phone: string;
  contactName: string;
  conversationId: string;
  onSendMessage: (message: string) => void;
}

interface CustomerData {
  id: string;
  name: string;
  whatsapp: string;
  wallet_balance: number;
  total_purchases: number;
  total_orders: number;
}

interface CatalogItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string;
}

interface AlineData {
  collected_data: {
    categoria?: string;
    cor?: string;
    selected_product?: {
      id?: string;
      name?: string;
      sku?: string;
      price?: number;
      image_url?: string;
      category?: string;
    };
    last_catalog?: CatalogItem[];
    delivery_method?: string;
    payment_method?: string;
    [key: string]: any;
  };
  current_node: string;
  status: string;
}

interface ConversationState {
  selected_sku: string | null;
  selected_name: string | null;
  selected_price: number | null;
  selected_product_id?: string | null;
  selected_product?: any;
  categoria: string | null;
  cor_preferida: string | null;
  tipo_alianca: string | null;
  stage: string | null;
  crm_entrega: string | null;
  crm_pagamento: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  image_url: string;
  video_url?: string | null;
  category: string;
}

const buildPhoneVariants = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  const variants = new Set<string>();
  if (digits) variants.add(digits);
  if (digits.startsWith('55') && digits.length > 11) variants.add(digits.slice(2));
  if (digits && !digits.startsWith('55')) variants.add(`55${digits}`);
  return Array.from(variants);
};

const parseMoneyValue = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return Number(value || 0) || 0;
  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value;
  return Number(normalized.replace(/[^\d.-]/g, '')) || 0;
};

const parseSelectedProductNote = (content?: string | null): Partial<Product> | null => {
  const text = String(content || '').trim();
  if (!/modelo escolhido pelo cliente/i.test(text)) return null;

  const product = text.match(/Produto:\s*(.+)/i)?.[1]?.trim();
  const sku = text.match(/SKU:\s*([^\n]+)/i)?.[1]?.trim();
  const price = text.match(/Valor:\s*([^\n]+)/i)?.[1]?.trim();

  if (!product && !sku) return null;

  return {
    id: '',
    name: product || sku || '',
    sku: sku || '',
    price: parseMoneyValue(price),
    image_url: '',
    category: '',
  };
};

const normalizePanelText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const isChoiceLikeText = (value: unknown) => {
  const text = normalizePanelText(value);
  return /\b(quero este|quero esse|este modelo|esse modelo|assim|e esse|e este)\b/.test(text);
};

const parseProductFromMessageContent = (content?: string | null): Product | null => {
  const text = String(content || '').trim();
  if (!text) return null;

  const normalized = normalizePanelText(text);
  const sku =
    text.match(/(?:SKU|Cod|C[oó]digo|C[oó]d)\s*:?\s*([A-Z0-9_-]{3,})/i)?.[1]?.trim() ||
    text.match(/\b(PF[A-Z0-9_-]{5,}|E0\d{5,}|[OÓ]CULOS[-_]?\d+)\b/i)?.[1]?.trim() ||
    '';

  const name =
    text.match(/\*([^*\n]{3,})\*/)?.[1]?.trim() ||
    text.split('\n').find((line) => normalizePanelText(line).includes('pingente') || normalizePanelText(line).includes('oculos') || normalizePanelText(line).includes('alianca'))?.replace(/\*/g, '').trim() ||
    '';

  const priceText =
    text.match(/(?:Valor(?: da unidade)?|Preço|Preco)\s*:?\s*R?\$?\s*([0-9.,]+)/i)?.[1] ||
    text.match(/R\$\s*([0-9.,]+)/i)?.[1] ||
    null;

  const category = normalized.includes('oculos')
    ? 'oculos'
    : normalized.includes('alianca')
      ? 'aliancas'
      : normalized.includes('pingente')
        ? 'pingente'
        : '';

  if (!name && !sku) return null;

  return {
    id: '',
    name: name || sku,
    sku,
    price: parseMoneyValue(priceText),
    image_url: '',
    category,
  };
};

const normalizeProductCandidate = (candidate: any): Product | null => {
  if (!candidate) return null;

  const name = String(candidate.name || candidate.nome || candidate.product_name || candidate.selected_name || '').trim();
  const sku = String(candidate.sku || candidate.product_sku || candidate.selected_sku || '').trim();
  const id = String(candidate.id || candidate.product_id || candidate.selected_product_id || '').trim();

  if (!name && !sku && !id) return null;

  return {
    id,
    name: name || sku || id,
    sku,
    price: parseMoneyValue(candidate.price ?? candidate.preco ?? candidate.unit_price ?? candidate.selected_price),
    image_url: String(candidate.image_url || candidate.imageUrl || candidate.media_url || '').trim(),
    category: String(candidate.category || candidate.categoria || '').trim(),
  };
};

const mergeProductData = (base: Product | null, details?: Partial<Product> | null): Product | null => {
  if (!base && !details) return null;
  const source = base || normalizeProductCandidate(details) || {
    id: '',
    name: '',
    sku: '',
    price: 0,
    image_url: '',
    category: '',
  };
  const baseNameIsOnlyIdentifier = !!base?.name && (base.name === base.sku || base.name === base.id);

  return {
    id: details?.id || source.id || '',
    name: baseNameIsOnlyIdentifier ? (details?.name || base?.name || source.name || '') : (base?.name || details?.name || source.name || ''),
    sku: base?.sku || details?.sku || source.sku || '',
    price: base?.price || details?.price || source.price || 0,
    image_url: details?.image_url || source.image_url || '',
    category: details?.category || source.category || '',
  };
};

const QUICK_RESPONSES = [
  { label: 'Saudação', text: 'Olá! Sou o vendedor da ACIUM Manaus. Como posso te ajudar?' },
  { label: 'Confirmar pedido', text: 'Perfeito! Vou confirmar seu pedido:\n\n🛍️ Produto: {produto}\n💰 Valor: {valor}\n🚚 Entrega: {entrega}\n💳 Pagamento: {pagamento}\n\nEstá tudo certo?' },
  { label: 'PIX', text: 'Segue nossa chave PIX para pagamento:\n\n📱 Chave PIX: (CNPJ)\n🏪 ACIUM MANAUS\n\nApós o pagamento, envie o comprovante aqui.' },
  { label: 'Endereço loja', text: '📍 Nossa loja fica localizada no:\n\nShopping Sumaúma\nAv. Noel Nutels - Cidade Nova\nManaus - AM, CEP 69090-970\n\n⏰ Funcionamos de seg a sáb, das 9h às 18h.' },
  { label: 'Prazo envio', text: '📦 O prazo de envio é de 3 a 5 dias úteis após a confirmação do pagamento.\n\nVocê receberá o código de rastreio assim que for postado.' },
  { label: 'Agradecimento', text: 'Muito obrigado pela compra! 🎉\n\nQualquer dúvida, estamos à disposição.\n\n💍 ACIUM Manaus - Joias que contam histórias' },
];

const SellerToolsPanel = ({ phone, contactName, conversationId, onSendMessage }: SellerToolsPanelProps) => {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [alineData, setAlineData] = useState<AlineData | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [sendingCatalog, setSendingCatalog] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<'info' | 'order' | 'catalog' | 'quick' | null>(null);
  
  // Order form
  const [orderDelivery, setOrderDelivery] = useState<'retirada' | 'envio'>('retirada');
  const [orderPayment, setOrderPayment] = useState<'pix' | 'cartao'>('pix');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderQuantity, setOrderQuantity] = useState(1);

  const { toast } = useToast();

  useEffect(() => {
    fetchData();
    const phoneVariants = buildPhoneVariants(phone);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => fetchData(true), 250);
    };

    const matchesPhone = (value?: string | null) => {
      const digits = String(value || '').replace(/\D/g, '');
      return !!digits && phoneVariants.includes(digits);
    };

    let channel = supabase
      .channel(`seller-tools-product-${conversationId || phone}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_state' }, (payload) => {
        const row: any = payload.new || payload.old;
        if (matchesPhone(row?.phone)) scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aline_conversations' }, (payload) => {
        const row: any = payload.new || payload.old;
        if (matchesPhone(row?.phone)) scheduleRefresh();
      });

    if (conversationId) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [phone, conversationId]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const phoneVariants = buildPhoneVariants(phone);
      const lookupPhones = phoneVariants.length ? phoneVariants : [phone];
      // Buscar cliente
      const { data: customerRows } = await supabase
        .from('customers')
        .select('*')
        .in('whatsapp', lookupPhones)
        .limit(1);
      
      setCustomer(customerRows?.[0] || null);

      // Buscar dados coletados pela Aline
      const { data: alineRows } = await supabase
        .from('aline_conversations')
        .select('collected_data, current_node, status')
        .in('phone', lookupPhones)
        .order('created_at', { ascending: false })
        .limit(1);
      
      const alineConv = alineRows?.[0] || null;
      setAlineData(alineConv);

      // Buscar conversation_state que contém o produto selecionado
      const { data: convStateRows } = await supabase
        .from('conversation_state')
        .select('selected_sku, selected_name, selected_price, categoria, cor_preferida, tipo_alianca, stage, crm_entrega, crm_pagamento')
        .in('phone', lookupPhones)
        .limit(1);
      
      const convState = convStateRows?.[0] || null;
      setConversationState(convState);

      let noteCandidate: Product | null = null;
      let recentCardCandidate: Product | null = null;
      if (conversationId) {
        const { data: noteRows } = await supabase
          .from('messages')
          .select('content')
          .eq('conversation_id', conversationId)
          .eq('message_type', 'internal_note')
          .ilike('content', '%Modelo escolhido pelo cliente%')
          .order('created_at', { ascending: false })
          .limit(1);

        noteCandidate = normalizeProductCandidate(parseSelectedProductNote(noteRows?.[0]?.content));

        const { data: recentRows } = await supabase
          .from('messages')
          .select('content, is_from_me, message_type, created_at')
          .eq('conversation_id', conversationId)
          .or('message_type.is.null,message_type.neq.internal_note')
          .order('created_at', { ascending: false })
          .limit(50);

        let customerChoseRecentCard = false;
        for (const row of recentRows || []) {
          if (!row?.is_from_me && isChoiceLikeText(row.content)) {
            customerChoseRecentCard = true;
            continue;
          }

          if (!customerChoseRecentCard || !row?.is_from_me) continue;

          const parsedProduct = parseProductFromMessageContent(row.content);
          if (parsedProduct) {
            recentCardCandidate = parsedProduct;
            break;
          }
        }
      }

      const stateCandidate = normalizeProductCandidate({
        selected_sku: convState?.selected_sku,
        selected_name: convState?.selected_name,
        selected_price: convState?.selected_price,
        category: convState?.categoria,
      });

      const collected = alineConv?.collected_data || {};
      const memoryCandidate =
        normalizeProductCandidate(collected.selected_product) ||
        normalizeProductCandidate({
          selected_sku: collected.selected_sku || collected.produto_sku || collected.product_sku,
          selected_name: collected.selected_name || collected.produto_nome || collected.product_name,
          selected_price: collected.selected_price || collected.produto_preco || collected.product_price,
          category: collected.categoria,
        });

      const candidate = stateCandidate || memoryCandidate || noteCandidate || recentCardCandidate;
      if (!candidate) {
        setSelectedProduct(null);
        return;
      }

      let productDetails: Product | null = null;
      const productSelect = 'id, name, sku, price, image_url, category';

      if (candidate.sku) {
        const { data } = await supabase
          .from('products')
          .select(productSelect)
          .eq('sku', candidate.sku)
          .eq('active', true)
          .limit(1);
        productDetails = normalizeProductCandidate(data?.[0]);
      }

      if (!productDetails && candidate.id) {
        const { data } = await supabase
          .from('products')
          .select(productSelect)
          .eq('id', candidate.id)
          .eq('active', true)
          .limit(1);
        productDetails = normalizeProductCandidate(data?.[0]);
      }

      if (!productDetails && candidate.name) {
        const { data } = await supabase
          .from('products')
          .select(productSelect)
          .ilike('name', `%${candidate.name}%`)
          .eq('active', true)
          .limit(1);
        productDetails = normalizeProductCandidate(data?.[0]);
      }

      setSelectedProduct(mergeProductData(candidate, productDetails));

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const searchProducts = async () => {
    if (!searchProduct.trim()) return;
    
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, price, image_url, category')
        .or(`name.ilike.%${searchProduct}%,sku.ilike.%${searchProduct}%`)
        .eq('active', true)
        .limit(10);
      
      setProducts(data || []);
    } catch (error) {
      console.error('Error searching products:', error);
    }
  };

  const handleCopyResponse = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({ title: 'Copiado!' });
  };

  const handleSendQuickResponse = (text: string) => {
    // Substituir placeholders com dados coletados
    let finalText = text;
    if (alineData?.collected_data) {
      const data = alineData.collected_data;
      finalText = finalText
        .replace('{produto}', data.selected_product?.name || selectedProduct?.name || 'N/A')
        .replace('{valor}', selectedProduct ? `R$ ${selectedProduct.price?.toFixed(2)}` : (data.selected_product?.price ? `R$ ${data.selected_product.price.toFixed(2)}` : 'N/A'))
        .replace('{entrega}', data.delivery_method === 'retirada' ? 'Retirada na loja' : 'Envio')
        .replace('{pagamento}', (data.payment_method || '').toUpperCase());
    }
    onSendMessage(finalText);
  };

  const sendManualCatalog = async (category: 'aliancas' | 'oculos' | 'pingente') => {
    setSendingCatalog(category);
    try {
      const catalogFilter = {
        aliancas: 'category.ilike.%alianca%,category.ilike.%aliança%,name.ilike.%alianca%,name.ilike.%aliança%',
        oculos: 'category.ilike.%oculos%,category.ilike.%óculos%,name.ilike.%oculos%,name.ilike.%óculos%',
        pingente: 'category.ilike.%pingente%,name.ilike.%pingente%',
      }[category];

      const { data: catalogProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, sku, price, image_url, video_url, category')
        .eq('active', true)
        .or(catalogFilter)
        .limit(6);

      if (productsError) throw productsError;
      if (!catalogProducts?.length) {
        toast({ title: 'Catalogo vazio', description: 'Nao encontrei produtos ativos para essa linha.', variant: 'destructive' });
        return;
      }

      const introByCategory = {
        aliancas: 'Separei algumas opcoes de aliancas para voce conferir:',
        oculos: 'Separei alguns modelos de oculos para voce conferir:',
        pingente: 'Separei alguns pingentes para voce conferir:',
      };

      const { error } = await supabase.functions.invoke('automation-send', {
        body: {
          conversation_id: conversationId,
          phone,
          platform: 'whatsapp',
          prefer_zapi: true,
          message: introByCategory[category],
          products: catalogProducts,
        },
      });

      if (error) throw error;

      toast({ title: 'Catalogo enviado', description: `${catalogProducts.length} item(ns) enviados ao cliente.` });
      void fetchData(true);
    } catch (error) {
      console.error('Error sending catalog:', error);
      toast({
        title: 'Erro ao enviar catalogo',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSendingCatalog(null);
    }
  };

  const createOrder = async () => {
    if (!selectedProduct) {
      toast({ title: 'Selecione um produto', variant: 'destructive' });
      return;
    }

    setCreatingOrder(true);
    try {
      const totalPrice = selectedProduct.price * orderQuantity;

      // Criar pedido
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          customer_phone: phone,
          customer_name: customer?.name || contactName,
          product_id: selectedProduct.id,
          selected_sku: selectedProduct.sku,
          selected_name: selectedProduct.name,
          unit_price: selectedProduct.price,
          quantity: orderQuantity,
          total_price: totalPrice,
          delivery_method: orderDelivery,
          payment_method: orderPayment,
          delivery_address: orderDelivery === 'envio' ? orderAddress : null,
          notes: orderNotes || null,
          status: 'pending',
          source: 'vendedor',
        })
        .select()
        .single();

      if (error) throw error;

      // Se cliente existe, adicionar cashback
      if (customer) {
        await supabase.rpc('add_customer_cashback', {
          p_customer_id: customer.id,
          p_order_value: totalPrice,
          p_order_reference: order.id,
        });
      }

      toast({ title: 'Pedido criado com sucesso! 🎉' });

      // Enviar confirmação para cliente
      const confirmMsg = `✅ *PEDIDO CONFIRMADO!*\n\n🛍️ Produto: ${selectedProduct.name}\n📦 SKU: ${selectedProduct.sku}\n💰 Valor: R$ ${totalPrice.toFixed(2)}\n🚚 Entrega: ${orderDelivery === 'retirada' ? 'Retirada na loja' : 'Envio'}\n💳 Pagamento: ${orderPayment.toUpperCase()}\n\nObrigado pela compra! 💍`;
      onSendMessage(confirmMsg);

      // Limpar form
      setOrderNotes('');
      setOrderAddress('');
      setOrderQuantity(1);

    } catch (error) {
      console.error('Error creating order:', error);
      toast({ title: 'Erro ao criar pedido', variant: 'destructive' });
    } finally {
      setCreatingOrder(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (loading) {
    return (
      <div
        className="h-full w-12 shrink-0 border-l border-white/5 bg-slate-950/50"
        aria-hidden="true"
      />
    );
  }

  const togglePanel = (panel: 'info' | 'order' | 'catalog' | 'quick') => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  return (
    <div className="h-full flex bg-slate-900/95 border-l border-white/5">
      {/* Icon toolbar */}
      <div className="w-12 shrink-0 flex flex-col items-center py-3 gap-2 border-r border-white/5 bg-slate-950/50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('info')}
          className={cn(
            "w-10 h-10 rounded-xl transition-all",
            activePanel === 'info' 
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
              : "text-slate-400 hover:text-white hover:bg-white/10"
          )}
          title="Cliente"
        >
          <User className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('order')}
          className={cn(
            "w-10 h-10 rounded-xl transition-all",
            activePanel === 'order' 
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
              : "text-slate-400 hover:text-white hover:bg-white/10"
          )}
          title="Pedido"
        >
          <ShoppingCart className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('catalog')}
          className={cn(
            "w-10 h-10 rounded-xl transition-all",
            activePanel === 'catalog'
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/10"
          )}
          title="Enviar Catalogo"
        >
          <Package className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('quick')}
          className={cn(
            "w-10 h-10 rounded-xl transition-all",
            activePanel === 'quick' 
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
              : "text-slate-400 hover:text-white hover:bg-white/10"
          )}
          title="Respostas Rápidas"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>
      </div>

      {/* Expanded panel content */}
      {activePanel && (
        <div className="flex-1 flex flex-col w-[320px]">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              {activePanel === 'info' && <><User className="w-4 h-4 text-emerald-400" /> Cliente</>}
              {activePanel === 'order' && <><ShoppingCart className="w-4 h-4 text-emerald-400" /> Criar Pedido</>}
              {activePanel === 'catalog' && <><Package className="w-4 h-4 text-emerald-400" /> Enviar Catalogo</>}
              {activePanel === 'quick' && <><MessageSquare className="w-4 h-4 text-emerald-400" /> Respostas Rápidas</>}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActivePanel(null)}
              className="w-7 h-7 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {/* Panel: Cliente Info */}
            {activePanel === 'info' && (
              <div className="p-3 space-y-3">
            {/* Dados do Cliente */}
            <Card className="bg-slate-800/50 border-white/5">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  Dados do Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">Nome</span>
                  <span className="text-sm text-white font-medium break-words">
                    {customer?.name || alineData?.collected_data?.contact_name || contactName || 'Não informado'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400">WhatsApp</span>
                  <span className="text-sm text-white font-mono break-all">{phone}</span>
                </div>
                {customer && (
                  <>
                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Wallet className="w-3 h-3" />
                        Cashback
                      </span>
                      <span className="text-sm text-emerald-400 font-bold">{formatCurrency(customer.wallet_balance)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <History className="w-3 h-3" />
                        Total compras
                      </span>
                      <span className="text-sm text-white">{formatCurrency(customer.total_purchases)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" />
                        Pedidos
                      </span>
                      <span className="text-sm text-white">{customer.total_orders}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Catálogo Enviado - mostrar produtos do last_catalog */}
            {alineData?.collected_data?.last_catalog && alineData.collected_data.last_catalog.length > 0 && (
              <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    Catálogo Enviado ({alineData.collected_data.last_catalog.length} itens)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Preferências */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {alineData.collected_data.categoria && (
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-xs capitalize">
                        {alineData.collected_data.categoria}
                      </Badge>
                    )}
                    {alineData.collected_data.cor && (
                      <Badge className="bg-amber-500/20 text-amber-300 text-xs capitalize">
                        {alineData.collected_data.cor}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Lista de produtos enviados */}
                  <div className="space-y-2">
                    {alineData.collected_data.last_catalog.map((item: CatalogItem, index: number) => (
                      <div 
                        key={item.id || index}
                        className={cn(
                          "flex gap-3 items-start rounded-lg p-2 cursor-pointer transition-all",
                          selectedProduct?.sku === item.sku 
                            ? "bg-emerald-500/20 ring-1 ring-emerald-500/50" 
                            : "bg-slate-800/50 hover:bg-slate-700/50"
                        )}
                        onClick={() => setSelectedProduct({
                          id: item.id,
                          name: item.name,
                          sku: item.sku,
                          price: item.price,
                          image_url: item.image_url,
                          category: alineData.collected_data?.categoria || '',
                        })}
                      >
                        {item.image_url && (
                          <img 
                            src={item.image_url} 
                            alt="" 
                            className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium leading-tight">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            {item.sku}
                          </p>
                          <p className="text-sm text-emerald-400 font-bold mt-0.5">
                            {formatCurrency(item.price)}
                          </p>
                        </div>
                        {selectedProduct?.sku === item.sku && (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Produto Selecionado - quando há um selecionado */}
            {selectedProduct && (
              <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400" />
                    Item para Pedido
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="flex gap-3 items-start bg-slate-800/50 rounded-lg p-3">
                    {selectedProduct.image_url && (
                      <img 
                        src={selectedProduct.image_url} 
                        alt="" 
                        className="w-16 h-16 rounded-lg object-cover border border-white/10"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">
                        {selectedProduct.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono mt-1">
                        SKU: {selectedProduct.sku}
                      </p>
                      <p className="text-lg text-emerald-400 font-bold mt-1">
                        {formatCurrency(selectedProduct.price || 0)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Características */}
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    {(alineData?.collected_data?.categoria || selectedProduct.category) && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Categoria</span>
                        <Badge className="bg-emerald-500/20 text-emerald-300 text-xs capitalize">
                          {alineData?.collected_data?.categoria || selectedProduct.category}
                        </Badge>
                      </div>
                    )}
                    {alineData?.collected_data?.cor && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Cor</span>
                        <span className="text-sm text-white capitalize">{alineData.collected_data.cor}</span>
                      </div>
                    )}
                    {conversationState?.tipo_alianca && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Tipo</span>
                        <span className="text-sm text-white capitalize">{conversationState.tipo_alianca}</span>
                      </div>
                    )}
                    {conversationState?.crm_entrega && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Truck className="w-3 h-3" /> Entrega
                        </span>
                        <Badge className="bg-blue-500/20 text-blue-300 text-xs capitalize">
                          {conversationState.crm_entrega === 'retirada' ? 'Retirada' : 'Envio'}
                        </Badge>
                      </div>
                    )}
                    {conversationState?.crm_pagamento && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> Pagamento
                        </span>
                        <Badge className="bg-amber-500/20 text-amber-300 text-xs uppercase">
                          {conversationState.crm_pagamento}
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProduct(null)}
                    className="w-full text-slate-400 hover:text-white text-xs"
                  >
                    <X className="w-3 h-3 mr-1" /> Limpar seleção
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Dados coletados pela Aline */}
            {alineData?.collected_data && Object.keys(alineData.collected_data).length > 0 && (
              <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    Coletado pela Aline
                  </CardTitle>
                  <CardDescription className="text-xs text-violet-300/60">
                    Node atual: {alineData.current_node}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {alineData.collected_data.categoria && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Categoria</span>
                      <Badge variant="secondary" className="bg-violet-500/20 text-violet-300 text-xs">
                        {alineData.collected_data.categoria}
                      </Badge>
                    </div>
                  )}
                  {alineData.collected_data.finalidade && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Finalidade</span>
                      <span className="text-sm text-white">{alineData.collected_data.finalidade}</span>
                    </div>
                  )}
                  {alineData.collected_data.cor && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Cor preferida</span>
                      <span className="text-sm text-white capitalize">{alineData.collected_data.cor}</span>
                    </div>
                  )}
                  {alineData.collected_data.delivery_method && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Entrega</span>
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-xs">
                        {alineData.collected_data.delivery_method === 'retirada' ? 'Retirada' : 'Envio'}
                      </Badge>
                    </div>
                  )}
                  {alineData.collected_data.payment_method && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Pagamento</span>
                      <Badge className="bg-blue-500/20 text-blue-300 text-xs">
                        {alineData.collected_data.payment_method.toUpperCase()}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
              </div>
            )}

            {activePanel === 'catalog' && (
              <div className="p-3 space-y-3">
                <Card className="bg-slate-800/50 border-white/5">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      Enviar catalogo
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Envia ate 6 itens ativos pelo WhatsApp do cliente.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {[
                      { key: 'aliancas', label: 'Aliancas' },
                      { key: 'oculos', label: 'Oculos' },
                      { key: 'pingente', label: 'Pingentes' },
                    ].map((item) => (
                      <Button
                        key={item.key}
                        type="button"
                        disabled={Boolean(sendingCatalog)}
                        onClick={() => void sendManualCatalog(item.key as 'aliancas' | 'oculos' | 'pingente')}
                        className="w-full justify-between bg-emerald-600 hover:bg-emerald-700"
                      >
                        <span className="flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          {item.label}
                        </span>
                        {sendingCatalog === item.key ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Panel: Criar Pedido */}
            {activePanel === 'order' && (
              <div className="p-3 space-y-3">
            {/* Buscar Produto */}
            <Card className="bg-slate-800/50 border-white/5">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-emerald-400" />
                  Buscar Produto
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    placeholder="Nome ou SKU..."
                    className="flex-1 h-9 bg-slate-900/50 border-white/10 text-white text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && searchProducts()}
                  />
                  <Button 
                    size="sm" 
                    onClick={searchProducts}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                {products.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {products.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => {
                          setSelectedProduct(product);
                          setProducts([]);
                          setSearchProduct('');
                        }}
                        className={cn(
                          "flex gap-2 items-center p-2 rounded-lg cursor-pointer transition-colors",
                          selectedProduct?.id === product.id 
                            ? "bg-emerald-500/20 border border-emerald-500/50" 
                            : "bg-slate-900/50 hover:bg-slate-800"
                        )}
                      >
                        {product.image_url && (
                          <img src={product.image_url} alt="" className="w-10 h-10 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium truncate">{product.name}</p>
                          <p className="text-[10px] text-slate-400">{product.sku}</p>
                        </div>
                        <span className="text-xs text-emerald-400 font-bold">{formatCurrency(product.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Produto Selecionado */}
            {selectedProduct && (
              <Card className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      Produto Selecionado
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-slate-400 hover:text-white"
                      onClick={() => setSelectedProduct(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex gap-3 mb-3">
                    {selectedProduct.image_url && (
                      <img src={selectedProduct.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    )}
                    <div>
                      <p className="text-sm text-white font-medium">{selectedProduct.name}</p>
                      <p className="text-xs text-slate-400">SKU: {selectedProduct.sku}</p>
                      <p className="text-lg text-emerald-400 font-bold mt-1">{formatCurrency(selectedProduct.price)}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-slate-400">Quantidade</Label>
                      <Input
                        type="number"
                        min={1}
                        value={orderQuantity}
                        onChange={(e) => setOrderQuantity(Number(e.target.value))}
                        className="h-9 mt-1 bg-slate-900/50 border-white/10 text-white"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-slate-400">Entrega</Label>
                      <Select value={orderDelivery} onValueChange={(v) => setOrderDelivery(v as 'retirada' | 'envio')}>
                        <SelectTrigger className="h-9 mt-1 bg-slate-900/50 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-white/10">
                          <SelectItem value="retirada" className="text-white">
                            <span className="flex items-center gap-2">
                              <Store className="w-4 h-4" /> Retirada na loja
                            </span>
                          </SelectItem>
                          <SelectItem value="envio" className="text-white">
                            <span className="flex items-center gap-2">
                              <Truck className="w-4 h-4" /> Envio
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {orderDelivery === 'envio' && (
                      <div>
                        <Label className="text-xs text-slate-400">Endereço</Label>
                        <Textarea
                          value={orderAddress}
                          onChange={(e) => setOrderAddress(e.target.value)}
                          placeholder="Endereço completo..."
                          className="mt-1 bg-slate-900/50 border-white/10 text-white text-sm resize-none"
                          rows={2}
                        />
                      </div>
                    )}

                    <div>
                      <Label className="text-xs text-slate-400">Pagamento</Label>
                      <Select value={orderPayment} onValueChange={(v) => setOrderPayment(v as 'pix' | 'cartao')}>
                        <SelectTrigger className="h-9 mt-1 bg-slate-900/50 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-white/10">
                          <SelectItem value="pix" className="text-white">
                            <span className="flex items-center gap-2">💠 PIX</span>
                          </SelectItem>
                          <SelectItem value="cartao" className="text-white">
                            <span className="flex items-center gap-2">
                              <CreditCard className="w-4 h-4" /> Cartão
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-slate-400">Observações</Label>
                      <Textarea
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Notas do pedido..."
                        className="mt-1 bg-slate-900/50 border-white/10 text-white text-sm resize-none"
                        rows={2}
                      />
                    </div>

                    {/* Total */}
                    <div className="flex justify-between items-center pt-3 border-t border-white/10">
                      <span className="text-sm text-slate-400">Total</span>
                      <span className="text-xl text-emerald-400 font-bold">
                        {formatCurrency(selectedProduct.price * orderQuantity)}
                      </span>
                    </div>

                    <Button
                      onClick={createOrder}
                      disabled={creatingOrder}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                    >
                      {creatingOrder ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Criar Pedido
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
              </div>
            )}

            {/* Panel: Respostas Rápidas */}
            {activePanel === 'quick' && (
              <div className="p-3 space-y-2">
            {QUICK_RESPONSES.map((response, index) => (
              <Card 
                key={index}
                className="bg-slate-800/50 border-white/5 hover:border-emerald-500/30 transition-colors cursor-pointer"
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-400 mb-1">{response.label}</p>
                      <p className="text-xs text-slate-300 line-clamp-2">{response.text}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
                        onClick={() => handleCopyResponse(response.text, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => handleSendQuickResponse(response.text)}
                      >
                        <Send className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default SellerToolsPanel;
