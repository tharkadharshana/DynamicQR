import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Pricing
        </Link>
        
        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
        
        <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-sm">
          <p>
            At Dynamic QR, we are committed to protecting the privacy and security of our customers' personal information. This Privacy Policy outlines how we collect, use, and safeguard your information when you visit or make a purchase on our website. By using our website, you consent to the practices described in this policy.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Information We Collect</h3>
          <p>When you visit our website, we may collect certain information about you, including:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Personal identification information (such as your name, email address, and profile picture) provided voluntarily by you during the registration or checkout process via Google Authentication.</li>
            <li>Payment and billing information necessary to process your orders, which are securely handled by trusted third-party payment processors (PayHere). We do not store full credit card details on our servers.</li>
            <li>Browsing information, such as your IP address, browser type, and device information, collected automatically to provide analytics for our dynamic QR redirects.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Use of Information</h3>
          <p>We may use the collected information for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>To process and fulfill your subscription orders.</li>
            <li>To communicate with you regarding your purchases, provide customer support, and respond to inquiries or requests.</li>
            <li>To personalize your experience and present relevant features.</li>
            <li>To improve our website, products, and services based on your feedback and usage patterns.</li>
            <li>To detect and prevent fraud, unauthorized activities, and abuse of our website.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Information Sharing</h3>
          <p>
            We respect your privacy and do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except in the following circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Trusted service providers:</strong> We may share your information with third-party service providers who assist us in operating our website, processing payments (PayHere), and delivering services. These providers are contractually obligated to handle your data securely and confidentially.</li>
            <li><strong>Legal requirements:</strong> We may disclose your information if required to do so by law or in response to valid legal requests or orders.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Data Security</h3>
          <p>
            We implement industry-standard security measures, including Google Firebase Auth and Cloudflare edge networks, to protect your personal information from unauthorized access, alteration, disclosure, or destruction. However, please be aware that no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Cookies and Tracking Technologies</h3>
          <p>
            We use cookies and similar technologies to enhance your browsing experience, manage authentication sessions, and gather information about interactions with our website and QR redirects. You have the option to disable cookies through your browser settings, but this may limit certain features and functionality of our platform.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Changes to the Privacy Policy</h3>
          <p>
            We reserve the right to update or modify this Privacy Policy at any time. Any changes will be posted on this page with a revised "last updated" date. We encourage you to review this Privacy Policy periodically to stay informed about how we collect, use, and protect your information.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Contact Us</h3>
          <p>
            If you have any questions, concerns, or requests regarding our Privacy Policy or the handling of your personal information, please contact us at support@dynamicqr.app.
          </p>
        </div>
      </div>
    </div>
  );
}
