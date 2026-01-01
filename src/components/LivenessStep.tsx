import { useState, useRef, useEffect, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

interface Props {
  verificationId: string
  onNext: () => void
}

// Eye aspect ratio for blink detection
function getEyeAspectRatio(landmarks: number[][], eyeIndices: number[]): number {
  const eye = eyeIndices.map(i => landmarks[i])
  const vertical1 = Math.sqrt(Math.pow(eye[1][0] - eye[5][0], 2) + Math.pow(eye[1][1] - eye[5][1], 2))
  const vertical2 = Math.sqrt(Math.pow(eye[2][0] - eye[4][0], 2) + Math.pow(eye[2][1] - eye[4][1], 2))
  const horizontal = Math.sqrt(Math.pow(eye[0][0] - eye[3][0], 2) + Math.pow(eye[0][1] - eye[3][1], 2))
  return (vertical1 + vertical2) / (2.0 * horizontal)
}

// Mouth aspect ratio for smile detection
function getMouthAspectRatio(landmarks: number[][]): number {
  const upperLip = landmarks[13]
  const lowerLip = landmarks[14]
  const leftCorner = landmarks[61]
  const rightCorner = landmarks[291]
  
  const vertical = Math.sqrt(Math.pow(upperLip[0] - lowerLip[0], 2) + Math.pow(upperLip[1] - lowerLip[1], 2))
  const horizontal = Math.sqrt(Math.pow(leftCorner[0] - rightCorner[0], 2) + Math.pow(leftCorner[1] - rightCorner[1], 2))
  
  return horizontal / (vertical + 0.001)
}

// Head turn detection using nose position
function getHeadTurn(landmarks: number[][], faceWidth: number): number {
  const noseTip = landmarks[1]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  
  const faceCenter = (leftCheek[0] + rightCheek[0]) / 2
  const noseOffset = (noseTip[0] - faceCenter) / faceWidth
  
  return noseOffset
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const detectorRef = useRef<faceLandmarksDetection.FaceLandmarksDetector | null>(null)
  const animationRef = useRef<number | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'init' | 'loading' | 'ready' | 'detecting' | 'blink' | 'smile' | 'turn' | 'success' | 'failed'>('init')
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [progress, setProgress] = useState(0)
  
  // Detection state
  const blinkDetectedRef = useRef(false)
  const smileDetectedRef = useRef(false)
  const turnDetectedRef = useRef(false)
  const baselineEARRef = useRef<number | null>(null)
  const baselineMARRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const selfieRef = useRef<string | null>(null)

  // Left eye indices for MediaPipe face mesh
  const LEFT_EYE = [33, 160, 158, 133, 153, 144]
  const RIGHT_EYE = [362, 385, 387, 263, 373, 380]

  const initModel = async () => {
    setModelLoading(true)
    try {
      await tf.ready()
      await tf.setBackend('webgl')
      
      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh
      detectorRef.current = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: true,
        maxFaces: 1
      })
      
      setModelLoading(false)
      return true
    } catch (err) {
      console.error('Model load error:', err)
      setModelLoading(false)
      setError('Failed to load face detection model')
      return false
    }
  }

  const initCamera = async () => {
    setLoading(true)
    setError('')
    setStep('loading')
    
    try {
      // Load model first
      const modelReady = await initModel()
      if (!modelReady) {
        setLoading(false)
        setStep('init')
        return
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
        setStep('ready')
        setInstruction('Position your face in the oval')
      }
      setLoading(false)
    } catch (err: unknown) {
      setLoading(false)
      setStep('init')
      const error = err as Error
      if (error.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera in browser settings.')
      } else {
        setError('Failed to access camera: ' + error.message)
      }
    }
  }

  const detectFace = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || !canvasRef.current) return null
    
    try {
      const faces = await detectorRef.current.estimateFaces(videoRef.current)
      
      if (faces.length === 0) {
        setFaceDetected(false)
        return null
      }
      
      setFaceDetected(true)
      const face = faces[0]
      const landmarks = face.keypoints.map(k => [k.x, k.y])
      
      // Draw face mesh on canvas
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        ctx.fillStyle = '#00ff00'
        landmarks.forEach(point => {
          ctx.beginPath()
          ctx.arc(point[0], point[1], 1, 0, 2 * Math.PI)
          ctx.fill()
        })
      }
      
      return landmarks
    } catch (err) {
      console.error('Detection error:', err)
      return null
    }
  }, [])

  const captureSelfie = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0)
        selfieRef.current = canvas.toDataURL('image/jpeg', 0.8)
      }
    }
  }

  const startLivenessCheck = async () => {
    setStep('detecting')
    setInstruction('Detecting face...')
    setProgress(0)
    blinkDetectedRef.current = false
    smileDetectedRef.current = false
    turnDetectedRef.current = false
    baselineEARRef.current = null
    baselineMARRef.current = null
    frameCountRef.current = 0
    
    // Capture initial selfie
    captureSelfie()
    
    // Start with blink detection
    setTimeout(() => {
      setStep('blink')
      setInstruction('Blink your eyes slowly')
      setProgress(10)
    }, 1000)
  }

  // Main detection loop
  useEffect(() => {
    if (!cameraReady || step === 'init' || step === 'loading' || step === 'success' || step === 'failed') {
      return
    }

    let isActive = true
    
    const runDetection = async () => {
      if (!isActive) return
      
      const landmarks = await detectFace()
      
      if (landmarks && landmarks.length >= 468) {
        frameCountRef.current++
        
        // Calculate metrics
        const leftEAR = getEyeAspectRatio(landmarks, LEFT_EYE)
        const rightEAR = getEyeAspectRatio(landmarks, RIGHT_EYE)
        const avgEAR = (leftEAR + rightEAR) / 2
        
        const mar = getMouthAspectRatio(landmarks)
        
        const box = {
          minX: Math.min(...landmarks.map(l => l[0])),
          maxX: Math.max(...landmarks.map(l => l[0]))
        }
        const faceWidth = box.maxX - box.minX
        const headTurn = getHeadTurn(landmarks, faceWidth)
        
        // Set baselines in first few frames
        if (frameCountRef.current < 10) {
          if (!baselineEARRef.current) baselineEARRef.current = avgEAR
          else baselineEARRef.current = (baselineEARRef.current + avgEAR) / 2
          
          if (!baselineMARRef.current) baselineMARRef.current = mar
          else baselineMARRef.current = (baselineMARRef.current + mar) / 2
        }
        
        // BLINK DETECTION
        if (step === 'blink' && baselineEARRef.current) {
          const blinkThreshold = baselineEARRef.current * 0.7
          if (avgEAR < blinkThreshold) {
            blinkDetectedRef.current = true
            setProgress(40)
            setStep('smile')
            setInstruction('Great! Now smile wide')
          }
        }
        
        // SMILE DETECTION
        if (step === 'smile' && baselineMARRef.current) {
          const smileThreshold = baselineMARRef.current * 1.3
          if (mar > smileThreshold) {
            smileDetectedRef.current = true
            setProgress(70)
            setStep('turn')
            setInstruction('Perfect! Turn your head slightly')
          }
        }
        
        // HEAD TURN DETECTION
        if (step === 'turn') {
          if (Math.abs(headTurn) > 0.15) {
            turnDetectedRef.current = true
            setProgress(100)
            completeLiveness()
          }
        }
      }
      
      if (isActive) {
        animationRef.current = requestAnimationFrame(runDetection)
      }
    }
    
    runDetection()
    
    return () => {
      isActive = false
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [step, cameraReady, detectFace])

  // Timeout for each challenge
  useEffect(() => {
    if (step === 'blink' || step === 'smile' || step === 'turn') {
      const timeout = setTimeout(() => {
        if (step === 'blink' && !blinkDetectedRef.current) {
          setError('Blink not detected. Try again.')
          setStep('ready')
          setProgress(0)
        } else if (step === 'smile' && !smileDetectedRef.current) {
          setError('Smile not detected. Try again.')
          setStep('ready')
          setProgress(0)
        } else if (step === 'turn' && !turnDetectedRef.current) {
          setError('Head turn not detected. Try again.')
          setStep('ready')
          setProgress(0)
        }
      }, 10000) // 10 second timeout per challenge
      
      return () => clearTimeout(timeout)
    }
  }, [step])

  const completeLiveness = async () => {
    setStep('success')
    setInstruction('Liveness verified!')
    
    // Stop camera
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(track => track.stop())
    }
    
    // Calculate real liveness score
    const score = (blinkDetectedRef.current ? 0.33 : 0) + 
                  (smileDetectedRef.current ? 0.33 : 0) + 
                  (turnDetectedRef.current ? 0.34 : 0)

    try {
      const res = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId,
          livenessScore: score,
          selfieBase64: selfieRef.current,
          checksCompleted: {
            blink: blinkDetectedRef.current,
            smile: smileDetectedRef.current,
            turn: turnDetectedRef.current
          }
        })
      })

      const data = await res.json()

      if (data.success && data.passed) {
        setTimeout(() => onNext(), 1500)
      } else {
        setError(data.message || 'Liveness check failed')
        setStep('failed')
      }
    } catch {
      setError('Network error. Please try again.')
      setStep('failed')
    }
  }

  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const getChallengeIcon = () => {
    switch (step) {
      case 'blink': return '👁️'
      case 'smile': return '😊'
      case 'turn': return '↔️'
      case 'success': return '✓'
      default: return '📷'
    }
  }

  const isChallenge = step === 'blink' || step === 'smile' || step === 'turn'

  return (
    <div className="bg-gray-900 rounded-3xl border border-gray-800 p-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white">Liveness Check</h2>
        <p className="text-gray-400 mt-1">{instruction || 'Prove you are a real person'}</p>
      </div>

      {/* Progress bar */}
      {(isChallenge || step === 'detecting' || step === 'success') && (
        <div className="mb-4">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-500 mt-1">{progress}% complete</p>
        </div>
      )}

      <div className="relative aspect-[4/3] bg-gray-800 rounded-2xl overflow-hidden mb-4 border border-gray-700">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {step === 'init' && !loading && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-pink-500/20 to-pink-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-pink-500/30">
                <span className="text-4xl">📷</span>
              </div>
              <p className="text-gray-400">AI-powered liveness detection</p>
            </div>
          </div>
        )}

        {(loading || modelLoading || step === 'loading') && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-12 h-12 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400">{modelLoading ? 'Loading AI model...' : 'Starting camera...'}</p>
            </div>
          </div>
        )}

        {step === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-48 h-64 border-4 border-dashed rounded-full transition-colors ${faceDetected ? 'border-emerald-500' : 'border-white/30'}`}></div>
          </div>
        )}

        {isChallenge && (
          <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className="bg-black/70 backdrop-blur-sm px-6 py-3 rounded-full">
              <span className="text-3xl mr-2">{getChallengeIcon()}</span>
              <span className="text-white font-bold">{instruction}</span>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="absolute inset-0 bg-emerald-600/90 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-7xl mb-4">✓</div>
              <p className="text-2xl font-bold">Liveness Verified!</p>
              <p className="text-emerald-200 mt-2">All challenges passed</p>
            </div>
          </div>
        )}

        {step === 'failed' && (
          <div className="absolute inset-0 bg-red-600/90 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-7xl mb-4">✗</div>
              <p className="text-2xl font-bold">Verification Failed</p>
            </div>
          </div>
        )}

        {/* Face detection indicator */}
        {(step === 'ready' || isChallenge) && (
          <div className="absolute bottom-4 left-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${faceDetected ? 'bg-emerald-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
              <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-white' : 'bg-white animate-pulse'}`}></div>
              {faceDetected ? 'Face detected' : 'No face detected'}
            </div>
          </div>
        )}
      </div>

      {/* Challenge progress indicators */}
      {(isChallenge || step === 'success') && (
        <div className="flex gap-2 mb-4">
          <div className={`h-2 flex-1 rounded-full ${blinkDetectedRef.current || step === 'smile' || step === 'turn' || step === 'success' ? 'bg-emerald-500' : step === 'blink' ? 'bg-pink-500 animate-pulse' : 'bg-gray-700'}`} />
          <div className={`h-2 flex-1 rounded-full ${smileDetectedRef.current || step === 'turn' || step === 'success' ? 'bg-emerald-500' : step === 'smile' ? 'bg-pink-500 animate-pulse' : 'bg-gray-700'}`} />
          <div className={`h-2 flex-1 rounded-full ${turnDetectedRef.current || step === 'success' ? 'bg-emerald-500' : step === 'turn' ? 'bg-pink-500 animate-pulse' : 'bg-gray-700'}`} />
        </div>
      )}

      {error && step !== 'success' && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {step === 'init' && !loading && (
        <button
          onClick={initCamera}
          className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-semibold text-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/20"
        >
          Start Camera →
        </button>
      )}

      {step === 'ready' && cameraReady && (
        <button
          onClick={startLivenessCheck}
          disabled={!faceDetected}
          className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-semibold text-lg hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-pink-500/20"
        >
          {faceDetected ? 'Start Liveness Check →' : 'Position your face first'}
        </button>
      )}

      {(step === 'failed' || error) && step !== 'success' && (
        <button
          onClick={() => {
            setError('')
            setStep('ready')
            setProgress(0)
          }}
          className="w-full py-4 bg-gray-700 text-white rounded-xl font-semibold text-lg hover:bg-gray-600 transition-all"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
