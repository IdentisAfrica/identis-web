import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8">
        <Link to="/" className="text-green-600 hover:underline mb-4 inline-block">&larr; Back to Home</Link>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-2">NDPR Compliant</p>
        <p className="text-sm text-gray-500 mb-8">Last updated: January 2026</p>
        
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Data Controller</h2>
            <p>IDENTIS Technologies Ltd ("we", "us", "our") is the data controller responsible for your personal data. We are committed to protecting your privacy in compliance with the Nigeria Data Protection Regulation (NDPR) 2019.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Data We Collect</h2>
            <p className="mb-2">We collect the following personal data:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Phone Number:</strong> For OTP verification and account identification</li>
              <li><strong>Selfie/Facial Data:</strong> For liveness detection (processed locally, not stored permanently)</li>
              <li><strong>BVN/NIN:</strong> For government ID verification (verified via Dojah API)</li>
              <li><strong>Device Information:</strong> For fraud prevention</li>
              <li><strong>Transaction Records:</strong> Verification history and certificates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Legal Basis for Processing</h2>
            <p>We process your data based on: (a) Your explicit consent when you use our Service; (b) Contractual necessity to provide verification services; (c) Legitimate interest in preventing fraud; (d) Legal obligations under Nigerian law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Verify your identity for P2P trading counterparties</li>
              <li>Generate trust certificates</li>
              <li>Prevent fraud and abuse</li>
              <li>Comply with regulatory requirements</li>
              <li>Improve our Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Sharing</h2>
            <p className="mb-2">We share data with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Dojah:</strong> BVN/NIN verification provider</li>
              <li><strong>Termii:</strong> SMS OTP delivery</li>
              <li><strong>Paystack:</strong> Payment processing</li>
              <li><strong>Law Enforcement:</strong> When legally required</li>
            </ul>
            <p className="mt-2">We do not sell your personal data to third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
            <p>Verification records are retained for 7 years as required by Nigerian financial regulations. Selfie images used for liveness detection are deleted within 24 hours. You may request deletion of non-regulatory data at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights (NDPR)</h2>
            <p className="mb-2">Under the NDPR, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access your personal data</li>
              <li>Rectify inaccurate data</li>
              <li>Request deletion (subject to legal retention requirements)</li>
              <li>Object to processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
              <li>Lodge a complaint with NITDA</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Data Security</h2>
            <p>We implement appropriate technical and organizational measures including: encryption in transit (HTTPS/TLS), secure cloud infrastructure, access controls, and regular security audits.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. International Transfers</h2>
            <p>Your data may be processed on servers located outside Nigeria. We ensure adequate protection through standard contractual clauses and selecting providers with appropriate certifications.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Contact & Data Protection Officer</h2>
            <p>For privacy inquiries or to exercise your rights:</p>
            <p className="mt-2">Email: <a href="mailto:privacy@identis.ng" className="text-green-600 hover:underline">privacy@identis.ng</a></p>
            <p>Address: Lagos, Nigeria</p>
          </section>
        </div>
      </div>
    </div>
  )
}
