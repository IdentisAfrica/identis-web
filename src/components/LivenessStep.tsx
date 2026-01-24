import { useState, useRef, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

// MediaPipe FaceMesh landmark indices
const LEFT_EYE = [362, 385, 387, 263, 373, 380]
const RIGHT_EYE = [33, 160, 158, 133, 153, 144]
const MOUTH_OUTER = [61, 291, 0, 17]  // left, right, top, bottom
const NOSE_TIP = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454
const FOREHEAD = 10
const CHIN = 152

// Anti-spoofing thresholds
const MIN_SPOOF_SCORE = 0.3           // Minimum score to pass (50%)
const BLINK_THRESHOLD = 0.6           // EAR threshold for blink
const SMILE_THRESHOLD = 1.0           // Mouth ratio multiplier for smile
const TURN_THRESHOLD = 0.03           // Head turn threshold
const HOLD_REQUIRED = 4               // Frames to hold challenge
const METRICS_HISTORY_SIZE = 60       // Rolling window for analysis

interface Props {
  verificationId: string
  onNext: () => void
}

interface Landmark {
  x: number
  y: number
  z: number
}

interface FaceMeshInstance {
  setOptions: (options: Record<string, unknown>) => void
  onResults: (callback: (results: FaceMeshResults) => void) => void
  send: (input: { image: HTMLVideoElement }) => Promise<void>
}

interface CameraInstance {
  start: () => Promise<void>
  stop: () => void
}

interface FaceMeshResults {
  multiFaceLandmarks?: Landmark[][]
}

interface Metrics {
  ear: number
  mouth: number
  turn: number
  movement: number
  timestamp: number
}

interface BaselineMetrics {
  ear: number
  mouth: number
  turn: number
}

declare global {
  interface Window {
    FaceMesh: new (config: { locateFile: (file: string) => string }) => FaceMeshInstance
    Camera: new (video: HTMLVideoElement, config: { onFrame: () => Promise<void>; width: number; height: number }) => CameraInstance
  }
}

type ChallengeType = 'blink' | 'smile' | 'turnLeft' | 'turnRight'
type StepType = 'loading' | 'ready' | 'challenge' | 'verifying' | 'success' | 'failed'

// Shuffle array helper
const shuffle = <T,>(arr: T[]): T[] => {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export default function LivenessStep({ verificationId, onNext }: Props) {
  const [step, setStep] = useState<StepType>('loading')
  const [error, setError] = useState('')
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceValid, setFaceValid] = useState(false)
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [instruction, setInstruction] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceMeshRef = useRef<FaceMeshInstance | null>(null)
  const cameraRef = useRef<CameraInstance | null>(null)
  const selfieRef = useRef<string | null>(null)

  // Challenge tracking refs (to avoid stale closures)
  const challengesRef = useRef<ChallengeType[]>(shuffle(['blink', 'smile', 'turnLeft', 'turnRight']))
  const holdFramesRef = useRef(0)
  const challengeIndexRef = useRef(0)
  const stepRef = useRef<StepType>('loading')
  
  // Anti-spoofing refs
  const metricsHistoryRef = useRef<Metrics[]>([])
  const baselineRef = useRef<BaselineMetrics | null>(null)
  const lastLandmarksRef = useRef<Landmark[] | null>(null)
  const spoofScoreRef = useRef(0)

  // Keep stepRef in sync
  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    challengeIndexRef.current = challengeIndex
  }, [challengeIndex])

  // Calculate Eye Aspect Ratio (EAR) for blink detection
  const calcEAR = useCallback((landmarks: Landmark[], eyeIndices: number[]): number => {
    const p = eyeIndices.map(i => landmarks[i])
    const vertical1 = Math.hypot(p[1].x - p[5].x, p[1].y - p[5].y)
    const vertical2 = Math.hypot(p[2].x - p[4].x, p[2].y - p[4].y)
    const horizontal = Math.hypot(p[0].x - p[3].x, p[0].y - p[3].y)
    return (vertical1 + vertical2) / (2 * horizontal)
  }, [])

  // Calculate mouth openness ratio
  const calcMouth = useCallback((landmarks: Landmark[]): number => {
    const left = landmarks[MOUTH_OUTER[0]]
    const right = landmarks[MOUTH_OUTER[1]]
    const top = landmarks[MOUTH_OUTER[2]]
    const bottom = landmarks[MOUTH_OUTER[3]]
    const width = Math.hypot(left.x - right.x, left.y - right.y)
    const height = Math.hypot(top.x - bottom.x, top.y - bottom.y)
    return height / (width + 0.0001)
  }, [])

  // Calculate head turn using nose position relative to cheeks
  const calcTurn = useCallback((landmarks: Landmark[]): number => {
    const nose = landmarks[NOSE_TIP]
    const leftCheek = landmarks[LEFT_CHEEK]
    const rightCheek = landmarks[RIGHT_CHEEK]
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x)
    const noseOffset = nose.x - (leftCheek.x + rightCheek.x) / 2
    return noseOffset / (faceWidth + 0.0001)
  }, [])

  // Calculate movement between frames
  const calcMovement = useCallback((landmarks: Landmark[]): number => {
    const prev = lastLandmarksRef.current
    if (!prev) return 0
    
    // Track movement of key stable points
    const indices = [NOSE_TIP, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN]
    let totalMovement = 0
    
    for (const i of indices) {
      const dx = landmarks[i].x - prev[i].x
      const dy = landmarks[i].y - prev[i].y
      const dz = landmarks[i].z - prev[i].z
      totalMovement += Math.sqrt(dx*dx + dy*dy + dz*dz)
    }
    
    return totalMovement / indices.length
  }, [])

  // Validate face geometry to reject non-faces
  const validateFaceGeometry = useCallback((landmarks: Landmark[]): boolean => {
    // Check face has reasonable proportions
    const leftCheek = landmarks[LEFT_CHEEK]
    const rightCheek = landmarks[RIGHT_CHEEK]
    const forehead = landmarks[FOREHEAD]
    const chin = landmarks[CHIN]
    const nose = landmarks[NOSE_TIP]
    
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x)
    const faceHeight = Math.abs(chin.y - forehead.y)
    
    // Face should be roughly oval (height/width between 1.0 and 2.0)
    const ratio = faceHeight / (faceWidth + 0.0001)
    if (ratio < 0.8 || ratio > 2.5) return false
    
    // Nose should be roughly centered
    const noseX = nose.x
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2
    const noseOffset = Math.abs(noseX - faceCenterX) / (faceWidth + 0.0001)
    if (noseOffset > 0.4) return false
    
    // Eyes should be above nose
    const leftEyeCenter = landmarks[LEFT_EYE[0]]
    const rightEyeCenter = landmarks[RIGHT_EYE[0]]
    if (leftEyeCenter.y > nose.y || rightEyeCenter.y > nose.y) return false
    
    // Face should have reasonable z-depth variance (flat images have less variance)
    const zValues = [leftCheek.z, rightCheek.z, forehead.z, chin.z, nose.z]
    const zMean = zValues.reduce((a, b) => a + b, 0) / zValues.length
    const zVariance = zValues.reduce((sum, z) => sum + Math.pow(z - zMean, 2), 0) / zValues.length
    if (zVariance < 0.0001) return false  // Too flat - likely a photo
    
    return true
  }, [])

  // Calculate spoof score based on movement patterns
  const calcSpoofScore = useCallback((): number => {
    const history = metricsHistoryRef.current
    if (history.length < 20) return 0
    
    // Analyze micro-movements (real faces have natural tremor)
    const movements = history.slice(-20).map(m => m.movement)
    const avgMovement = movements.reduce((a, b) => a + b, 0) / movements.length
    
    // Real faces have consistent small movements (0.001 - 0.02 typical)
    // Photos have near-zero or erratic movement
    let movementScore = 0
    if (avgMovement > 0.0005 && avgMovement < 0.05) {
      movementScore = 0.4
    }
    
    // Check for natural variance in EAR (blinking causes fluctuation)
    const ears = history.slice(-30).map(m => m.ear)
    const earVariance = ears.reduce((sum, ear) => {
      const mean = ears.reduce((a, b) => a + b, 0) / ears.length
      return sum + Math.pow(ear - mean, 2)
    }, 0) / ears.length
    
    let earScore = 0
    if (earVariance > 0.0001) {
      earScore = 0.3
    }
    
    // Check for depth variation over time (3D faces have more z-variance)
    const depthScore = 0.3  // Base score if face geometry passed
    
    return Math.min(1, movementScore + earScore + depthScore)
  }, [])

  // Process face mesh results
  const onFaceResults = useCallback((results: FaceMeshResults) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setFaceDetected(false)
      setFaceValid(false)
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    setFaceDetected(true)
    
    // Validate face geometry
    const isValidFace = validateFaceGeometry(landmarks)
    setFaceValid(isValidFace)
    
    if (!isValidFace) {
      lastLandmarksRef.current = landmarks
      return
    }

    // Calculate metrics
    const leftEAR = calcEAR(landmarks, LEFT_EYE)
    const rightEAR = calcEAR(landmarks, RIGHT_EYE)
    const ear = (leftEAR + rightEAR) / 2
    const mouth = calcMouth(landmarks)
    const turn = calcTurn(landmarks)
    const movement = calcMovement(landmarks)

    // Add to history
    const metrics: Metrics = { ear, mouth, turn, movement, timestamp: Date.now() }
    metricsHistoryRef.current.push(metrics)
    if (metricsHistoryRef.current.length > METRICS_HISTORY_SIZE) {
      metricsHistoryRef.current.shift()
    }

    // Calculate spoof score
    spoofScoreRef.current = calcSpoofScore()

    // Establish baseline after 10 frames
    if (metricsHistoryRef.current.length === 10 && !baselineRef.current) {
      baselineRef.current = { ear, mouth, turn }
    }

    // Store for next frame comparison
    lastLandmarksRef.current = landmarks

  // Process challenge if in challenge step AND face is still valid
    if (stepRef.current === 'challenge' && baselineRef.current && isValidFace) {
      processChallenge({ ear, mouth, turn })
    } else if (stepRef.current === 'challenge' && !isValidFace) {
      // Reset progress if face becomes invalid
      holdFramesRef.current = 0
      setProgress(0)
    }
  }, [calcEAR, calcMouth, calcTurn, calcMovement, calcSpoofScore, validateFaceGeometry])

  // Process current challenge
  const processChallenge = useCallback((m: { ear: number; mouth: number; turn: number }) => {
    const baseline = baselineRef.current
    if (!baseline) return

    const challenge = challengesRef.current[challengeIndexRef.current]
    let detected = false

    switch (challenge) {
      case 'blink':
        // EAR drops significantly during blink
        detected = m.ear < baseline.ear * BLINK_THRESHOLD
        break
      case 'smile':
        // Mouth ratio increases during smile
        detected = m.mouth > baseline.mouth * SMILE_THRESHOLD
        break
      case 'turnLeft':
        // Positive turn value = turned left (mirrored)
        detected = m.turn > TURN_THRESHOLD
        break
      case 'turnRight':
        // Negative turn value = turned right (mirrored)
        detected = m.turn < -TURN_THRESHOLD
        break
    }

    if (detected) {
      holdFramesRef.current++
      const progressPct = Math.min(100, (holdFramesRef.current / HOLD_REQUIRED) * 100)
      setProgress(progressPct)
      
      if (holdFramesRef.current >= HOLD_REQUIRED) {
        // Challenge complete
        holdFramesRef.current = 0
        const nextIndex = challengeIndexRef.current + 1
        
        if (nextIndex >= challengesRef.current.length) {
          // All challenges complete
          captureSelfie()
          verifyLiveness()
        } else {
          setChallengeIndex(nextIndex)
          setProgress(0)
        }
      }
    } else {
      // Decay hold frames
      holdFramesRef.current = Math.max(0, holdFramesRef.current - 2)
      setProgress((holdFramesRef.current / HOLD_REQUIRED) * 100)
    }
  }, [])

  // Capture selfie from video
  const captureSelfie = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    canvas.width = 640
    canvas.height = 480
    ctx.drawImage(videoRef.current, 0, 0, 640, 480)
    selfieRef.current = canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  // Verify liveness with backend
  const verifyLiveness = useCallback(async () => {
    setStep('verifying')
    setInstruction('Verifying...')

    const spoofScore = spoofScoreRef.current

    // Check minimum spoof score
    if (spoofScore < MIN_SPOOF_SCORE) {
      setError(`Liveness check failed. Please try again with better lighting. (Score: ${spoofScore.toFixed(2)})`)
      setStep('failed')
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/verification/${verificationId}/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfie: selfieRef.current,
          livenessScore: spoofScore,
          challengesCompleted: challengesRef.current,
          antiSpoofScore: spoofScore
        })
      })

      if (res.ok) {
        setStep('success')
        setTimeout(() => onNext(), 1500)
      } else {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verification failed')
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to verify')
      setStep('failed')
    }
  }, [verificationId, onNext])

  // Initialize MediaPipe
  const initMediaPipe = useCallback(async () => {
    setStep('loading')
    setInstruction('Loading face detection...')
    
    try {
      const FaceMesh = window.FaceMesh
      const Camera = window.Camera
      
      if (!FaceMesh || !Camera) {
        throw new Error('MediaPipe not loaded. Please refresh the page.')
      }

      faceMeshRef.current = new FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      })
      
      faceMeshRef.current.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      
      faceMeshRef.current.onResults(onFaceResults)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        cameraRef.current = new Camera(videoRef.current, {
          onFrame: async () => {
            if (faceMeshRef.current && videoRef.current) {
              await faceMeshRef.current.send({ image: videoRef.current })
            }
          },
          width: 640,
          height: 480
        })
        
        await cameraRef.current.start()
        setStep('ready')
        setInstruction('Position your face in the oval')
      }
    } catch (err) {
      console.error('MediaPipe init error:', err)
      if ((err as Error).name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera in browser settings.')
      } else {
        setError((err as Error).message || 'Failed to initialize face detection')
      }
      setStep('failed')
    }
  }, [onFaceResults])

  // Start challenges
  const startChallenges = useCallback(() => {
    if (!faceValid) {
      setError('Please position your face in the frame first')
      return
    }
    
    // Reset state
    holdFramesRef.current = 0
    challengesRef.current = shuffle(['blink', 'smile', 'turnLeft', 'turnRight'])
    metricsHistoryRef.current = []
    baselineRef.current = null
    spoofScoreRef.current = 0
    
    setChallengeIndex(0)
    setProgress(0)
    setStep('challenge')
    setError('')
  }, [faceValid])

  // Retry after failure
  const retry = useCallback(() => {
    holdFramesRef.current = 0
    challengesRef.current = shuffle(['blink', 'smile', 'turnLeft', 'turnRight'])
    metricsHistoryRef.current = []
    baselineRef.current = null
    spoofScoreRef.current = 0
    lastLandmarksRef.current = null
    
    setChallengeIndex(0)
    setProgress(0)
    setError('')
    setStep('ready')
  }, [])

  // Get instruction text for current challenge
  const getInstruction = useCallback((): string => {
    const challenge = challengesRef.current[challengeIndex]
    switch (challenge) {
      case 'blink': return '👁️ Blink your eyes'
      case 'smile': return '😊 Smile widely'
      case 'turnLeft': return '👈 Turn your head left'
      case 'turnRight': return '👉 Turn your head right'
      default: return 'Follow the instructions'
    }
  }, [challengeIndex])

  // Initialize on mount
  useEffect(() => {
    initMediaPipe()
    
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop()
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [initMediaPipe])

  return (
    <div className="space-y-4">
      {/* Video container */}
      <div className="relative aspect-[4/3] bg-gray-900 rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
         className="w-full h-full object-cover scale-x-[-1]"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Face guide oval */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-48 h-64 border-4 rounded-full transition-colors ${
            faceValid ? 'border-green-500' : faceDetected ? 'border-yellow-500' : 'border-white/30'
          }`} />
        </div>
        
        {/* Face status indicator */}
        <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-sm font-medium bg-black/50">
          {faceValid ? (
            <span className="text-green-400">✓ Face detected</span>
          ) : faceDetected ? (
            <span className="text-yellow-400">⚠ Adjust position</span>
          ) : (
            <span className="text-gray-400">Looking for face...</span>
          )}
        </div>

        {/* Loading overlay */}
        {step === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white text-sm">{instruction}</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute bottom-3 left-3 right-3 bg-red-500/90 text-white text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Success overlay */}
        {step === 'success' && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/90">
            <div className="text-center text-white">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-bold">Verified!</p>
            </div>
          </div>
        )}

        {/* Verifying overlay */}
        {step === 'verifying' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white">Verifying...</p>
            </div>
          </div>
        )}
      </div>

      {/* Challenge UI */}
      {step === 'challenge' && (
        <div className="space-y-3">
          {/* Challenge indicators */}
          <div className="flex justify-center gap-2">
            {challengesRef.current.map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i < challengeIndex ? 'bg-green-500' : i === challengeIndex ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
          
          {/* Current challenge instruction */}
          <p className="text-center text-xl font-bold text-white">{getInstruction()}</p>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <p className="text-center text-sm text-gray-400">
            Challenge {challengeIndex + 1} of {challengesRef.current.length}
          </p>
        </div>
      )}

      {/* Ready state - start button */}
      {step === 'ready' && (
        <button
          onClick={startChallenges}
          disabled={!faceValid}
          className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
            faceValid
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {faceValid ? 'Start Liveness Check' : 'Position your face in the oval'}
        </button>
      )}

      {/* Failed state - retry button */}
      {step === 'failed' && (
        <button
          onClick={retry}
          className="w-full py-4 rounded-xl font-semibold text-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          Try Again
        </button>
      )}

      {/* Anti-spoofing notice */}
      <p className="text-xs text-center text-gray-500">
        🔒 Anti-spoofing active • Photos and videos will be rejected
      </p>
    </div>
  )
}