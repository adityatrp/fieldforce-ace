import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, MapPin, Receipt, Trophy, Users, LogOut, Menu, X, FileText, Route,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, role, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const location = useLocation();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/visits', icon: MapPin, label: 'Visits' },
    ...(role === 'admin' || role === 'team_lead'
      ? [{ to: '/tracking', icon: Route, label: 'Tracking' }]
      : []),
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/leaderboard', icon: Trophy, label: 'Board' },
    ...(role === 'admin' || role === 'team_lead'
      ? [{ to: '/team', icon: Users, label: 'Team' }]
      : []),
    ...(role === 'admin'
      ? [{ to: '/reports', icon: FileText, label: 'Reports' }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex-col transition-transform hidden lg:flex lg:static',
        )}
      >
        <div className="p-5 flex items-center gap-2">
          <MapPin className="h-6 w-6 text-accent" />
          <span className="font-bold text-lg">FieldForce Pro</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-bold">
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{role?.replace('_', ' ') || 'salesperson'}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Slide-out menu */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 bg-sidebar text-sidebar-foreground flex flex-col transition-transform lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-5 flex items-center justify-between safe-top">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-accent" />
            <span className="font-bold text-lg">FieldForce Pro</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-sidebar-foreground/70 native-btn">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-3 px-5 pb-4">
          <div className="h-10 w-10 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-bold">
            {(profile?.full_name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{role?.replace('_', ' ') || 'salesperson'}</p>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all native-btn',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col pb-[5.5rem] lg:pb-0">
        {/* Top app bar — Material 3 style on mobile, slim on desktop */}
        <header className="app-topbar sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b safe-top">
          <div className="flex items-center gap-2 px-4 lg:px-6 h-14">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden -ml-1 h-10 w-10 rounded-full flex items-center justify-center text-foreground native-btn hover:bg-muted/60 active:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="font-semibold text-foreground text-[17px] tracking-tight truncate flex-1">
              {navItems.find(n => n.to === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
        </header>

        <div className="flex-1 px-4 py-4 lg:px-6 lg:py-6 max-w-7xl mx-auto w-full animate-fade-in">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar — Material 3 navigation bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border/60 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1 h-[4.25rem]">
          {navItems.slice(0, 5).map(item => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex-1 flex flex-col items-center justify-start gap-1 py-1 native-btn select-none',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center h-8 w-16 rounded-full transition-all duration-200',
                    isActive ? 'bg-primary/15' : 'bg-transparent'
                  )}
                >
                  <item.icon className={cn('h-[22px] w-[22px]', isActive && 'text-primary')} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className={cn('text-[11px] leading-none tracking-tight', isActive ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;