import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, MessageSquare, Package, Settings, LogOut, Users, BarChart3, Code, FileText, TestTube, ExternalLink, ChevronDown, UsersRound, Gift, Cog, Menu, Bot } from 'lucide-react';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const { isAdmin, role } = useUserRole();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName.charAt(0).toUpperCase();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { to: '/chat', label: 'Chat', icon: MessageSquare, show: true },
    { to: '/products', label: 'Produtos', icon: Package, show: true },
    { to: '/customers', label: 'Clientes', icon: UsersRound, show: true },
    { to: '/offers', label: 'Ofertas', icon: Gift, show: true },
    { to: '/reports', label: 'Relatórios', icon: BarChart3, show: true },
    { to: '/ai', label: 'IA', icon: Bot, show: true },
    { to: '/users', label: 'Usuários', icon: Users, show: isAdmin },
  ];

  const apiItems = [
    { to: '/api-docs', label: 'Documentação', icon: FileText },
    { to: '/webhook-tester', label: 'Testador de Webhook', icon: TestTube },
  ];

  const settingsItems = [
    { to: '/settings', label: 'Configurações', icon: Settings },
    { to: '/store-settings', label: 'Config. da Loja', icon: Cog },
  ];

  const apiRoutes = ['/api-docs', '/webhook-tester'];
  const isApiActive = apiRoutes.includes(location.pathname);
  
  const settingsRoutes = ['/settings', '/store-settings'];
  const isSettingsActive = settingsRoutes.includes(location.pathname);

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    gerente: 'Gerente',
    vendedor: 'Vendedor',
  };

  const handleMobileNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="h-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between max-w-[1920px]">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xl font-semibold tracking-[0.3em] text-foreground">
            ACIUM
          </span>
        </div>

        {/* Mobile Menu Button */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetHeader className="p-4 border-b border-border">
              <SheetTitle className="text-left tracking-[0.2em]">ACIUM</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col py-4">
              {/* User Info */}
              <div className="flex items-center gap-3 px-4 pb-4 border-b border-border mb-4">
                <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <div>
                  <p className="font-medium text-sm">{displayName}</p>
                  {role && (
                    <span className="text-xs text-muted-foreground">{roleLabels[role]}</span>
                  )}
                </div>
              </div>

              {/* Main Navigation */}
              <div className="px-2 space-y-1">
                {navItems.filter(item => item.show).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleMobileNavClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </NavLink>
                ))}
              </div>

              {/* API Section */}
              <div className="px-4 py-2 mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">API</p>
              </div>
              <div className="px-2 space-y-1">
                {apiItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleMobileNavClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </NavLink>
                ))}
                <a
                  href="https://supabase.com/dashboard/project/ahbjwpkpxqqrpvpzmqwa/functions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                  Logs (Supabase)
                </a>
              </div>

              {/* Settings Section */}
              <div className="px-4 py-2 mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Configurações</p>
              </div>
              <div className="px-2 space-y-1">
                {settingsItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleMobileNavClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </NavLink>
                ))}
              </div>

              {/* Logout */}
              <div className="mt-auto px-2 pt-4 border-t border-border mt-4">
                <button
                  onClick={() => {
                    handleMobileNavClick();
                    signOut();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors w-full"
                >
                  <LogOut className="w-5 h-5" />
                  Sair
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        
        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto scrollbar-hide mx-4">
          {navItems.filter(item => item.show).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* API Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap shrink-0',
                  isApiActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Code className="w-4 h-4" />
                <span>API</span>
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

          {/* Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap shrink-0',
                  isSettingsActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Settings className="w-4 h-4" />
                <span>Config</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48 bg-popover z-50">
              <DropdownMenuItem asChild>
                <NavLink to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  Configurações
                </NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <NavLink to="/store-settings" className="flex items-center gap-2 cursor-pointer">
                  <Cog className="w-4 h-4" />
                  Config. da Loja
                </NavLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* User Menu (Desktop) */}
        <div className="hidden lg:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 rounded-full shrink-0 px-2">
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium leading-none truncate max-w-[100px]">{displayName}</span>
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
      </div>
    </header>
  );
};

export default Header;
