import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Landing.css';

export default function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page">
      <nav>
        <div className="nav-inner">
          <Link to="/" className="logo">
            <div className="logo-mark">
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="white"/>
                <rect x="9" y="9" width="2" height="2" fill="white"/>
                <rect x="12" y="9" width="2" height="2" fill="white"/>
                <rect x="9" y="12" width="2" height="2" fill="white"/>
                <rect x="12" y="12" width="2" height="2" fill="white"/>
              </svg>
            </div>
            Scnr
          </Link>
          <div className="nav-right">
            <Link to="/billing" className="btn-text">Back to Billing</Link>
          </div>
        </div>
      </nav>

      <div style={{ padding: '120px 40px 100px', maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div className="hero-eyebrow" style={{ opacity: 1, animation: 'none' }}>
          <span className="eyebrow-line"></span> Legal Documentation
        </div>
        <h1 className="hero-h1" style={{ opacity: 1, animation: 'none', fontSize: '48px', marginBottom: '40px' }}>
          Privacy <em>Policy</em>
        </h1>
        
        <div style={{ color: 'var(--ink2)', fontSize: '16px', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '24px' }}>
            At Dynamic QR, we are committed to protecting the privacy and security of our customers' personal information. This Privacy Policy outlines how we collect, use, and safeguard your information when you visit or make a purchase on our website. By using our website, you consent to the practices described in this policy.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Information We Collect</h3>
          <p style={{ marginBottom: '16px' }}>When you visit our website, we may collect certain information about you, including:</p>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "Personal identification information (such as your name, email address, and phone number) provided voluntarily by you during the registration or checkout process.",
              "Payment and billing information necessary to process your orders, including credit card details, which are securely handled by trusted third-party payment processors.",
              "Browsing information, such as your IP address, browser type, and device information, collected automatically using cookies and similar technologies."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Use of Information</h3>
          <p style={{ marginBottom: '16px' }}>We may use the collected information for the following purposes:</p>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "To process and fulfill your orders, including shipping and delivery.",
              "To communicate with you regarding your purchases, provide customer support, and respond to inquiries or requests.",
              "To personalize your shopping experience and present relevant product recommendations and promotions.",
              "To improve our website, products, and services based on your feedback and browsing patterns.",
              "To detect and prevent fraud, unauthorized activities, and abuse of our website."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Information Sharing</h3>
          <p style={{ marginBottom: '16px' }}>
            We respect your privacy and do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except in the following circumstances:
          </p>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            <li style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
              <span><strong>Trusted service providers:</strong> We may share your information with third-party service providers who assist us in operating our website, processing payments, and delivering products. These providers are contractually obligated to handle your data securely and confidentially.</span>
            </li>
            <li style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
              <span><strong>Legal requirements:</strong> We may disclose your information if required to do so by law or in response to valid legal requests or orders.</span>
            </li>
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Data Security</h3>
          <p style={{ marginBottom: '24px' }}>
            We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. However, please be aware that no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Cookies and Tracking Technologies</h3>
          <p style={{ marginBottom: '24px' }}>
            We use cookies and similar technologies to enhance your browsing experience, analyze website traffic, and gather information about your preferences and interactions with our website. You have the option to disable cookies through your browser settings, but this may limit certain features and functionality of our website.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Changes to the Privacy Policy</h3>
          <p style={{ marginBottom: '24px' }}>
            We reserve the right to update or modify this Privacy Policy at any time. Any changes will be posted on this page with a revised "last updated" date. We encourage you to review this Privacy Policy periodically to stay informed about how we collect, use, and protect your information.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Contact Us</h3>
          <p style={{ marginBottom: '24px' }}>
            If you have any questions, concerns, or requests regarding our Privacy Policy or the handling of your personal information, please contact us at support@dynamicqr.app.
          </p>
          
          <p style={{ fontSize: '13px', color: 'var(--ink4)', fontStyle: 'italic', marginTop: '48px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            (Note: This Privacy Policy is provided as a general guideline.)
          </p>
        </div>
      </div>

      <footer style={{ padding: '60px 40px', borderTop: '1px solid var(--border)', background: 'var(--white)', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="logo" style={{ fontSize: '18px' }}>
            <div className="logo-mark" style={{ width: '20px', height: '20px', borderRadius: '5px' }}>
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '12px', height: '12px' }}>
                <rect x="1" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="white"/>
                <rect x="9" y="9" width="2" height="2" fill="white"/>
                <rect x="12" y="9" width="2" height="2" fill="white"/>
                <rect x="9" y="12" width="2" height="2" fill="white"/>
                <rect x="12" y="12" width="2" height="2" fill="white"/>
              </svg>
            </div>
            Scnr
          </div>
          <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>© 2026 Scnr. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
