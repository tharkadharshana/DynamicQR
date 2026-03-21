import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TermsConditions() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Pricing
        </Link>
        
        <h1 className="text-3xl font-bold text-white mb-8">Terms and Conditions</h1>
        
        <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-sm">
          <p>
            Welcome to Dynamic QR. These Terms and Conditions govern your use of our website and the purchase and use of subscription plans from our platform. By accessing and using our website, you agree to comply with these terms. Please read them carefully before proceeding with any transactions.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Use of the Website</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>You must be at least 18 years old to use our website or make purchases.</li>
            <li>You are responsible for maintaining the confidentiality of your account information, including authentication credentials.</li>
            <li>You agree to provide accurate and current information during the registration and checkout process.</li>
            <li>You may not use our website or QR codes for any unlawful, malicious, or unauthorized purposes, including but not limited to phishing or hosting malware.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Product Information and Pricing</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>We strive to provide accurate service descriptions and pricing information. However, we do not guarantee the absolute accuracy or completeness of such information.</li>
            <li>Prices are subject to change without notice. Any promotions or discounts are valid for a limited time and may be subject to additional terms and conditions.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Orders and Payments</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>By subscribing to a plan on our website, you are making an offer to purchase the selected tier.</li>
            <li>We reserve the right to refuse or cancel any subscription for any reason, including but not limited to abuse of service, errors in pricing, or suspected fraudulent activity.</li>
            <li>You agree to provide valid and up-to-date payment information and authorize us to charge the total order amount, including applicable taxes, to your chosen payment method.</li>
            <li>We use trusted third-party payment processors (such as PayHere) to handle your payment information securely. We do not store or have access to your full payment details.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Service Availability</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>We will make reasonable efforts to ensure 99.9% uptime for our redirect infrastructure.</li>
            <li>Service availability provided is an estimate and may vary based on external factors like CDN providers or DNS propagation.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Returns and Refunds</h3>
          <p>
            Our Returns and Refund Policy governs the process and conditions for seeking refunds. Please refer to the <Link to="/legal/refund-policy" className="text-violet-400 hover:text-violet-300 underline">Refund Policy</Link> provided on our website for more information.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Intellectual Property</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>All content and materials on our website, including but not limited to text, images, logos, and graphics, are protected by intellectual property rights and are the property of Dynamic QR or its licensors.</li>
            <li>You may not use, reproduce, distribute, or modify any content from our website without our prior written consent. The QR codes you generate, however, belong to you.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Limitation of Liability</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>In no event shall Dynamic QR, its directors, employees, or affiliates be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in connection with your use of our website or the use of our QR codes.</li>
            <li>We make no warranties or representations, express or implied, regarding the uninterrupted accuracy or suitability of the features offered on our website.</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Amendments and Termination</h3>
          <p>
            We reserve the right to modify, update, or terminate these Terms and Conditions at any time without prior notice. It is your responsibility to review these terms periodically for any changes.
          </p>
        </div>
      </div>
    </div>
  );
}
