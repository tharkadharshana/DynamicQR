import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Landing.css';

export default function TermsConditions() {
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
            Dynamic QR
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
          Terms and <em>Conditions</em>
        </h1>
        
        <div style={{ color: 'var(--ink2)', fontSize: '16px', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '24px' }}>
            Welcome to Dynamic QR. These Terms and Conditions govern your use of our website and the purchase and sale of products from our platform. By accessing and using our website, you agree to comply with these terms. Please read them carefully before proceeding with any transactions.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Use of the Website</h3>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "You must be at least 18 years old to use our website or make purchases.",
              "You are responsible for maintaining the confidentiality of your account information, including your username and password.",
              "You agree to provide accurate and current information during the registration and checkout process.",
              "You may not use our website for any unlawful or unauthorized purposes."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Product Information and Pricing</h3>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "We strive to provide accurate product descriptions, images, and pricing information. However, we do not guarantee the accuracy or completeness of such information.",
              "Prices are subject to change without notice. Any promotions or discounts are valid for a limited time and may be subject to additional terms and conditions."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Orders and Payments</h3>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "By placing an order on our website, you are making an offer to purchase the selected products.",
              "We reserve the right to refuse or cancel any order for any reason, including but not limited to product availability, errors in pricing or product information, or suspected fraudulent activity.",
              "You agree to provide valid and up-to-date payment information and authorize us to charge the total order amount, including applicable taxes and shipping fees, to your chosen payment method.",
              "We use trusted third-party payment processors to handle your payment information securely. We do not store or have access to your full payment details."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Shipping and Delivery</h3>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "We will make reasonable efforts to ensure timely shipping and delivery of your orders.",
              "Shipping and delivery times provided are estimates and may vary based on your location and other factors."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Returns and Refunds</h3>
          <p style={{ marginBottom: '24px' }}>
            Our Returns and Refund Policy governs the process and conditions for returning products and seeking refunds. Please refer to the <Link to="/legal/refund-policy" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>Refund Policy</Link> provided on our website for more information.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Intellectual Property</h3>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "All content and materials on our website, including but not limited to text, images, logos, and graphics, are protected by intellectual property rights and are the property of Dynamic QR or its licensors.",
              "You may not use, reproduce, distribute, or modify any content from our website without our prior written consent."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Limitation of Liability</h3>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "In no event shall Dynamic QR, its directors, employees, or affiliates be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in connection with your use of our website or the purchase and use of our products.",
              "We make no warranties or representations, express or implied, regarding the quality, accuracy, or suitability of the products offered on our website."
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Amendments and Termination</h3>
          <p style={{ marginBottom: '24px' }}>
            We reserve the right to modify, update, or terminate these Terms and Conditions at any time without prior notice. It is your responsibility to review these terms periodically for any changes.
          </p>
          
          <p style={{ fontSize: '13px', color: 'var(--ink4)', fontStyle: 'italic', marginTop: '48px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            (Note: These Terms & Conditions are provided as a general guideline.)
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
            Dynamic QR
          </div>
          <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>© 2026 Dynamic QR. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
