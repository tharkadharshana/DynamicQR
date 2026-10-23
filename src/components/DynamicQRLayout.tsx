import React, { Suspense, useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, logout } from '../supabase';
import { useUI } from '../shared/UIContext';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import HelpButton from './HelpButton';

export default function DynamicQRLayout({ planData }: { planData?: any }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [params, setParams] = useSearchParams();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const gallery = location.pathname === '/pages'; // only changes the search placeholder: every page shares one shell
  // Editors draw their own header (back arrow, title, actions), so the top bar keeps only search and actions there.
  const ownHeader = /^\/(forms\/new|forms\/[^/]+\/edit|pages\/new|pages\/[^/]+\/edit|create|edit\/[^/]+|admin\/templates\/.+)$/.test(location.pathname);

  const currentPlan = planData?.plan || 'free';
  const planLabel = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
  const isTrial = planData?.is_trial;

  // Show banner when trial has ended or paid plan has expired
  const showTrialBanner = !bannerDismissed && planData && planData.plan === 'free' && !planData.is_trial;
  const bannerIsExpired = planData?.is_expired;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const email = session.user.email || '';
        const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || email.split('@')[0] || 'User';
        setUserEmail(email);
        setUserName(name);
        setUserInitials(name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase());
      }
    });
  }, []);

  type NavItem = { name: string; path: string; icon: React.ReactNode; badge?: React.ReactNode; };

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="4" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="7" width="6" height="8" rx="1"/></svg>
    ) },
    { name: 'Pages', path: '/pages', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="1.5" width="8" height="13" rx="1.5"/><path d="M6 5h4M6 8h4M6 11h2"/></svg>
    ) },
    { name: 'Forms', path: '/forms', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1.5" width="12" height="13" rx="1.5"/><path d="M5 5h6M5 8h6"/><rect x="5" y="10.5" width="3" height="2"/></svg>
    ) },
    { name: 'Restaurant Kit', path: '/kit', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2v5a2 2 0 004 0V2M5 2v12M11 2c-1.5 1-2 3-2 5h2v7"/></svg>
    ) },
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
    ), badge: planData ? <span className={`nav-badge ${currentPlan === 'free' ? '' : 'amber'}`}>{isTrial ? 'Trial' : planLabel}</span> : null },
  ];

  if (planData?.limits?.bulk_create) navItems.push({ name: 'Bulk create', path: '/bulk', icon: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="5" height="5"/><rect x="9.5" y="1.5" width="5" height="5"/><rect x="1.5" y="9.5" width="5" height="5"/><path d="M12 9v6M9 12h6"/></svg>
  ) });
  if (planData?.limits?.api_access) accountItems.push({ name: 'API Docs', path: '/api-docs', icon: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4M9 3l-2 10"/></svg>
  ) });

  if (planData?.is_admin) accountItems.push({ name: 'Template admin', path: '/admin/templates', icon: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M11.5 9v5M9 11.5h5"/></svg>
  ) });
  if (planData?.is_admin) accountItems.push({ name: 'AI costs', path: '/admin/ai-costs', icon: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5v13M11 4.5H6.5a2 2 0 000 4h3a2 2 0 010 4H5"/></svg>
  ) });

  const legalItems: NavItem[] = [
    { name: 'Privacy Policy', path: '/legal/privacy-policy', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z"/><path d="M6 6h4M6 10h4"/></svg>
    ) },
    { name: 'Terms & Conditions', path: '/legal/terms-and-conditions', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 2L7 14M5 6h6M4 10h6"/></svg>
    ) },
    { name: 'Refund Policy', path: '/legal/refund-policy', icon: (
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6l3 3 6-6M3 12h10"/></svg>
    ) }
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return { title: 'Dashboard', sub: 'Your codes and scans' };
      case '/analytics': return { title: 'Analytics', sub: 'Detailed scan insights' };
      case '/create': return { title: 'Create QR', sub: 'Generate a new QR code' };
      case '/pages': return { title: 'Pages', sub: 'Mobile landing pages behind one QR' };
      case '/admin/templates': return { title: 'Template admin', sub: 'Manage the page templates' };
      case '/admin/ai-costs': return { title: 'AI costs', sub: 'Usage and cost per user' };
      case '/pages/mine': return { title: 'Your pages', sub: 'Pages you have created' };
      case '/pages/new': return { title: 'New page', sub: 'Start from a template or a blank page' };
      case '/forms': return { title: 'Forms', sub: 'Collect answers from a QR scan' };
      case '/forms/new': return { title: 'New form', sub: 'Fields, preview and where answers go' };
      case '/kit': return { title: 'Restaurant Kit', sub: 'Menu, reviews, Wi-Fi and offers on one code' };
      case '/bulk': return { title: 'Bulk create', sub: 'Many codes from one CSV' };
      case '/api-docs': return { title: 'API Docs', sub: 'REST API v1' };
      case '/settings': return { title: 'Profile & Settings', sub: 'Manage your account' };
      case '/billing': return { title: 'Billing', sub: 'Subscription & invoices' };
      case '/pricing': return { title: 'Pricing', sub: 'Choose your plan' };
      case '/legal/privacy-policy': return { title: 'Privacy Policy', sub: 'Legal documentation' };
      case '/legal/terms-and-conditions': return { title: 'Terms & Conditions', sub: 'Legal documentation' };
      case '/legal/refund-policy': return { title: 'Refund Policy', sub: 'Legal documentation' };
      default: return location.pathname.startsWith('/admin/templates') ? { title: 'Template admin', sub: 'Edit a template' } : { title: 'Scnr QR Codes', sub: 'with Real-Time Analytics' };
    }
  };

  const { title, sub } = getPageTitle();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useUI();

  // ⌘K / Ctrl+K focuses the search box. Typing sets ?q=, which the Pages gallery and the Dashboard read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const searchQ = params.get('q') || '';
  const searchUsed = gallery || location.pathname === '/';
  const onSearch = (v: string) => {
    if (searchUsed) setParams(v ? { q: v } : {}, { replace: true });
  };

  // Update document title for SEO
  useEffect(() => {
    document.title = `${title} | Scnr`;
  }, [title]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* MOBILE OVERLAY */}
      {mobileMenuOpen && (
        <div 
          className="menu-overlay"
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
            className="btn btn-icon btn-sm mobile-only" 
            style={{ marginLeft: 'auto', border: 'none' }}
            aria-label="Close menu"
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

        {/* <div className="nav-section">
          <div className="nav-label">Legal</div>
          {legalItems.map(item => (
            <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
              <div className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}>
                {item.icon}
                {item.name}
              </div>
            </Link>
          ))}
        </div> */}

        <div className="sidebar-footer">
          <Link to="/settings" style={{ textDecoration: 'none' }}>
            <div className="user-chip">
              <div className="user-av">{userInitials}</div>
              <div className="user-info">
                <div className="user-name">{userName}</div>
                <div className="user-plan">{planData && <span className={`plan-badge ${currentPlan === 'free' ? '' : 'amber'}`}>{isTrial ? 'Trial' : `${planLabel} Plan`}</span>}</div>
              </div>
              <svg className="user-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5"/></svg>
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
              className="btn btn-icon btn-sm mobile-only" 
              style={{ marginRight: '8px' }}
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            {!ownHeader && <h1 className="page-title" id="page-title">{title}</h1>}
            {!ownHeader && <span className="page-sub hidden sm:inline" id="page-sub" style={{ marginLeft: '12px' }}>{sub}</span>}
            <label className="top-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
              <input ref={searchRef} type="search" value={searchUsed ? searchQ : ''} onChange={e => onSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !searchUsed) navigate(`/?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`); }}
                placeholder={gallery ? 'Search templates, categories...' : 'Search anything...'} aria-label="Search" />
              <kbd>⌘ K</kbd>
            </label>
          </div>
          <div className="topbar-right">
            <WorkspaceSwitcher planData={planData} />
            <button
              className="btn btn-icon btn-sm"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <button className="btn btn-icon btn-sm bell-btn" aria-label="Notifications" title="Notifications"
              onClick={() => navigate(showTrialBanner ? '/billing' : '/settings')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>
              {currentPlan === 'free' && <span className="bell-dot" />}
            </button>
            <button className="btn btn-primary btn-sm new-qr-btn" onClick={() => navigate('/create')} aria-label="New QR">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              <span className="hidden sm:inline">New QR</span>
            </button>
          </div>
        </div>
        {/* Trial ended / subscription expired banner */}
        {showTrialBanner && (
          <div style={{
            background: bannerIsExpired ? 'var(--red-l, rgba(239,68,68,0.1))' : 'rgba(245,158,11,0.08)',
            borderBottom: `1px solid ${bannerIsExpired ? 'var(--red, #ef4444)' : 'var(--amber, #f59e0b)'}`,
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={bannerIsExpired ? 'var(--red, #ef4444)' : 'var(--amber, #f59e0b)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontSize: '13px', color: bannerIsExpired ? 'var(--red, #ef4444)' : 'var(--amber, #f59e0b)', fontWeight: 500 }}>
                {bannerIsExpired ? 'Your subscription has expired.' : 'Your free trial has ended.'}{' '}
                {planData.pause_on
                  ? `${planData.dynamic_over_allowance} dynamic code${planData.dynamic_over_allowance === 1 ? '' : 's'} above the Free plan ${new Date(planData.pause_on) > new Date() ? 'pause on' : 'paused on'} ${new Date(planData.pause_on).toLocaleDateString()}. Nothing is deleted.`
                  : 'Free keeps 3 codes, 1 of them dynamic.'}{' '}
                <Link to="/billing" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>
                  Upgrade to Pro →
                </Link>
              </span>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '2px 6px', lineHeight: 1, fontSize: '16px', flexShrink: 0 }}
              aria-label="Dismiss"
            >×</button>
          </div>
        )}

        {/* Keep the sidebar on screen while the next page chunk loads. */}
        <Suspense fallback={null}><Outlet context={{ planData }} /></Suspense>
        <HelpButton />
      </div>
    </div>
  );
}
