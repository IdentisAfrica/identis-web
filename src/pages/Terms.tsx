import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8">
        <Link to="/" className="text-green-600 hover:underline mb-4 inline-block">&larr; Back to Home</Link>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: January 2026</p>
        
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using IDENTIS ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. IDENTIS is operated by IDENTIS Technologies Ltd, a company registered in Nigeria.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p>IDENTIS provides identity verification services for peer-to-peer cryptocurrency transactions in Nigeria. Our Service enables users to verify the identity of trading counterparties through phone verification, liveness detection, and government ID (BVN/NIN) verification.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Eligibility</h2>
            <p>You must be at least 18 years old and a resident of Nigeria to use this Service. By using IDENTIS, you represent that you meet these requirements.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. User Obligations</h2>
            <p>You agree to: (a) provide accurate and truthful information; (b) not impersonate another person; (c) not use the Service for fraudulent purposes; (d) comply with all applicable Nigerian laws and regulations.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Verification Process</h2>
            <p>When you request verification of another party, you pay a non-refundable fee of ₦2,500. The person being verified completes the process for free. Verification certificates are valid for 1 hour from issuance.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Limitation of Liability</h2>
            <p>IDENTIS provides identity verification as a risk-reduction tool, not a guarantee against fraud. We are not liable for any losses arising from transactions between users, even if one party was verified through our Service. Maximum liability is limited to the verification fee paid.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Data Protection</h2>
            <p>We process personal data in accordance with the Nigeria Data Protection Regulation (NDPR). See our <Link to="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link> for details on how we collect, use, and protect your information.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Termination</h2>
            <p>We may suspend or terminate your access to the Service at any time for violation of these Terms or for any other reason at our discretion.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Governing Law</h2>
            <p>These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Lagos State, Nigeria.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Contact</h2>
            <p>For questions about these Terms, contact us at: <a href="mailto:legal@identis.ng" className="text-green-600 hover:underline">legal@identis.ng</a></p>
          </section>
        </div>
      </div>
    </div>
  )
}
