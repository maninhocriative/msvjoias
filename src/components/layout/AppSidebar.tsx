import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Package, 
  Settings, 
  LogOut, 
  Users, 
  BarChart3, 
  Code, 
  FileText, 
  TestTube, 
  UsersRound, 
  Gift, 
  Cog, 
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ClipboardList
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const AppSidebar = ({ collapsed, onToggle }: AppSidebarProps) => {
  const { user, profile, signOut } = useAuth();
  const { isAdmin, role } = useUserRole();
  const location = useLocation();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName.charAt(0).toUpperCase();

  const mainNavItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/chat', label: 'Chat', icon: MessageSquare },
    { to: '/products', label: 'Produtos', icon: Package },
    { to: '/customers', label: 'Clientes', icon: UsersRound },
    { to: '/offers', label: 'Ofertas', icon: Gift },
    { to: '/pedidos/pendentes', label: 'Pedidos', icon: ClipboardList },
    { to: '/reports', label: 'Relatórios', icon: BarChart3 },
    { to: '/ai', label: 'IA', icon: Bot },
  ];

  const adminNavItems = [
    { to: '/users', label: 'Usuários', icon: Users },
  ];

  const apiNavItems = [
    { to: '/api-docs', label: 'Documentação', icon: FileText },
    { to: '/webhook-tester', label: 'Webhook Tester', icon: TestTube },
  ];

  const settingsNavItems = [
    { to: '/settings', label: 'Configurações', icon: Settings },
    { to: '/store-settings', label: 'Config. Loja', icon: Cog },
  ];

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    gerente: 'Gerente',
    vendedor: 'Vendedor',
  };

  const NavItem = ({ to, label, icon: Icon }: { to: string; label: string; icon: any }) => {
    const isActive = location.pathname === to;
    
    const content = (
      <NavLink
        to={to}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          collapsed && 'justify-center px-2'
        )}
      >
        <Icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  return (
    <aside
      className={cn(
        'h-screen bg-sidebar-background border-r border-sidebar-border flex flex-col transition-all duration-300 shrink-0',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Logo & Toggle */}
      <div className={cn(
        'h-16 flex items-center border-b border-sidebar-border shrink-0',
        collapsed ? 'justify-center px-2' : 'justify-between px-4'
      )}>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-[0.2em] text-sidebar-foreground">
            ACIUM
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className={cn('space-y-1', collapsed ? 'px-2' : 'px-3')}>
          {/* Main Navigation */}
          {mainNavItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          {/* Admin Items */}
          {isAdmin && adminNavItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          {!collapsed && (
            <div className="pt-4 pb-2">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                API
              </p>
            </div>
          )}
          {collapsed && <Separator className="my-3" />}

          {apiNavItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          {!collapsed ? (
            <a
              href="https://supabase.com/dashboard/project/ahbjwpkpxqqrpvpzmqwa/functions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span className="truncate">Logs</span>
            </a>
          ) : (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <a
                  href="https://supabase.com/dashboard/project/ahbjwpkpxqqrpvpzmqwa/functions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center px-2 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                Logs (Supabase)
              </TooltipContent>
            </Tooltip>
          )}

          {!collapsed && (
            <div className="pt-4 pb-2">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Configurações
              </p>
            </div>
          )}
          {collapsed && <Separator className="my-3" />}

          {settingsNavItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </ScrollArea>

      {/* User Section */}
      <div className={cn(
        'border-t border-sidebar-border p-3',
        collapsed && 'flex flex-col items-center'
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
              {role && (
                <p className="text-[10px] text-muted-foreground">{roleLabels[role]}</p>
              )}
            </div>
          </div>
        ) : (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="w-9 h-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-sm font-semibold mb-2">
                {initials}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {displayName}
              {role && <span className="block text-xs text-muted-foreground">{roleLabels[role]}</span>}
            </TooltipContent>
          </Tooltip>
        )}

        <Button
          variant="ghost"
          onClick={signOut}
          className={cn(
            'w-full text-destructive hover:text-destructive hover:bg-destructive/10',
            collapsed ? 'px-2 justify-center' : 'justify-start gap-3'
          )}
        >
          <LogOut className={cn(collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
          {!collapsed && <span>Sair</span>}
        </Button>
      </div>
    </aside>
  );
};

export default AppSidebar;
