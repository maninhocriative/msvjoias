import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, MessageSquare, TrendingUp, Users } from 'lucide-react';

const stats = [
  { label: 'Total Produtos', value: '124', icon: Package, change: '+12%' },
  { label: 'Conversas Ativas', value: '48', icon: MessageSquare, change: '+8%' },
  { label: 'Vendas do Mês', value: 'R$ 12.450', icon: TrendingUp, change: '+23%' },
  { label: 'Clientes', value: '892', icon: Users, change: '+5%' },
];

const Dashboard = () => {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do seu sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border bg-card hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-foreground font-medium">{stat.change}</span> desde o último mês
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full bg-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Nova mensagem recebida</p>
                    <p className="text-xs text-muted-foreground">há {i * 5} minutos</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Produtos Populares</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['Produto Premium A', 'Produto Elite B', 'Produto Classic C', 'Produto Standard D'].map((name, i) => (
                <div key={name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium text-foreground">{name}</span>
                  <span className="text-xs text-muted-foreground">{100 - i * 15} vendas</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
