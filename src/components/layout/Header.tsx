import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, MessageSquare, Package, Settings, LogOut, Users, BarChart3, Code, FileText, TestTube, ExternalLink, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const { isAdmin, role } = useUserRole();
  const location = useLocation();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName.charAt(0).toUpperCase();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { to: '/chat', label: 'Chat', icon: MessageSquare, show: true },
    { to: '/products', label: 'Produtos', icon: Package, show: true },
    { to: '/reports', label: 'Relatórios', icon: BarChart3, show: true },
    { to: '/users', label: 'Usuários', icon: Users, show: isAdmin },
    { to: '/settings', label: 'Configurações', icon: Settings, show: true },
  ];

  const apiRoutes = ['/api-docs', '/webhook-tester'];
  const isApiActive = apiRoutes.includes(location.pathname);

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    gerente: 'Gerente',
    vendedor: 'Vendedor',
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container h-full mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-[0.3em] text-foreground">
            ACIUM
          </span>
        </div>
        
        <nav className="flex items-center gap-1">
          {navItems.filter(item => item.show).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}

          {/* API Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300',
                  isApiActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Code className="w-4 h-4" />
                <span className="hidden sm:inline">API</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48 bg-popover z-50">
              <DropdownMenuItem asChild>
                <NavLink to="/api-docs" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  Documentação
                </NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <NavLink to="/webhook-tester" className="flex items-center gap-2 cursor-pointer">
                  <TestTube className="w-4 h-4" />
                  Testador de Webhook
                </NavLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href="https://supabase.com/dashboard/project/ahbjwpkpxqqrpvpzmqwa/functions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  Logs (Supabase)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-full">
              <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium leading-none">{displayName}</span>
                {role && (
                  <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                    {roleLabels[role]}
                  </span>
                )}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              {role && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted mt-1">
                  {roleLabels[role]}
                </span>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
