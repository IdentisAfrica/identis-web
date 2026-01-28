import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import LandingPage from './components/LandingPage'
import VerificationFlow from './components/VerificationFlow'
import CertificateView from './components/CertificateView'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

function Home() {
  const [showVerification, setShowVerification] = useState(false)

  if (showVerification) {
    return <VerificationFlow onBack={() => setShowVerification(false)} />
  }

  return <LandingPage onStartVerification={() => setShowVerification(true)} />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/certificate/:id" element={<CertificateView />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
