import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { apiFetch } from './lib/api';

import DynamicQRLayout from './components/DynamicQRLayout';
import Dashboard from './pages/Dashboard';
import CreateQR from './pages/CreateQR';
import Analytics from './pages/Analytics';
import AccountAnalytics from './pages/AccountAnalytics';
import ApiDocs from './pages/ApiDocs';
import Billing from './pages/Billing';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import SettingsPage from './pages/Settings';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsConditions from './pages/TermsConditions';
import RefundPolicy from './pages/RefundPolicy';

import ErrorBoundary from './components/ErrorBoundary';

import { UIProvider } from './shared/UIContext';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const data = await apiFetch('/api/user/plan');
          setPlanData(data);
        } catch (err) {
          console.error("Failed to fetch plan:", err);
        }
      } else {
        setPlanData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <UIProvider>
        <Router>
          <Routes>
            {/* Public Legal Routes */}
            <Route path="/legal/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/legal/terms-and-conditions" element={<TermsConditions />} />
            <Route path="/legal/refund-policy" element={<RefundPolicy />} />

            {user ? (
              <Route path="/" element={<DynamicQRLayout planData={planData} />}>
                <Route index element={<Dashboard />} />
                <Route path="create" element={<CreateQR />} />
                <Route path="edit/:id" element={<CreateQR />} />
                <Route path="analytics" element={<AccountAnalytics />} />
                <Route path="analytics/:slug" element={<Analytics />} />
                <Route path="api-docs" element={<ApiDocs />} />
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
        </Router>
      </UIProvider>
    </ErrorBoundary>
  );
}
