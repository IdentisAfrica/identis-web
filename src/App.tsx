import { useState } from 'react'
import LandingPage from './components/LandingPage'
import VerificationFlow from './components/VerificationFlow'

function App() {
  const [showVerification, setShowVerification] = useState(false)

  if (showVerification) {
    return <VerificationFlow onBack={() => setShowVerification(false)} />
  }

  return <LandingPage onStartVerification={() => setShowVerification(true)} />
}

export default App
