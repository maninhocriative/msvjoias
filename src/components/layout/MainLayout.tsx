import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';

const MainLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return true;
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="h-screen bg-background flex overflow-hidden w-full">

      {/* Overlay escuro no mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar desktop — sempre no flow, nunca fixed */}
      <div className="hidden lg:flex h-screen shrink-0">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p: boolean) => !p)}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Sidebar mobile — overlay fixed */}
      <div className={[
        'fixed inset-y-0 left-0 z-50 lg:hidden',
        'transition-transform duration-300 ease-in-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>
        <AppSidebar
          collapsed={false}
          onToggle={() => {}}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Conteúdo principal */}
      <main className="flex-1 min-w-0 h-screen overflow-y-auto overflow-x-hidden flex flex-col">
        {/* Topbar mobile */}
        <div className="lg:hidden flex items-center gap-3 h-12 px-4 border-b border-border bg-background shrink-0 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Abrir menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 4h13M1.5 8h13M1.5 12h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span className="text-sm font-bold tracking-[0.2em] text-foreground">MSV</span>
        </div>

        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
