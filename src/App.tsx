import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, lazy, Suspense } from 'react'
import LandingPage from './components/LandingPage'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'

// Lazy load heavy components (face-api.js is ~1.5MB)
const VerificationFlow = lazy(() => import('./components/VerificationFlow'))
const CertificateView = lazy(() => import('./components/CertificateView'))

// Loading spinner for lazy components
function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-navy-400 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white text-lg">Loading...</p>
      </div>
    </div>
  )
}

// Error boundary for lazy load failures
function ErrorFallback() {
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <div className="text-center text-white">
        <p className="text-xl mb-4">Failed to load. Please check your connection.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-3 bg-navy-600 rounded-xl hover:bg-navy-500"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

function Home() {
  const [showVerification, setShowVerification] = useState(false)

  if (showVerification) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <VerificationFlow onBack={() => setShowVerification(false)} />
      </Suspense>
    )
  }

  return <LandingPage onStartVerification={() => setShowVerification(true)} />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/certificate/:id" element={
          <Suspense fallback={<LoadingSpinner />}>
            <CertificateView />
          </Suspense>
        } />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
