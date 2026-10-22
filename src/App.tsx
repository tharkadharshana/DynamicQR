import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabase';
import { apiFetch } from './lib/api';
import { setShortDomain } from './lib/qrContent';
import Landing from './pages/Landing';

// Everything except the landing page is split into its own chunk, so logged-out
// visitors don't download recharts, qr-code-styling and the dashboard.
const DynamicQRLayout = lazy(() => import('./components/DynamicQRLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateQR = lazy(() => import('./pages/CreateQR'));
const Kit = lazy(() => import('./pages/Kit'));
const Pages = lazy(() => import('./pages/Pages'));
const Templates = lazy(() => import('./pages/Templates'));
const AdminTemplates = lazy(() => import('./pages/AdminTemplates'));
const TemplateEditor = lazy(() => import('./pages/PageEditor').then(m => ({ default: m.TemplateEditor })));
const PageEditor = lazy(() => import('./pages/PageEditor'));
const Forms = lazy(() => import('./pages/Forms'));
const FormResponses = lazy(() => import('./pages/Forms').then(m => ({ default: m.FormResponses })));
const FormEditor = lazy(() => import('./pages/FormEditor'));
const Bulk = lazy(() => import('./pages/Bulk'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const KitPrint = lazy(() => import('./pages/KitPrint'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AccountAnalytics = lazy(() => import('./pages/AccountAnalytics'));
const Billing = lazy(() => import('./pages/Billing'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsConditions = lazy(() => import('./pages/TermsConditions'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const Tools = lazy(() => import('./pages/Tools'));
const WhatsNew = lazy(() => import('./pages/WhatsNew'));

const loadingScreen = (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0C0D10',
    color: '#9B9A93',
    fontSize: '14px',
    fontFamily: 'sans-serif'
  }}>
    Loading...
  </div>
);

import ErrorBoundary from './components/ErrorBoundary';

import { UIProvider } from './shared/UIContext';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes FIRST — this catches the OAuth callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        apiFetch('/api/user/plan')
          .then(d => { setShortDomain(d?.custom_domain); setPlanData(d); })
          .catch(err => console.error('Failed to fetch plan:', err));
      } else {
        setPlanData(null);
      }
    });

    // Also check existing session on mount (for page refreshes)
    supabase.auth.getSession().then(({ data: { session } }) => {
      // onAuthStateChange will also fire, but this ensures we don't hang
      // if the event doesn't fire quickly
      if (!session) {
        setLoading(false);
      }
    });

    // Safety timeout
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  if (loading) return loadingScreen;

  return (
    <ErrorBoundary>
      <UIProvider>
        <Router>
          <Suspense fallback={loadingScreen}>
          <Routes>
            {/* Public Legal Routes */}
            <Route path="/legal/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/legal/terms-and-conditions" element={<TermsConditions />} />
            <Route path="/legal/refund-policy" element={<RefundPolicy />} />

            {/* Public tools and release notes: no login */}
            <Route path="/tools" element={<Tools />} />
            <Route path="/tools/:slug" element={<Tools />} />
            <Route path="/whats-new" element={<WhatsNew />} />

            {user ? (
              <Route path="/" element={<DynamicQRLayout planData={planData} />}>
                <Route index element={<Dashboard />} />
                <Route path="create" element={<CreateQR key="create" />} />
                <Route path="kit" element={<Kit />} />
                <Route path="pages" element={<Templates />} />
                <Route path="pages/mine" element={<Pages />} />
                <Route path="admin/templates" element={<AdminTemplates />} />
                <Route path="admin/templates/new" element={<TemplateEditor />} />
                <Route path="admin/templates/:id/edit" element={<TemplateEditor />} />
                <Route path="pages/new" element={<PageEditor />} />
                <Route path="pages/:slug/edit" element={<PageEditor />} />
                <Route path="forms" element={<Forms />} />
                <Route path="forms/new" element={<FormEditor />} />
                <Route path="forms/:slug/edit" element={<FormEditor />} />
                <Route path="forms/:slug/responses" element={<FormResponses />} />
                <Route path="bulk" element={<Bulk />} />
                <Route path="api-docs" element={<ApiDocs />} />
                <Route path="kit/print/:slug" element={<KitPrint />} />
                <Route path="edit/:id" element={<CreateQR key="edit" />} />
                <Route path="analytics" element={<AccountAnalytics />} />
                <Route path="analytics/:slug" element={<Analytics />} />
                <Route path="billing" element={<Billing />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            ) : (
              <>
                <Route path="/login" element={<Landing />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </>
            )}
          </Routes>
          </Suspense>
        </Router>
      </UIProvider>
    </ErrorBoundary>
  );
}