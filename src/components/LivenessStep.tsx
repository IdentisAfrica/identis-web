import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as blazeface from '@tensorflow-models/blazeface'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props { verificationId: string; onNext: () => void }
interface FaceBox { topLeft: [number, number]; bottomRight: [number, number]; probability: number }

const CHALLENGES = [
  { id: 'center', title: 'Center Your Face', instruction: 'Position your face in the center of the oval', hint: 'Look straight at the camera', icon: '🎯' },
  { id: 'closer', title: 'Move Closer', instruction: 'Slowly move your phone closer to your face', hint: 'Fill more of the frame', icon: '🔍' },
  { id: 'turn', title: 'Turn Your Head', instruction: 'Slowly turn your head left or right', hint: 'Then return to center', icon: '↔️' }
]

export default function LivenessStep({ verificationId, onNext }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingMsg, setLoadingMsg] = useState('Initializing...')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'init'|'ready'|'checking'|'submitting'|'complete'|'failed'>('init')
  const [faceDetected, setFaceDetected] = useState(false)
  const [facePosition, setFacePosition] = useState<'good'|'left'|'right'|'up'|'down'|'far'|'close'|'none'>('none')
  const [progress, setProgress] = useState(0)
  const [challengeProgress, setChallengeProgress] = useState(0)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<blazeface.BlazeFaceModel|null>(null)
  const streamRef = useRef<MediaStream|null>(null)
  const animRef = useRef<number|null>(null)
  const challengeIdx = useRef(0)
  const holdFrames = useRef(0)
  const completed = useRef<string[]>([])
  const selfie = useRef<string|null>(null)
  const faceCount = useRef(0)
  const noFaceCount = useRef(0)
  const stableFace = useRef(false)

  const submitResult = useCallback(async (score: number) => {
    setStep('submitting')
    try {
      const res = await fetch(API_URL + '/api/verify/liveness', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, livenessScore: score, selfieBase64: selfie.current })
      })
      if (!res.ok) throw new Error('Server error')
      setStep('complete')
      setTimeout(() => onNext(), 1500)
    } catch { setError('Failed to save. Please try again.'); setStep('failed') }
  }, [verificationId, onNext])

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !modelRef.current || step === 'complete' || step === 'submitting' || step === 'failed') return
    const video = videoRef.current
    if (video.readyState < 2) { animRef.current = requestAnimationFrame(processFrame); return }
    
    try {
      const preds = await modelRef.current.estimateFaces(video, false)
      const hasFace = preds.length > 0 && (preds[0] as FaceBox).probability >= 0.7
      
      if (hasFace) { faceCount.current++; noFaceCount.current = 0; if (faceCount.current >= 3) stableFace.current = true }
      else { noFaceCount.current++; faceCount.current = 0; if (noFaceCount.current >= 5) stableFace.current = false }
      
      setFaceDetected(stableFace.current)
      
      if (!hasFace) { setFacePosition('none'); animRef.current = requestAnimationFrame(processFrame); return }
      
      const face = preds[0] as FaceBox
      const [x1, y1] = face.topLeft, [x2, y2] = face.bottomRight
      const cx = (x1 + x2) / 2 / video.videoWidth, cy = (y1 + y2) / 2 / video.videoHeight
      const size = Math.max((x2 - x1) / video.videoWidth, (y2 - y1) / video.videoHeight)
      
      if (size < 0.15) setFacePosition('far')
      else if (size > 0.45) setFacePosition('close')
      else if (cx < 0.35) setFacePosition('left')
      else if (cx > 0.65) setFacePosition('right')
      else if (cy < 0.35) setFacePosition('up')
      else if (cy > 0.65) setFacePosition('down')
      else setFacePosition('good')
      
      if (step === 'checking' && stableFace.current) {
        const ch = CHALLENGES[challengeIdx.current].id
        let pass = ch === 'center' ? Math.abs(cx - 0.5) < 0.15 && Math.abs(cy - 0.5) < 0.15 && size > 0.15 && size < 0.4
          : ch === 'closer' ? size > 0.28 : Math.abs(cx - 0.5) > 0.1
        
        if (pass) {
          holdFrames.current++
          setChallengeProgress(Math.min(100, (holdFrames.current / 8) * 100))
          if (holdFrames.current >= 8) {
            completed.current.push(ch); challengeIdx.current++; holdFrames.current = 0; setChallengeProgress(0)
            setProgress((challengeIdx.current / CHALLENGES.length) * 100)
            if (challengeIdx.current >= CHALLENGES.length) {
              if (canvasRef.current) { const ctx = canvasRef.current.getContext('2d'); if (ctx) { canvasRef.current.width = video.videoWidth; canvasRef.current.height = video.videoHeight; ctx.drawImage(video, 0, 0); selfie.current = canvasRef.current.toDataURL('image/jpeg', 0.8) } }
              submitResult(0.85); return
            }
          }
        } else { holdFrames.current = Math.max(0, holdFrames.current - 1); setChallengeProgress(Math.max(0, (holdFrames.current / 8) * 100)) }
      }
    } catch (e) { console.error(e) }
    animRef.current = requestAnimationFrame(processFrame)
  }, [step, submitResult])

  const startCheck = useCallback(() => {
    if (!stableFace.current) return
    challengeIdx.current = 0; holdFrames.current = 0; completed.current = []; setChallengeProgress(0)
    setStep('checking'); setProgress(0); setError('')
  }, [])

  const retry = useCallback(() => {
    challengeIdx.current = 0; holdFrames.current = 0; completed.current = []; setChallengeProgress(0)
    setStep('ready'); setError(''); setProgress(0); animRef.current = requestAnimationFrame(processFrame)
  }, [processFrame])

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        setLoadingMsg('Loading AI model...'); setLoadingProgress(20)
        await tf.ready(); if (!mounted) return
        setLoadingProgress(50); modelRef.current = await blazeface.load(); if (!mounted) return
        setLoadingMsg('Starting camera...'); setLoadingProgress(80)
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        setLoadingProgress(100); setLoading(false); setStep('ready'); animRef.current = requestAnimationFrame(processFrame)
      } catch (e) { setError('Failed to initialize: ' + (e as Error).message); setLoading(false) }
    }
    init()
    return () => { mounted = false; if (animRef.current) cancelAnimationFrame(animRef.current); streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [processFrame])

  const getFeedback = () => {
    if (step === 'checking') return { text: CHALLENGES[challengeIdx.current]?.instruction || '', hint: CHALLENGES[challengeIdx.current]?.hint || '' }
    switch (facePosition) {
      case 'none': return { text: 'Position your face in the oval', hint: 'Make sure your face is visible' }
      case 'far': return { text: 'Move closer to the camera', hint: 'Your face appears too small' }
      case 'close': return { text: 'Move back a little', hint: 'Your face is too close' }
      case 'left': return { text: 'Move right', hint: 'Center your face' }
      case 'right': return { text: 'Move left', hint: 'Center your face' }
      case 'up': return { text: 'Move down', hint: 'Center your face' }
      case 'down': return { text: 'Move up', hint: 'Center your face' }
      case 'good': return { text: 'Perfect! Ready to start', hint: 'Tap the button below' }
      default: return { text: 'Position your face', hint: '' }
    }
  }
  const feedback = getFeedback()

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white mb-1">Liveness Check</h2>
        <p className="text-gray-400 text-sm">Follow the instructions to verify you're a real person</p>
      </div>
      <div className="relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-[65%] h-[55%] rounded-[50%] border-4 transition-colors duration-300 ${step === 'checking' ? 'border-blue-400 animate-pulse' : faceDetected && facePosition === 'good' ? 'border-emerald-400' : faceDetected ? 'border-yellow-400' : 'border-gray-500'}`} />
        </div>
        <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${faceDetected ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          <span className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-white' : 'bg-white animate-pulse'}`}></span>
          {faceDetected ? 'Face Detected' : 'No Face'}
        </div>
        {step === 'checking' && <div className="absolute top-3 right-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full"><span className="text-white text-xs font-bold">{challengeIdx.current + 1} / {CHALLENGES.length}</span></div>}
        {loading && <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center"><div className="w-16 h-16 mb-4 relative"><div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div><div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div></div><p className="text-white font-medium mb-2">{loadingMsg}</p><div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div></div></div>}
        {step === 'submitting' && <div className="absolute inset-0 bg-blue-900/90 flex flex-col items-center justify-center"><div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div><p className="text-white font-medium">Verifying...</p></div>}
        {step === 'complete' && <div className="absolute inset-0 bg-emerald-500/90 flex flex-col items-center justify-center"><div className="text-6xl mb-2">✓</div><p className="text-white font-bold text-xl">Verified!</p></div>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {step === 'checking' && <div className="mb-4"><div className="flex gap-1 mb-2">{CHALLENGES.map((_, i) => <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i < challengeIdx.current ? 'bg-emerald-500' : i === challengeIdx.current ? 'bg-blue-500' : 'bg-gray-700'}`} />)}</div><div className="h-1 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-400 transition-all duration-100" style={{ width: `${challengeProgress}%` }} /></div></div>}
      <div className={`rounded-xl p-4 mb-4 text-center ${step === 'checking' ? 'bg-blue-500/20 border border-blue-500/30' : facePosition === 'good' && faceDetected ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-gray-800 border border-gray-700'}`}>
        {step === 'checking' && <div className="text-3xl mb-2">{CHALLENGES[challengeIdx.current]?.icon}</div>}
        <p className={`font-semibold text-lg mb-1 ${step === 'checking' ? 'text-blue-300' : 'text-white'}`}>{feedback.text}</p>
        {feedback.hint && <p className="text-gray-400 text-sm">{feedback.hint}</p>}
      </div>
      {error && <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-4 text-center"><p className="text-red-400">{error}</p></div>}
      <div className="flex justify-center">
        {step === 'ready' && <button onClick={startCheck} disabled={!faceDetected || facePosition !== 'good'} className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${faceDetected && facePosition === 'good' ? 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>{faceDetected && facePosition === 'good' ? 'Start Verification' : 'Position Your Face'}</button>}
        {step === 'failed' && <button onClick={retry} className="w-full py-4 rounded-xl font-bold text-lg bg-red-500 text-white hover:bg-red-600 transition">Try Again</button>}
      </div>
      {step === 'ready' && <p className="text-center text-gray-500 text-xs mt-4">Make sure you're in a well-lit area with a plain background</p>}
    </div>
  )
}
