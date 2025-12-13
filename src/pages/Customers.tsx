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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Search, Wallet, History, Edit, Trash2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

interface Customer {
  id: string;
  name: string;
  whatsapp: string;
  cpf: string | null;
  wallet_balance: number;
  total_orders: number;
  created_at: string;
}

interface LoyaltyTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'MANUAL_ADJUSTMENT';
  amount: number;
  order_reference: string | null;
  description: string | null;
  created_at: string;
}

const Customers = () => {
  const { isAdmin, isGerente } = useUserRole();
  const canManage = isAdmin || isGerente;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    cpf: '',
  });

  const [adjustmentData, setAdjustmentData] = useState({
    amount: '',
    type: 'CREDIT' as 'CREDIT' | 'DEBIT',
    description: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar clientes: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar extrato: ' + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.whatsapp) {
      toast.error('Nome e WhatsApp são obrigatórios');
      return;
    }

    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            whatsapp: formData.whatsapp,
            cpf: formData.cpf || null,
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;
        toast.success('Cliente atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('customers')
          .insert({
            name: formData.name,
            whatsapp: formData.whatsapp,
            cpf: formData.cpf || null,
          });

        if (error) throw error;
        toast.success('Cliente cadastrado com sucesso!');
      }

      setDialogOpen(false);
      resetForm();
      fetchCustomers();
    } catch (error: any) {
      toast.error('Erro ao salvar cliente: ' + error.message);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Excluir cliente ${customer.name}?`)) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customer.id);

      if (error) throw error;
      toast.success('Cliente excluído com sucesso!');
      fetchCustomers();
    } catch (error: any) {
      toast.error('Erro ao excluir cliente: ' + error.message);
    }
  };

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amount = parseFloat(adjustmentData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valor inválido');
      return;
    }

    try {
      // Atualizar saldo
      const newBalance = adjustmentData.type === 'CREDIT'
        ? selectedCustomer.wallet_balance + amount
        : selectedCustomer.wallet_balance - amount;

      if (newBalance < 0) {
        toast.error('Saldo insuficiente para débito');
        return;
      }

      const { error: updateError } = await supabase
        .from('customers')
        .update({ wallet_balance: newBalance })
        .eq('id', selectedCustomer.id);

      if (updateError) throw updateError;

      // Registrar transação
      const { error: transactionError } = await supabase
        .from('loyalty_transactions')
        .insert({
          customer_id: selectedCustomer.id,
          type: 'MANUAL_ADJUSTMENT',
          amount: adjustmentData.type === 'CREDIT' ? amount : -amount,
          description: adjustmentData.description || `Ajuste manual (${adjustmentData.type === 'CREDIT' ? 'crédito' : 'débito'})`,
        });

      if (transactionError) throw transactionError;

      toast.success('Ajuste realizado com sucesso!');
      setAdjustDialogOpen(false);
      setAdjustmentData({ amount: '', type: 'CREDIT', description: '' });
      fetchCustomers();
    } catch (error: any) {
      toast.error('Erro ao realizar ajuste: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', whatsapp: '', cpf: '' });
    setEditingCustomer(null);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      whatsapp: customer.whatsapp,
      cpf: customer.cpf || '',
    });
    setDialogOpen(true);
  };

  const openHistoryDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    fetchTransactions(customer.id);
    setHistoryDialogOpen(true);
  };

  const openAdjustDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setAdjustDialogOpen(true);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.whatsapp.includes(searchTerm)
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-[1920px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Clientes</h1>
          <p className="text-muted-foreground">Gerencie seus clientes e programa de fidelidade</p>
        </div>

        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome do cliente"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp *</Label>
                  <Input
                    id="whatsapp"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="5511999999999"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingCustomer ? 'Salvar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Buscar por nome ou WhatsApp..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead className="text-right">Saldo Cashback</TableHead>
              <TableHead className="text-center">Pedidos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.whatsapp}</TableCell>
                  <TableCell>{customer.cpf || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={customer.wallet_balance > 0 ? 'default' : 'secondary'}>
                      {formatCurrency(customer.wallet_balance)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{customer.total_orders}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openHistoryDialog(customer)}
                        title="Ver extrato"
                      >
                        <History className="w-4 h-4" />
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openAdjustDialog(customer)}
                            title="Ajustar saldo"
                          >
                            <Wallet className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(customer)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(customer)}
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Extrato de Cashback - {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="text-muted-foreground">Saldo atual:</span>
              <span className="text-xl font-semibold">
                {formatCurrency(selectedCustomer?.wallet_balance || 0)}
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                        Nenhuma transação encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">{formatDate(tx.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant={tx.type === 'CREDIT' ? 'default' : 'destructive'}>
                            {tx.type === 'CREDIT' ? 'Crédito' : tx.type === 'DEBIT' ? 'Débito' : 'Ajuste'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{tx.description || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Saldo - {selectedCustomer?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdjustment} className="space-y-4">
            <div className="p-4 bg-muted rounded-lg text-center">
              <span className="text-muted-foreground">Saldo atual: </span>
              <span className="font-semibold">
                {formatCurrency(selectedCustomer?.wallet_balance || 0)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant={adjustmentData.type === 'CREDIT' ? 'default' : 'outline'}
                onClick={() => setAdjustmentData({ ...adjustmentData, type: 'CREDIT' })}
              >
                Adicionar
              </Button>
              <Button
                type="button"
                variant={adjustmentData.type === 'DEBIT' ? 'default' : 'outline'}
                onClick={() => setAdjustmentData({ ...adjustmentData, type: 'DEBIT' })}
              >
                Remover
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={adjustmentData.amount}
                onChange={(e) => setAdjustmentData({ ...adjustmentData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Motivo</Label>
              <Input
                id="description"
                value={adjustmentData.description}
                onChange={(e) => setAdjustmentData({ ...adjustmentData, description: e.target.value })}
                placeholder="Ex: Bônus de aniversário"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAdjustDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Confirmar Ajuste</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
