import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Pricing
        </Link>
        
        <h1 className="text-3xl font-bold text-white mb-8">Refund Policy</h1>
        
        <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-sm">
          <p>
            Thank you for shopping at Dynamic QR. We value your satisfaction and strive to provide you with the best online experience possible. If, for any reason, you are not completely satisfied with your purchase, we are here to help.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Returns</h3>
          <p>
            We accept returns within 14 days from the date of purchase. To be eligible for a return, your item must be unused and in the same condition that you received it. It must also be in the original packaging. For digital subscriptions, this means you must not have utilized the premium features excessively during the 14-day period.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Refunds</h3>
          <p>
            Once we receive your return request and inspect the usage, we will notify you of the status of your refund. If your return is approved, we will initiate a refund to your original method of payment. Please note that the refund amount will exclude any processing charges incurred during the initial purchase.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Exchanges</h3>
          <p>
            If you would like to exchange your plan for a different tier, please contact our customer support team within 14 days of your order. We will provide you with further instructions on how to proceed with the exchange and prorate any balances.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Non-Returnable Items</h3>
          <p>Certain items are non-returnable and non-refundable. These include:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Gift cards</li>
            <li>Downloadable software products or exported QR assets already utilized</li>
            <li>Personalized or custom-made items</li>
          </ul>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Damaged or Defective Service</h3>
          <p>
            In the unfortunate event that our service experiences downtime or is defective, please contact us immediately. We will arrange for a credit, compensation, or issue a refund, depending on your preference and service availability.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Processing Time</h3>
          <p>
            Refunds and exchanges will be processed within 5-7 business days after we approve your request. Please note that it may take additional time for the refund to appear in your account, depending on your payment provider.
          </p>

          <h3 className="text-lg font-semibold text-white mt-8 mb-4">Contact Us</h3>
          <p>
            If you have any questions or concerns regarding our refund policy, please contact our customer support team. We are here to assist you and ensure your experience with us is enjoyable and hassle-free.
          </p>
        </div>
      </div>
    </div>
  );
}
