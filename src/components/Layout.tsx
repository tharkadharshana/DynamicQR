import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { QrCode, BarChart3, Settings, LogOut, CreditCard, Menu, X, Zap } from 'lucide-react';
import { logout, auth } from '../firebase';

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { name: 'My QR Codes', path: '/', icon: QrCode },
    { name: 'Pricing', path: '/pricing', icon: CreditCard },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const user = auth.currentUser;

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-[260px] bg-[#0f0f18] border-r border-white/[0.06] flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-shadow">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-[17px] font-bold text-white tracking-tight">Scnr</span>
            <span className="text-[10px] font-medium text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded-full tracking-wider uppercase">Beta</span>
          </Link>
          <button
            className="lg:hidden p-1 text-zinc-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 mt-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center px-3 py-2.5 text-[13px] font-medium rounded-lg transition-all duration-150 ${
                  isActive
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                }`}
              >
                <Icon className={`mr-3 h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-violet-400' : ''}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-white/[0.06]">
          {user && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center text-[11px] font-semibold text-violet-300">
                {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-zinc-200 truncate">
                  {user.displayName || user.email?.split('@')[0]}
                </div>
                <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center w-full px-3 py-2 text-[13px] font-medium text-zinc-500 rounded-lg hover:bg-white/[0.04] hover:text-zinc-300 transition-all"
          >
            <LogOut className="mr-3 h-[18px] w-[18px] flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-white/[0.06]">
          <button
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06]"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold text-white">Scnr</span>
          </div>
          <div className="w-8" />
        </div>

        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
