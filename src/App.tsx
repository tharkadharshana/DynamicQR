import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CreateQR from './pages/CreateQR';
import Analytics from './pages/Analytics';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import SettingsPage from './pages/Settings';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsConditions from './pages/TermsConditions';
import RefundPolicy from './pages/RefundPolicy';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        {user ? (
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="create" element={<CreateQR />} />
            <Route path="edit/:id" element={<CreateQR />} />
            <Route path="analytics/:slug" element={<Analytics />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <>
            <Route path="/login" element={<Landing />} />
            <Route path="/legal/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/legal/terms-and-conditions" element={<TermsConditions />} />
            <Route path="/legal/refund-policy" element={<RefundPolicy />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}
      </Routes>
    </Router>
  );
}
