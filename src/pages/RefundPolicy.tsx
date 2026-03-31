import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Landing.css';

export default function RefundPolicy() {
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
          Refund <em>Policy</em>
        </h1>
        
        <div style={{ color: 'var(--ink2)', fontSize: '16px', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '24px' }}>
            Thank you for shopping at Dynamic QR. We value your satisfaction and strive to provide you with the best online experience possible. If, for any reason, you are not completely satisfied with your purchase, we are here to help.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Returns</h3>
          <p style={{ marginBottom: '24px' }}>
            We accept returns within 14 days from the date of purchase. To be eligible for a return, your item must be unused and in the same condition that you received it. It must also be in the original packaging.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Refunds</h3>
          <p style={{ marginBottom: '24px' }}>
            Once we receive your return and inspect the item, we will notify you of the status of your refund. If your return is approved, we will initiate a refund to your original method of payment. Please note that the refund amount will exclude any shipping charges incurred during the initial purchase.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Exchanges</h3>
          <p style={{ marginBottom: '24px' }}>
            If you would like to exchange your item for a different size, color, or style, please contact our customer support team within 14 days of receiving your order. We will provide you with further instructions on how to proceed with the exchange.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Non-Returnable Items</h3>
          <p style={{ marginBottom: '16px' }}>Certain items are non-returnable and non-refundable. These include:</p>
          <ul style={{ listStyle: 'none', paddingLeft: '0', marginBottom: '24px' }}>
            {[
              "Gift cards",
              "Downloadable software products",
              "Personalized or custom-made items",
              "Perishable goods"
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral)', fontWeight: 'bold', marginTop: '2px' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Damaged or Defective Items</h3>
          <p style={{ marginBottom: '24px' }}>
            In the unfortunate event that your item arrives damaged or defective, please contact us immediately. We will arrange for a replacement or issue a refund, depending on your preference and product availability.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Return Shipping</h3>
          <p style={{ marginBottom: '24px' }}>
            You will be responsible for paying the shipping costs for returning your item unless the return is due to our error (e.g., wrong item shipped, defective product). In such cases, we will provide you with a prepaid shipping label.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Processing Time</h3>
          <p style={{ marginBottom: '24px' }}>
            Refunds and exchanges will be processed within 7 business days after we receive your returned item. Please note that it may take additional time for the refund to appear in your account, depending on your payment provider.
          </p>

          <h3 style={{ fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '48px', marginBottom: '16px' }}>Contact Us</h3>
          <p style={{ marginBottom: '24px' }}>
            If you have any questions or concerns regarding our refund policy, please contact our customer support team. We are here to assist you and ensure your shopping experience with us is enjoyable and hassle-free.
          </p>
          
          <p style={{ fontSize: '13px', color: 'var(--ink4)', fontStyle: 'italic', marginTop: '48px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            (Note: This Refund Policy is provided as a general guideline.)
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
