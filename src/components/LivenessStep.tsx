import { useState, useRef, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'https://identis-production.up.railway.app'

// =============================================================================
// MEDIAPIPE FACEMESH LANDMARK INDICES
// =============================================================================
const LEFT_EYE = [362, 385, 387, 263, 373, 380]
const RIGHT_EYE = [33, 160, 158, 133, 153, 144]
const UPPER_LIP = 13
const LOWER_LIP = 14
const LEFT_MOUTH = 61
const RIGHT_MOUTH = 291
const NOSE_TIP = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454
const FOREHEAD = 10
const CHIN = 152

// =============================================================================
// DETECTION THRESHOLDS - TESTED VALUES
// =============================================================================
const THRESHOLDS = {
  // Eye Aspect Ratio: lower = more closed
  BLINK_THRESHOLD: 0.21,
  BLINK_OPEN: 0.25,
  
  // Mouth ratio: higher = more open
  SMILE_THRESHOLD: 0.35,
  
  // Head turn: nose offset from center
  TURN_THRESHOLD: 0.06,
  
  // Frames to hold each challenge
  HOLD_FRAMES: 5,
  
  // Minimum anti-spoof score to pass (0-1)
  MIN_SPOOF_SCORE: 0.45,
  
  // Micro-movement thresholds (detect static photos)
  MIN_MOVEMENT: 0.001,
  MAX_MOVEMENT: 0.08,
  
  // Depth variance threshold (detect flat images)
  MIN_DEPTH_VARIANCE: 0.0001,
  
  // Face geometry constraints (relaxed for different face shapes)
  FACE_WIDTH_MIN: 0.08,
  FACE_WIDTH_MAX: 0.95,
  HEIGHT_WIDTH_RATIO_MIN: 0.4,
  HEIGHT_WIDTH_RATIO_MAX: 4.0,
  EYE_FACE_RATIO_MIN: 0.1,
  EYE_FACE_RATIO_MAX: 0.95,
  NOSE_OFFSET_MAX: 0.6,
}

// =============================================================================
// TYPES
// =============================================================================
interface Props {
  verificationId: string
  onNext: () => void
}

interface Landmark {
  x: number
  y: number
  z: number
}

interface FaceMeshResults {
  multiFaceLandmarks?: Landmark[][]
}

interface FaceMeshInstance {
  setOptions: (options: Record<string, unknown>) => void
  onResults: (callback: (results: FaceMeshResults) => void) => void
  send: (input: { image: HTMLVideoElement }) => Promise<void>
  close: () => void
}

interface Challenge {
  id: string
  name: string
  icon: string
  check: (landmarks: Landmark[], baseline: Metrics | null) => boolean
}

interface Metrics {
  leftEAR: number
  rightEAR: number
  mouthRatio: number
  noseOffset: number
  landmarks: Landmark[]
}

declare global {
  interface Window {
    FaceMesh: new (config: { locateFile: (file: string) => string }) => FaceMeshInstance
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Calculate Eye Aspect Ratio (EAR) - lower when eye is closed
function calcEAR(landmarks: Landmark[], indices: number[]): number {
  const pts = indices.map(i => landmarks[i])
  const vertical1 = Math.hypot(pts[1].x - pts[5].x, pts[1].y - pts[5].y)
  const vertical2 = Math.hypot(pts[2].x - pts[4].x, pts[2].y - pts[4].y)
  const horizontal = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y)
  return horizontal > 0 ? (vertical1 + vertical2) / (2 * horizontal) : 0
}

// Calculate mouth openness ratio
function calcMouthRatio(landmarks: Landmark[]): number {
  const width = Math.hypot(
    landmarks[RIGHT_MOUTH].x - landmarks[LEFT_MOUTH].x,
    landmarks[RIGHT_MOUTH].y - landmarks[LEFT_MOUTH].y
  )
  const height = Math.hypot(
    landmarks[LOWER_LIP].x - landmarks[UPPER_LIP].x,
    landmarks[LOWER_LIP].y - landmarks[UPPER_LIP].y
  )
  return width > 0 ? height / width : 0
}

// Calculate nose offset from face center (for head turn detection)
function calcNoseOffset(landmarks: Landmark[]): number {
  const faceWidth = Math.abs(landmarks[RIGHT_CHEEK].x - landmarks[LEFT_CHEEK].x)
  const faceCenter = (landmarks[LEFT_CHEEK].x + landmarks[RIGHT_CHEEK].x) / 2
  const noseOffset = landmarks[NOSE_TIP].x - faceCenter
  return faceWidth > 0 ? noseOffset / faceWidth : 0
}

// Calculate depth variance from Z coordinates (flat images have low variance)
function calcDepthVariance(landmarks: Landmark[]): number {
  const zValues = landmarks.map(l => l.z)
  const mean = zValues.reduce((a, b) => a + b, 0) / zValues.length
  const variance = zValues.reduce((sum, z) => sum + Math.pow(z - mean, 2), 0) / zValues.length
  return variance
}

// Calculate movement between frames
function calcMovement(current: Landmark[], previous: Landmark[]): number {
  if (!previous || previous.length !== current.length) return 0
  let totalMovement = 0
  const sampleIndices = [NOSE_TIP, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN]
  for (const i of sampleIndices) {
    totalMovement += Math.hypot(
      current[i].x - previous[i].x,
      current[i].y - previous[i].y
    )
  }
  return totalMovement / sampleIndices.length
}

// Validate face geometry (reject non-face objects)
function validateFaceGeometry(landmarks: Landmark[]): boolean {
  const faceWidth = Math.hypot(
    landmarks[RIGHT_CHEEK].x - landmarks[LEFT_CHEEK].x,
    landmarks[RIGHT_CHEEK].y - landmarks[LEFT_CHEEK].y
  )
  const faceHeight = Math.hypot(
    landmarks[CHIN].x - landmarks[FOREHEAD].x,
    landmarks[CHIN].y - landmarks[FOREHEAD].y
  )
  const eyeDistance = Math.hypot(
    landmarks[LEFT_EYE[0]].x - landmarks[RIGHT_EYE[0]].x,
    landmarks[LEFT_EYE[0]].y - landmarks[RIGHT_EYE[0]].y
  )
  const noseOffset = Math.abs(calcNoseOffset(landmarks))
  
  const heightWidthRatio = faceHeight / faceWidth
  const eyeFaceRatio = eyeDistance / faceWidth
  
  // Relaxed constraints for different face shapes and angles
  if (heightWidthRatio < THRESHOLDS.HEIGHT_WIDTH_RATIO_MIN || 
      heightWidthRatio > THRESHOLDS.HEIGHT_WIDTH_RATIO_MAX) return false
  if (eyeFaceRatio < THRESHOLDS.EYE_FACE_RATIO_MIN || 
      eyeFaceRatio > THRESHOLDS.EYE_FACE_RATIO_MAX) return false
  if (noseOffset > THRESHOLDS.NOSE_OFFSET_MAX) return false
  if (faceWidth < THRESHOLDS.FACE_WIDTH_MIN || 
      faceWidth > THRESHOLDS.FACE_WIDTH_MAX) return false
  
  return true
}

// Get current metrics from landmarks
function getMetrics(landmarks: Landmark[]): Metrics {
  return {
    leftEAR: calcEAR(landmarks, LEFT_EYE),
    rightEAR: calcEAR(landmarks, RIGHT_EYE),
    mouthRatio: calcMouthRatio(landmarks),
    noseOffset: calcNoseOffset(landmarks),
    landmarks: landmarks.slice() // Copy for movement calculation
  }
}

// =============================================================================
// CHALLENGE DEFINITIONS
// =============================================================================
function createChallenges(): Challenge[] {
  return [
    {
      id: 'blink',
      name: 'Blink your eyes',
      icon: '👁️',
      check: (landmarks: Landmark[], baseline: Metrics | null) => {
        const leftEAR = calcEAR(landmarks, LEFT_EYE)
        const rightEAR = calcEAR(landmarks, RIGHT_EYE)
        const avgEAR = (leftEAR + rightEAR) / 2
        
        // If we have baseline, check for significant drop from baseline
        if (baseline) {
          const baselineEAR = (baseline.leftEAR + baseline.rightEAR) / 2
          const drop = baselineEAR - avgEAR
          return drop > 0.05 && avgEAR < THRESHOLDS.BLINK_THRESHOLD
        }
        
        // Without baseline, just check absolute threshold
        return avgEAR < THRESHOLDS.BLINK_THRESHOLD
      }
    },
    {
      id: 'smile',
      name: 'Smile naturally',
      icon: '😊',
      check: (landmarks: Landmark[], baseline: Metrics | null) => {
        const mouthRatio = calcMouthRatio(landmarks)
        
        // If we have baseline, check for increase from baseline
        if (baseline) {
          const increase = mouthRatio - baseline.mouthRatio
          return increase > 0.1 || mouthRatio > THRESHOLDS.SMILE_THRESHOLD
        }
        
        return mouthRatio > THRESHOLDS.SMILE_THRESHOLD
      }
    },
    {
      id: 'turn',
      name: 'Turn your head slightly',
      icon: '↔️',
      check: (landmarks: Landmark[], baseline: Metrics | null) => {
        const noseOffset = calcNoseOffset(landmarks)
        
        // If we have baseline, check for change from baseline
        if (baseline) {
          const change = Math.abs(noseOffset - baseline.noseOffset)
          return change > THRESHOLDS.TURN_THRESHOLD || Math.abs(noseOffset) > THRESHOLDS.TURN_THRESHOLD
        }
        
        return Math.abs(noseOffset) > THRESHOLDS.TURN_THRESHOLD
      }
    }
  ]
}

// Shuffle array (Fisher-Yates)
function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// =============================================================================
// COMPONENT
// =============================================================================
export default function LivenessStep({ verificationId, onNext }: Props) {
  // UI State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [step, setStep] = useState<'init' | 'ready' | 'checking' | 'complete' | 'failed'>('init')
  const [instruction, setInstruction] = useState('Loading camera...')
  const [faceDetected, setFaceDetected] = useState(false)
  const [progress, setProgress] = useState(0)
  const [debugInfo, setDebugInfo] = useState('')
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceMeshRef = useRef<FaceMeshInstance | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  
  // Challenge state refs
  const challengesRef = useRef<Challenge[]>([])
  const currentChallengeRef = useRef(0)
  const holdFramesRef = useRef(0)
  const completedRef = useRef<string[]>([])
  const baselineRef = useRef<Metrics | null>(null)
  const lastLandmarksRef = useRef<Landmark[] | null>(null)
  const selfieDataRef = useRef<string | null>(null)
  
  // Anti-spoof tracking
  const spoofDataRef = useRef({
    movements: [] as number[],
    depthVariances: [] as number[],
    blinkDetected: false,
    smileDetected: false,
    turnDetected: false
  })

  // Calculate final spoof score
  const calculateSpoofScore = useCallback((): number => {
    const data = spoofDataRef.current
    let score = 0
    
    // Challenge completion (0.15 each = 0.45 total)
    if (data.blinkDetected) score += 0.15
    if (data.smileDetected) score += 0.15
    if (data.turnDetected) score += 0.15
    
    // Movement analysis (up to 0.25)
    if (data.movements.length >= 5) {
      const avgMovement = data.movements.reduce((a, b) => a + b, 0) / data.movements.length
      if (avgMovement >= THRESHOLDS.MIN_MOVEMENT && avgMovement <= THRESHOLDS.MAX_MOVEMENT) {
        score += 0.25
      } else if (avgMovement > 0) {
        score += 0.1 // Partial credit
      }
    }
    
    // Depth variance (up to 0.2)
    if (data.depthVariances.length >= 3) {
      const avgDepth = data.depthVariances.reduce((a, b) => a + b, 0) / data.depthVariances.length
      if (avgDepth > THRESHOLDS.MIN_DEPTH_VARIANCE) {
        score += 0.2
      } else if (avgDepth > 0) {
        score += 0.1 // Partial credit
      }
    }
    
    // Bonus for completing all challenges
    if (completedRef.current.length >= 3) {
      score += 0.1
    }
    
    return Math.min(score, 1)
  }, [])

  // Process each frame from MediaPipe
  const processResults = useCallback((results: FaceMeshResults) => {
    if (step !== 'checking' && step !== 'ready') return
    
    const landmarks = results.multiFaceLandmarks?.[0]
    
    if (!landmarks || landmarks.length < 468) {
      setFaceDetected(false)
      setDebugInfo('No face detected')
      return
    }
    
    // Validate face geometry
    if (!validateFaceGeometry(landmarks)) {
      setFaceDetected(false)
      setDebugInfo('Invalid face geometry')
      return
    }
    
    setFaceDetected(true)
    
    // Track movement between frames
    if (lastLandmarksRef.current) {
      const movement = calcMovement(landmarks, lastLandmarksRef.current)
      spoofDataRef.current.movements.push(movement)
      if (spoofDataRef.current.movements.length > 30) {
        spoofDataRef.current.movements.shift()
      }
    }
    lastLandmarksRef.current = landmarks.slice()
    
    // Track depth variance
    const depthVar = calcDepthVariance(landmarks)
    spoofDataRef.current.depthVariances.push(depthVar)
    if (spoofDataRef.current.depthVariances.length > 30) {
      spoofDataRef.current.depthVariances.shift()
    }
    
    // If just ready, capture baseline
    if (step === 'ready' && !baselineRef.current) {
      baselineRef.current = getMetrics(landmarks)
      setDebugInfo('Baseline captured - Face detected!')
    }
    
    // If checking, process challenges
    if (step === 'checking') {
      const challenges = challengesRef.current
      const currentIdx = currentChallengeRef.current
      
      if (currentIdx >= challenges.length) {
        // All challenges done - calculate final score
        const spoofScore = calculateSpoofScore()
        console.log('Final spoof score:', spoofScore)
        setDebugInfo(`Spoof score: ${spoofScore.toFixed(2)}`)
        
        if (spoofScore >= THRESHOLDS.MIN_SPOOF_SCORE) {
          // Capture selfie
          if (videoRef.current && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
              canvasRef.current.width = videoRef.current.videoWidth
              canvasRef.current.height = videoRef.current.videoHeight
              ctx.drawImage(videoRef.current, 0, 0)
              selfieDataRef.current = canvasRef.current.toDataURL('image/jpeg', 0.8)
            }
          }
          setStep('complete')
          setInstruction('✓ Verification complete!')
          submitResult(spoofScore)
        } else {
          setStep('failed')
          setInstruction(`Verification failed. Score: ${spoofScore.toFixed(2)} (need ${THRESHOLDS.MIN_SPOOF_SCORE})`)
        }
        return
      }
      
      const challenge = challenges[currentIdx]
      const passed = challenge.check(landmarks, baselineRef.current)
      
      setDebugInfo(`Challenge: ${challenge.id}, Hold: ${holdFramesRef.current}/${THRESHOLDS.HOLD_FRAMES}`)
      
      if (passed) {
        holdFramesRef.current++
        setInstruction(`${challenge.icon} ${challenge.name} - Hold... (${holdFramesRef.current}/${THRESHOLDS.HOLD_FRAMES})`)
        
        if (holdFramesRef.current >= THRESHOLDS.HOLD_FRAMES) {
          // Challenge complete
          completedRef.current.push(challenge.id)
          
          // Track in spoof data
          if (challenge.id === 'blink') spoofDataRef.current.blinkDetected = true
          if (challenge.id === 'smile') spoofDataRef.current.smileDetected = true
          if (challenge.id === 'turn') spoofDataRef.current.turnDetected = true
          
          // Move to next challenge
          currentChallengeRef.current++
          holdFramesRef.current = 0
          
          setProgress((currentChallengeRef.current / challenges.length) * 100)
          
          if (currentChallengeRef.current < challenges.length) {
            const next = challenges[currentChallengeRef.current]
            setInstruction(`${next.icon} ${next.name}`)
          }
        }
      } else {
        // Reset hold if challenge not met
        if (holdFramesRef.current > 0) {
          holdFramesRef.current = Math.max(0, holdFramesRef.current - 1)
        }
      }
    }
  }, [step, calculateSpoofScore])

  // Submit liveness result to backend
  const submitResult = async (spoofScore: number) => {
    try {
      const response = await fetch(`${API_URL}/api/verify/liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId,
          livenessScore: spoofScore,
          selfieBase64: selfieDataRef.current,
          completedChallenges: completedRef.current,
          timestamp: new Date().toISOString()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to submit liveness result')
      }

      setTimeout(() => onNext(), 1500)
    } catch (err) {
      console.error('Submit error:', err)
      setError('Failed to save result. Please try again.')
    }
  }
    
    // Reset state
    challengesRef.current = shuffle(createChallenges())
    currentChallengeRef.current = 0
    holdFramesRef.current = 0
    completedRef.current = []
    spoofDataRef.current = {
      movements: [],
      depthVariances: [],
      blinkDetected: false,
      smileDetected: false,
      turnDetected: false
    }
    
    setStep('checking')
    setProgress(0)
    setError('')
    
    const firstChallenge = challengesRef.current[0]
    setInstruction(`${firstChallenge.icon} ${firstChallenge.name}`)
  }, [faceDetected])

  // Retry after failure
  const retry = useCallback(() => {
    setStep('ready')
    setError('')
    setProgress(0)
    baselineRef.current = null
    setInstruction('Position your face and tap Start')
  }, [])

  // Run MediaPipe detection loop
  const runDetection = useCallback(async () => {
    if (!videoRef.current || !faceMeshRef.current) return
    
    if (videoRef.current.readyState >= 2) {
      await faceMeshRef.current.send({ image: videoRef.current })
    }
    
    animationRef.current = requestAnimationFrame(runDetection)
  }, [])

  // Initialize MediaPipe FaceMesh
  const initFaceMesh = useCallback(async () => {
    try {
      // Load MediaPipe script if not present
      if (!window.FaceMesh) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load MediaPipe'))
          document.head.appendChild(script)
        })
      }
      
      // Create FaceMesh instance
      const faceMesh = new window.FaceMesh({
        locateFile: (file: string) => 
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      })
      
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      
      faceMesh.onResults(processResults)
      faceMeshRef.current = faceMesh
      
      return true
    } catch (err) {
      console.error('FaceMesh init error:', err)
      return false
    }
  }, [processResults])

  // Initialize camera
  const initCamera = useCallback(async () => {
    setLoading(true)
    setError('')
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 640 }, 
          height: { ideal: 480 } 
        }
      })
      
      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      
      // Initialize MediaPipe
      const faceMeshReady = await initFaceMesh()
      if (!faceMeshReady) {
        throw new Error('Failed to initialize face detection')
      }
      
      setCameraReady(true)
      setStep('ready')
      setInstruction('Position your face in the frame')
      setLoading(false)
      
      // Start detection loop
      runDetection()
    } catch (err) {
      setLoading(false)
      const error = err as Error
      
      if (error.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera in browser settings.')
      } else if (error.name === 'NotFoundError') {
        setError('No camera found. Please connect a camera.')
      } else {
        setError(`Camera error: ${error.message}`)
      }
    }
  }, [initFaceMesh, runDetection])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (faceMeshRef.current) {
        faceMeshRef.current.close()
      }
    }
  }, [])

  // Auto-init camera on mount
  useEffect(() => {
    initCamera()
  }, [initCamera])

  return (
    <div className="liveness-container" style={{ maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#1e3a5f' }}>
        Liveness Verification
      </h2>
      
      {/* Video container */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        aspectRatio: '4/3',
        backgroundColor: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '20px'
      }}>
        <video 
          ref={videoRef} 
          playsInline 
          muted
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            transform: 'scaleX(-1)'
          }} 
        />
        
        {/* Face guide overlay */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '60%',
          height: '75%',
          border: `3px solid ${faceDetected ? '#22c55e' : '#ef4444'}`,
          borderRadius: '50%',
          pointerEvents: 'none',
          transition: 'border-color 0.3s'
        }} />
        
        {/* Status indicator */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          padding: '6px 12px',
          borderRadius: '20px',
          backgroundColor: faceDetected ? '#22c55e' : '#ef4444',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {faceDetected ? '✓ Face detected' : '✗ No face'}
        </div>
        
        {/* Loading overlay */}
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{
                width: '40px',
                height: '40px',
                border: '3px solid #fff',
                borderTop: '3px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 10px'
              }} />
              <p>Initializing camera...</p>
            </div>
          </div>
        )}
        
        {/* Success overlay */}
        {step === 'complete' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(34, 197, 94, 0.9)'
          }}>
            <div style={{ 
              fontSize: '80px', 
              color: 'white',
              animation: 'scaleIn 0.3s ease-out'
            }}>✓</div>
          </div>
        )}
      </div>
      
      {/* Hidden canvas for selfie capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* Progress bar */}
      {step === 'checking' && (
        <div style={{ 
          width: '100%', 
          height: '8px', 
          backgroundColor: '#e5e7eb', 
          borderRadius: '4px',
          marginBottom: '15px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: '#22c55e',
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}
      
      {/* Instruction text */}
      <p style={{ 
        textAlign: 'center', 
        fontSize: '18px', 
        fontWeight: '500',
        marginBottom: '15px',
        minHeight: '27px'
      }}>
        {instruction}
      </p>
      
      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '8px',
          marginBottom: '15px',
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}
      
      {/* Debug info (remove in production) */}
      {import.meta.env.DEV && debugInfo && (
        <p style={{ 
          fontSize: '12px', 
          color: '#666', 
          textAlign: 'center',
          marginBottom: '15px'
        }}>
          Debug: {debugInfo}
        </p>
      )}
      
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {step === 'ready' && (
          <button
            onClick={startCheck}
            disabled={!faceDetected}
            style={{
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: faceDetected ? '#1e3a5f' : '#9ca3af',
              border: 'none',
              borderRadius: '8px',
              cursor: faceDetected ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s'
            }}
          >
            Start Liveness Check
          </button>
        )}
        
        {step === 'failed' && (
          <button
            onClick={retry}
            style={{
              padding: '14px 32px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: 'white',
              backgroundColor: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        )}
      </div>
      
      {/* Security note */}
      <p style={{ 
        textAlign: 'center', 
        fontSize: '12px', 
        color: '#6b7280',
        marginTop: '20px'
      }}>
        🔒 Anti-spoofing protection active
      </p>
      
      {/* CSS keyframes */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
