import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Clock,
  Phone,
  MessageSquare,
  CheckCircle2,
  XCircle,
  User,
  Package,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Order {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  selected_sku: string | null;
  selected_name: string | null;
  selected_size_1: string | null;
  selected_size_2: string | null;
  unit_or_pair: string | null;
  quantity: number;
  total_price: number | null;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
  notes: string | null;
  summary_text: string | null;
  assigned_to: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CatalogItem {
  id: string;
  position: number;
  sku: string;
  name: string;
  price: number | null;
  price_formatted: string | null;
  sizes: string[] | null;
  image_url: string | null;
  video_url: string | null;
  media_type: string;
  media_url: string;
  stock_total: number | null;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending_human: {
    label: "Pendente",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    icon: Clock,
  },
  in_progress: {
    label: "Em Atendimento",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: User,
  },
  done: {
    label: "Finalizado",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    icon: CheckCircle2,
  },
  canceled: {
    label: "Cancelado",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

const PendingOrders = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending_human");
  const [periodFilter, setPeriodFilter] = useState("7days");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fetch orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["pending-orders", statusFilter, periodFilter, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (periodFilter) {
        const now = new Date();
        let startDate: Date;
        if (periodFilter === "today") {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (periodFilter === "7days") {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (periodFilter === "30days") {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else {
          startDate = new Date(0);
        }
        query = query.gte("created_at", startDate.toISOString());
      }

      if (searchQuery) {
        query = query.or(
          `customer_phone.ilike.%${searchQuery}%,selected_sku.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Order[];
    },
  });

  // Update order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
      assignedTo,
    }: {
      orderId: string;
      status: string;
      assignedTo?: string;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status,
          assigned_to: assignedTo || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-orders"] });
      toast.success("Status atualizado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  // Fetch order details
  const fetchOrderDetails = async (order: Order) => {
    setSelectedOrder(order);
    setCatalogItems([]);
    setSheetOpen(true);

    if (order.session_id) {
      const { data: items } = await supabase
        .from("catalog_items_sent")
        .select("*")
        .eq("session_id", order.session_id)
        .order("position", { ascending: true });

      if (items) {
        setCatalogItems(items as CatalogItem[]);
      }
    }
  };

  const SUPPORT_WHATSAPP = "5592984145531";

  const openWhatsApp = (phone: string) => {
    window.open(`https://wa.me/${phone}`, "_blank");
  };

  const openSupportWhatsApp = () => {
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}`, "_blank");
  };

  const copySummary = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Resumo copiado!");
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos Pendentes</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie pedidos aguardando atendimento humano
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone ou SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending_human">Pendente</SelectItem>
              <SelectItem value="in_progress">Em Atendimento</SelectItem>
              <SelectItem value="done">Finalizado</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7days">7 dias</SelectItem>
              <SelectItem value="30days">30 dias</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : orders?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum pedido encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {orders?.map((order) => {
            const config = statusConfig[order.status] || statusConfig.pending_human;
            const StatusIcon = config.icon;

            return (
              <Card
                key={order.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => fetchOrderDetails(order)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left side */}
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`p-2.5 rounded-lg ${config.color}`}>
                        <StatusIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {order.customer_name || formatPhone(order.customer_phone)}
                          </span>
                          <Badge variant="outline" className={config.color}>
                            {config.label}
                          </Badge>
                        </div>

                        {/* Phone */}
                        {order.customer_name && (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{formatPhone(order.customer_phone)}</span>
                          </div>
                        )}

                        {/* Product Info */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {order.selected_sku ? (
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium">{order.selected_sku}</span>
                              {order.selected_name && (
                                <span className="text-muted-foreground">- {order.selected_name}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Produto não selecionado</span>
                          )}
                        </div>

                        {/* Size & Quantity & Price */}
                        <div className="flex flex-wrap gap-3 text-sm">
                          {order.selected_size_1 && (
                            <Badge variant="secondary" className="font-normal">
                              Tam: {order.selected_size_1}
                              {order.selected_size_2 && ` / ${order.selected_size_2}`}
                            </Badge>
                          )}
                          {order.quantity > 1 && (
                            <Badge variant="secondary" className="font-normal">
                              Qtd: {order.quantity}
                            </Badge>
                          )}
                          {order.total_price && (
                            <Badge variant="outline" className="font-medium text-emerald-600 border-emerald-200 bg-emerald-50">
                              R$ {order.total_price.toFixed(2).replace(".", ",")}
                            </Badge>
                          )}
                        </div>

                        {/* Summary */}
                        {order.summary_text && (
                          <p className="text-sm text-muted-foreground line-clamp-2 bg-muted/50 rounded px-2 py-1">
                            {order.summary_text}
                          </p>
                        )}

                        {/* Meta info */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })}
                          </span>
                          {order.assigned_to && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {order.assigned_to}
                            </span>
                          )}
                          {order.payment_method && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {order.payment_method}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side - Actions */}
                    <div
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openWhatsApp(order.customer_phone)}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Cliente
                      </Button>
                      {order.status === "pending_human" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateStatusMutation.mutate({
                              orderId: order.id,
                              status: "in_progress",
                              assignedTo: "Atendente",
                            });
                            openSupportWhatsApp();
                          }}
                          disabled={updateStatusMutation.isPending}
                        >
                          Iniciar Atendimento
                        </Button>
                      )}
                      {order.status === "in_progress" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            updateStatusMutation.mutate({
                              orderId: order.id,
                              status: "done",
                            })
                          }
                          disabled={updateStatusMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Finalizar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Order Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Detalhes do Pedido</SheetTitle>
          </SheetHeader>
          {selectedOrder && (
            <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
              <div className="space-y-6 py-4">
                {/* Status & Phone */}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={statusConfig[selectedOrder.status]?.color}
                  >
                    {statusConfig[selectedOrder.status]?.label}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openWhatsApp(selectedOrder.customer_phone)}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    {formatPhone(selectedOrder.customer_phone)}
                  </Button>
                </div>

                {/* Summary */}
                {selectedOrder.summary_text && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Resumo</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copySummary(selectedOrder.summary_text!)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{selectedOrder.summary_text}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Order Details */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Informações do Pedido</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedOrder.selected_sku && (
                      <>
                        <span className="text-muted-foreground">SKU:</span>
                        <span>{selectedOrder.selected_sku}</span>
                      </>
                    )}
                    {selectedOrder.selected_name && (
                      <>
                        <span className="text-muted-foreground">Produto:</span>
                        <span>{selectedOrder.selected_name}</span>
                      </>
                    )}
                    {selectedOrder.selected_size_1 && (
                      <>
                        <span className="text-muted-foreground">Tamanho 1:</span>
                        <span>{selectedOrder.selected_size_1}</span>
                      </>
                    )}
                    {selectedOrder.selected_size_2 && (
                      <>
                        <span className="text-muted-foreground">Tamanho 2:</span>
                        <span>{selectedOrder.selected_size_2}</span>
                      </>
                    )}
                    {selectedOrder.unit_or_pair && (
                      <>
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="capitalize">{selectedOrder.unit_or_pair}</span>
                      </>
                    )}
                    {selectedOrder.quantity && (
                      <>
                        <span className="text-muted-foreground">Quantidade:</span>
                        <span>{selectedOrder.quantity}</span>
                      </>
                    )}
                    {selectedOrder.total_price && (
                      <>
                        <span className="text-muted-foreground">Valor:</span>
                        <span>
                          R$ {selectedOrder.total_price.toFixed(2).replace(".", ",")}
                        </span>
                      </>
                    )}
                    {selectedOrder.payment_method && (
                      <>
                        <span className="text-muted-foreground">Pagamento:</span>
                        <span className="capitalize">{selectedOrder.payment_method}</span>
                      </>
                    )}
                    {selectedOrder.delivery_method && (
                      <>
                        <span className="text-muted-foreground">Entrega:</span>
                        <span className="capitalize">{selectedOrder.delivery_method}</span>
                      </>
                    )}
                    {selectedOrder.delivery_address && (
                      <>
                        <span className="text-muted-foreground">Endereço:</span>
                        <span>{selectedOrder.delivery_address}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {selectedOrder.notes && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Observações</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Catalog Items */}
                {catalogItems.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Itens do Catálogo Enviados</h4>
                    <div className="grid gap-3">
                      {catalogItems.map((item) => (
                        <Card key={item.id} className="overflow-hidden">
                          <div className="flex gap-3 p-3">
                            {item.image_url && (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  #{item.position}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {item.sku}
                                </span>
                              </div>
                              <p className="font-medium text-sm truncate mt-1">
                                {item.name}
                              </p>
                              {item.price_formatted && (
                                <p className="text-sm text-muted-foreground">
                                  {item.price_formatted}
                                </p>
                              )}
                              {item.sizes && (
                                <p className="text-xs text-muted-foreground">
                                  Tamanhos: {(item.sizes as string[]).join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status Actions */}
                <div className="flex gap-2 pt-4">
                  {selectedOrder.status === "pending_human" && (
                    <Button
                      className="flex-1"
                      onClick={() => {
                        updateStatusMutation.mutate({
                          orderId: selectedOrder.id,
                          status: "in_progress",
                          assignedTo: "Atendente",
                        });
                        setSheetOpen(false);
                      }}
                    >
                      Iniciar Atendimento
                    </Button>
                  )}
                  {selectedOrder.status === "in_progress" && (
                    <>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          updateStatusMutation.mutate({
                            orderId: selectedOrder.id,
                            status: "done",
                          });
                          setSheetOpen(false);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Finalizar
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          updateStatusMutation.mutate({
                            orderId: selectedOrder.id,
                            status: "canceled",
                          });
                          setSheetOpen(false);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PendingOrders;
