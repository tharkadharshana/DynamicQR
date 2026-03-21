import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { QrCode, BarChart3, Settings, LogOut } from 'lucide-react';
import { logout } from '../firebase';

export default function Layout() {
  const location = useLocation();

  const navItems = [
    { name: 'My QR Codes', path: '/', icon: QrCode },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">qik.app</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive 
                    ? 'bg-zinc-100 text-zinc-900' 
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-200">
          <button
            onClick={logout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-zinc-600 rounded-md hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto py-8 px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
