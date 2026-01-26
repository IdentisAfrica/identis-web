import { useState, useRef, useEffect, useCallback } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props {
  verificationId: string
  onNext: () => void
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'challenge' | 'done' | 'error'>('loading')
  const [loadingText, setLoadingText] = useState('Loading...')
  const [faceOk, setFaceOk] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [debug, setDebug] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef(0)
  const holdCount = useRef(0)
  const stableCount = useRef(0)
  const lastTimestamp = useRef(0)

  // Challenges: blink, turn left, turn right
  const challenges = [
    { id: 'blink', text: 'Blink your eyes', check: (b: any) => b?.eyeBlinkLeft > 0.4 && b?.eyeBlinkRight > 0.4 },
    { id: 'left', text: 'Turn head LEFT', check: (_b: any, yaw: number) => yaw > 15 },
    { id: 'right', text: 'Turn head RIGHT', check: (_b: any, yaw: number) => yaw < -15 },
  ]

  const submit = useCallback(async (selfie: string) => {
    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, livenessScore: 0.9, selfieBase64: selfie })
      })
      if (!res.ok) throw new Error('Failed')
      setPhase('done')
      setTimeout(onNext, 1500)
    } catch {
      setError('Verification failed')
      setPhase('error')
    }
  }, [verificationId, onNext])

  const capture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return ''
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85)
  }, [])

  const nextStep = useCallback(() => {
    holdCount.current = 0
    setProgress(0)
    if (step >= challenges.length - 1) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animRef.current)
      submit(capture())
    } else {
      setStep(s => s + 1)
    }
  }, [step, challenges.length, capture, submit])

  const detect = useCallback(async () => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (!video || !landmarker || video.readyState < 2 || phase === 'done') {
      animRef.current = requestAnimationFrame(detect)
      return
    }

    const now = performance.now()
    if (now - lastTimestamp.current < 50) { // Limit to ~20fps
      animRef.current = requestAnimationFrame(detect)
      return
    }
    lastTimestamp.current = now

    try {
      const result = landmarker.detectForVideo(video, now)
      
      if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
        setFaceOk(false)
        stableCount.current = 0
        setDebug('No face')
        animRef.current = requestAnimationFrame(detect)
        return
      }

      // Get blendshapes (includes eyeBlinkLeft, eyeBlinkRight, etc)
      const blendshapes = result.faceBlendshapes?.[0]?.categories
      const blendMap: Record<string, number> = {}
      blendshapes?.forEach((b: any) => { blendMap[b.categoryName] = b.score })

      // Get face transformation matrix for head pose
      const matrix = result.facialTransformationMatrixes?.[0]?.data
      let yaw = 0
      if (matrix) {
        // Extract yaw from rotation matrix (simplified)
        yaw = Math.atan2(matrix[8], matrix[0]) * (180 / Math.PI)
      }

      // Check face bounds (is face in frame)
      const landmarks = result.faceLandmarks[0]
      const xs = landmarks.map((l: any) => l.x)
      const ys = landmarks.map((l: any) => l.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const faceW = maxX - minX
      const faceH = maxY - minY
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2

      const goodSize = faceW > 0.2 && faceW < 0.7
      const centered = centerX > 0.3 && centerX < 0.7 && centerY > 0.2 && centerY < 0.8

      const blink = blendMap.eyeBlinkLeft ?? 0
      setDebug(`Blink:${blink.toFixed(2)} Yaw:${yaw.toFixed(0)}° Size:${(faceW*100).toFixed(0)}%`)

      if (goodSize && centered) {
        stableCount.current++
        if (stableCount.current > 5) setFaceOk(true)
      } else {
        stableCount.current = 0
        setFaceOk(false)
      }

      // READY PHASE
      if (phase === 'ready') {
        if (!goodSize) {
          setInstruction(faceW < 0.2 ? 'Move closer' : 'Move back')
        } else if (!centered) {
          setInstruction('Center your face')
        } else if (faceOk) {
          setInstruction('Perfect! Tap Start')
        } else {
          setInstruction('Hold still...')
        }
      }

      // CHALLENGE PHASE
      if (phase === 'challenge') {
        const current = challenges[step]
        const passed = current.check(blendMap, yaw)
        
        setInstruction(passed ? 'Hold it...' : current.text)
        
        if (passed) {
          holdCount.current++
          const required = current.id === 'blink' ? 3 : 10
          setProgress((holdCount.current / required) * 100)
          if (holdCount.current >= required) {
            nextStep()
          }
        } else {
          holdCount.current = Math.max(0, holdCount.current - 0.5)
          setProgress((holdCount.current / 10) * 100)
        }
      }

    } catch (e) {
      console.error('Detection error:', e)
    }

    animRef.current = requestAnimationFrame(detect)
  }, [phase, step, challenges, nextStep])

  const start = useCallback(() => {
    if (!faceOk) return
    setStep(0)
    setProgress(0)
    holdCount.current = 0
    setPhase('challenge')
    setInstruction(challenges[0].text)
  }, [faceOk, challenges])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        setLoadingText('Loading AI...')
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        )
        if (!mounted) return

        setLoadingText('Loading face model...')
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        })
        if (!mounted) return
        landmarkerRef.current = landmarker

        setLoadingText('Starting camera...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setPhase('ready')
        setInstruction('Position your face')
        animRef.current = requestAnimationFrame(detect)
      } catch (e) {
        console.error('Init error:', e)
        setError((e as Error).message)
        setPhase('error')
      }
    }

    init()
    return () => {
      mounted = false
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      landmarkerRef.current?.close()
    }
  }, [detect])

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold text-white text-center mb-1">Liveness Check</h2>
      <p className="text-gray-400 text-sm text-center mb-4">Follow the instructions</p>

      <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-52 h-72 rounded-[50%] border-4 transition-colors ${
            phase === 'challenge' ? 'border-blue-400' : faceOk ? 'border-green-400' : 'border-gray-500'
          }`} />
        </div>

        <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
          faceOk ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {faceOk ? '✓ Face OK' : '✗ No Face'}
        </div>

        {phase === 'challenge' && (
          <div className="absolute top-3 right-3 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold">
            {step + 1}/{challenges.length}
          </div>
        )}

        {phase === 'loading' && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-white">{loadingText}</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="absolute inset-0 bg-green-600 flex flex-col items-center justify-center">
            <span className="text-6xl mb-2">✓</span>
            <p className="text-white font-bold text-xl">Verified!</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {phase === 'challenge' && (
        <div className="mb-4">
          <div className="flex gap-1 mb-2">
            {challenges.map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded ${
                i < step ? 'bg-green-500' : i === step ? 'bg-blue-500' : 'bg-gray-700'
              }`} />
            ))}
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className={`rounded-xl p-4 mb-4 text-center ${
        phase === 'challenge' ? 'bg-blue-500/20 border border-blue-500/40' :
        faceOk ? 'bg-green-500/20 border border-green-500/40' : 'bg-gray-800 border border-gray-700'
      }`}>
        <p className="text-white font-semibold text-lg">{instruction}</p>
      </div>

      <p className="text-gray-600 text-xs text-center font-mono mb-3">{debug}</p>

      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-xl p-3 mb-4">
          <p className="text-red-400 text-center">{error}</p>
        </div>
      )}

      {phase === 'ready' && (
        <button
          onClick={start}
          disabled={!faceOk}
          className={`w-full py-4 rounded-xl font-bold text-lg ${
            faceOk ? 'bg-gradient-to-r from-blue-500 to-green-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {faceOk ? 'Start Verification' : 'Position Your Face'}
        </button>
      )}

      {phase === 'error' && (
        <button onClick={() => window.location.reload()} className="w-full py-4 rounded-xl font-bold bg-red-500 text-white">
          Try Again
        </button>
      )}
    </div>
  )
}
