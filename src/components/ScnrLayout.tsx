import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, logout } from '../firebase';

export default function ScnrLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');

  useEffect(() => {
    if (auth.currentUser) {
      const email = auth.currentUser.email || '';
      const name = auth.currentUser.displayName || email.split('@')[0] || 'User';
      setUserEmail(email);
      setUserName(name);
      setUserInitials(name.substring(0, 2).toUpperCase());
    }
  }, []);

  type NavItem = { name: string; path: string; icon: React.ReactNode; badge?: React.ReactNode; };

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="4" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="7" width="6" height="8" rx="1"/></svg>
    ), badge: <span className="nav-badge green">Live</span> },
    { name: 'Analytics', path: '/analytics', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M1 12l4-4 3 3 4-5 3 2V14H1v-2z" opacity="0.4"/><path d="M1 10l4-4 3 3 4-5 3 2"/><circle cx="1" cy="10" r="1"/><circle cx="5" cy="6" r="1"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="4" r="1"/><circle cx="15" cy="6" r="1"/></svg>
    ) },
    { name: 'Create QR', path: '/create', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
    ) }
  ];

  const accountItems: NavItem[] = [
    { name: 'Profile & Settings', path: '/settings', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg>
    ) },
    { name: 'Billing', path: '/billing', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12"/><path d="M5 10h2"/></svg>
    ), badge: <span className="nav-badge">Pro</span> },
    { name: 'API Docs', path: '/api-docs', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4M9 3l-2 10"/></svg>
    ) }
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return { title: 'Dashboard', sub: 'Live · Updated just now' };
      case '/analytics': return { title: 'Analytics', sub: 'Detailed scan insights' };
      case '/create': return { title: 'Create QR', sub: 'Generate a new QR code' };
      case '/settings': return { title: 'Profile & Settings', sub: 'Manage your account' };
      case '/billing': return { title: 'Billing', sub: 'Subscription & invoices' };
      case '/api-docs': return { title: 'API Docs', sub: 'Team plan · REST API v1' };
      default: return { title: 'Scnr', sub: '' };
    }
  };

  const { title, sub } = getPageTitle();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* MOBILE OVERLAY */}
      {mobileMenuOpen && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.5)', 
            zIndex: 90,
            backdropFilter: 'blur(4px)'
          }} 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <nav className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <svg viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white"/>
              <rect x="11" y="1" width="6" height="6" rx="1.5" fill="white"/>
              <rect x="1" y="11" width="6" height="6" rx="1.5" fill="white"/>
              <rect x="12" y="12" width="2.5" height="2.5" fill="white"/>
              <rect x="15.5" y="12" width="2.5" height="2.5" fill="white"/>
              <rect x="12" y="15.5" width="2.5" height="2.5" fill="white"/>
              <rect x="15.5" y="15.5" width="2.5" height="2.5" fill="white"/>
            </svg>
          </div>
          <span className="logo-text">Scnr</span>
          <button 
            className="btn btn-icon btn-sm md:hidden" 
            style={{ marginLeft: 'auto', border: 'none' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-label">Main</div>
          {navItems.map(item => (
            <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
              <div className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}>
                {item.icon}
                {item.name}
                {item.badge}
              </div>
            </Link>
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-label">Account</div>
          {accountItems.map(item => (
            <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
              <div className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}>
                {item.icon}
                {item.name}
                {item.badge}
              </div>
            </Link>
          ))}
          <div className="nav-item" onClick={handleLogout}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 14H3a2 2 0 01-2-2V4a2 2 0 012-2h3M11 11l3-3-3-3M14 8H5"/></svg>
            Sign out
          </div>
        </div>

        <div className="sidebar-footer">
          <Link to="/settings" style={{ textDecoration: 'none' }}>
            <div className="user-chip">
              <div className="user-av">{userInitials}</div>
              <div className="user-info">
                <div className="user-name">{userName}</div>
                <div className="user-plan"><span className="plan-badge">Pro</span></div>
              </div>
            </div>
          </Link>
        </div>
      </nav>

      {/* MAIN */}
      <div className="main">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-left">
            <button 
              className="btn btn-icon btn-sm md:hidden" 
              style={{ marginRight: '8px' }}
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <span className="page-title" id="page-title">{title}</span>
            {location.pathname === '/' && <span className="live-dot" id="live-indicator" style={{ marginLeft: '12px' }}></span>}
            <span className="page-sub hidden sm:inline" id="page-sub" style={{ marginLeft: '12px' }}>{sub}</span>
          </div>
          <div className="topbar-right">
            {(location.pathname === '/' || location.pathname === '/analytics') && (
              <button className="btn btn-ghost btn-sm hidden sm:flex" id="topbar-date">Last 30 days ▾</button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/create')}>
              <span className="hidden sm:inline">+ New QR</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
