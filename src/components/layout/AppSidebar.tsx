import { useLocation, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  LogOut,
  Users,
  BarChart3,
  FileText,
  TestTube,
  UsersRound,
  Gift,
  Cog,
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  Globe,
  Sparkles,
  History,
  Activity,
  FileSpreadsheet,
  X,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
}

const NAV_GROUPS = [
  {
    id: 'core',
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/chat', label: 'Chat', icon: MessageSquare },
    ],
  },
  {
    id: 'commerce',
    label: 'Vendas',
    items: [
      { to: '/products', label: 'Produtos', icon: Package },
      { to: '/customers', label: 'Clientes', icon: UsersRound },
      { to: '/offers', label: 'Ofertas', icon: Gift },
      { to: '/pedidos/pendentes', label: 'Pedidos', icon: ClipboardList },
      { to: '/sales', label: 'Vendas', icon: Trophy },
      { to: '/reports', label: 'Relatórios', icon: BarChart3 },
      { to: '/seller-monitor', label: 'Monitor', icon: Activity },
      { to: '/importar-leads', label: 'Importar Leads', icon: FileSpreadsheet },
    ],
  },
  {
    id: 'ai',
    label: 'Inteligência',
    items: [
      { to: '/ai', label: 'IA', icon: Bot },
      { to: '/ai/config', label: 'Config. IA', icon: Sparkles },
      { to: '/ai/followups', label: 'Follow-ups', icon: History },
    ],
  },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'Usuários', icon: Users },
];

const API_ITEMS = [
  { to: '/api-docs', label: 'Documentação', icon: FileText },
  { to: '/docs', label: 'Doc. Pública', icon: Globe },
  { to: '/webhook-tester', label: 'Webhook Tester', icon: TestTube },
];

const SETTINGS_ITEMS = [
  { to: '/settings', label: 'Configurações', icon: Settings },
  { to: '/store-settings', label: 'Config. Loja', icon: Cog },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
};

const AppSidebar = ({ collapsed, onToggle, onMobileClose }: AppSidebarProps) => {
  const { user, profile, signOut } = useAuth();
  const { isAdmin, isGerente, role } = useUserRole();
  const location = useLocation();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const NavItem = ({
    to,
    label,
    icon: Icon,
    exact,
  }: {
    to: string;
    label: string;
    icon: any;
    exact?: boolean;
  }) => {
    const isActive = exact
      ? location.pathname === to
      : location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    const inner = (
      <NavLink
        to={to}
        onClick={onMobileClose}
        className={cn(
          'flex items-center rounded-lg text-sm font-medium transition-all duration-150 select-none',
          collapsed
            ? 'justify-center w-9 h-9 mx-auto'
            : 'gap-2.5 px-2.5 py-2 w-full',
          isActive
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return inner;
  };

  const Section = ({ label }: { label: string | null }) => {
    if (!label) return null;
    if (collapsed) return <div className="h-px bg-border/60 mx-2 my-1.5" />;
    return (
      <p className="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
        {label}
      </p>
    );
  };

  return (
    <aside
      className={cn(
        'h-screen bg-sidebar-background border-r border-sidebar-border',
        'flex flex-col shrink-0 transition-all duration-300',
        collapsed ? 'w-[56px]' : 'w-52',
      )}
    >
      <div
        className={cn(
          'h-14 flex items-center border-b border-sidebar-border shrink-0 gap-1',
          collapsed ? 'justify-center px-1.5' : 'justify-between px-3',
        )}
      >
        {!collapsed && (
          <span className="text-sm font-bold tracking-[0.25em] text-sidebar-foreground select-none">
            MSV
          </span>
        )}

        <div className="flex items-center gap-0.5">
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggle}
            className="hidden lg:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <nav
          className={cn(
            'py-2',
            collapsed ? 'px-1.5 space-y-0.5' : 'px-2 space-y-0.5',
          )}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <Section label={group.label} />
              {group.items.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          ))}

          {isAdmin && (
            <div>
              <Section label="Admin" />
              {ADMIN_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          )}

          {(isAdmin || isGerente) && (
            <div>
              <Section label="API" />
              {API_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}

              {collapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <a
                      href="https://supabase.com/dashboard/project/ahbjwpkpxqqrpvpzmqwa/functions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs font-medium">
                    Logs (Supabase)
                  </TooltipContent>
                </Tooltip>
              ) : (
                <a
                  href="https://supabase.com/dashboard/project/ahbjwpkpxqqrpvpzmqwa/functions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all w-full"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span className="truncate">Logs</span>
                </a>
              )}
            </div>
          )}

          <div>
            <Section label="Config." />
            {SETTINGS_ITEMS.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </nav>
      </ScrollArea>

      <div
        className={cn(
          'border-t border-sidebar-border shrink-0 p-2',
          collapsed ? 'flex flex-col items-center gap-1' : '',
        )}
      >
        {collapsed ? (
          <>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-bold cursor-default select-none">
                  {initials}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs font-medium">{displayName}</p>
                {role && (
                  <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[role]}</p>
                )}
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Sair
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className="flex items-center gap-2 px-1 py-0.5">
            <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-bold shrink-0 select-none">
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                {displayName}
              </p>
              {role && (
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {ROLE_LABELS[role]}
                </p>
              )}
            </div>

            <button
              onClick={signOut}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all shrink-0"
              title="Sair"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
