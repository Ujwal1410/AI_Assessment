import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFaceDetection, FaceDetectionResult } from "../../hooks/useFaceDetection";

interface CameraProctorModalProps {
  isOpen: boolean;
  onAccept: (referencePhoto: string, screenStream: MediaStream, webcamStream: MediaStream) => Promise<boolean>;
  candidateName?: string;
  isLoading?: boolean;
  cameraError?: string | null;
}

/**
 * Modal for camera proctoring consent and initialization.
 * Step 1: Camera preview + capture photo
 * Step 2: Screen share
 * Step 3: Enter fullscreen + Start Assessment
 */
export function CameraProctorModal({
  isOpen,
  onAccept,
  candidateName,
  isLoading = false,
  cameraError = null,
}: CameraProctorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  
  // Step management: 1 = photo, 2 = screen share, 3 = fullscreen
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step 1 states (Photo)
  const [consentChecked, setConsentChecked] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  
  // Face detection states
  const [faceResult, setFaceResult] = useState<FaceDetectionResult | null>(null);
  const [isAnalyzingFace, setIsAnalyzingFace] = useState(false);
  const { isModelLoading, loadModel, detectFacesFromDataUrl } = useFaceDetection();
  
  // Step 2 states (Screen Share)
  const [isRequestingScreen, setIsRequestingScreen] = useState(false);
  const [screenShareGranted, setScreenShareGranted] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  
  // Step 3 states (Fullscreen)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRequestingFullscreen, setIsRequestingFullscreen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  // Use REF to track starting state - refs update SYNCHRONOUSLY
  const isStartingRef = useRef(false);

  // Auto-start camera when modal opens
  useEffect(() => {
    if (isOpen && !previewStreamRef.current) {
      startCameraPreview();
    }
    
    // Only cleanup when modal closes WITHOUT starting assessment
    if (!isOpen && !isStartingRef.current) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
        previewStreamRef.current = null;
      }
      setCameraReady(false);
      setIsCameraLoading(false);
      setCurrentStep(1);
      setCapturedPhoto(null);
      setFaceResult(null);
      setConsentChecked(false);
      setScreenShareGranted(false);
      setIsFullscreen(false);
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
      }
    }
  }, [isOpen]);

  // Check fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Prevent ESC from closing modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen]);

  const startCameraPreview = useCallback(async () => {
    try {
      setIsCameraLoading(true);
      setLocalError(null);
      
      // Start loading face detection model in background
      loadModel().catch(console.error);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: true, // Include audio for proctoring
      });
      
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      console.error("Camera preview error:", error);
      setLocalError("Could not access camera. Please check your permissions.");
    } finally {
      setIsCameraLoading(false);
    }
  }, [loadModel]);

  const handleCapturePhoto = useCallback(async () => {
    if (!previewVideoRef.current || !canvasRef.current || !cameraReady) return;
    
    setIsCapturing(true);
    setFaceResult(null);
    setLocalError(null);
    
    const video = previewVideoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      setIsCapturing(false);
      return;
    }
    
    const maxWidth = 640;
    const maxHeight = 480;
    let targetWidth = video.videoWidth;
    let targetHeight = video.videoHeight;
    
    if (targetWidth > maxWidth) {
      const ratio = maxWidth / targetWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(video.videoHeight * ratio);
    }
    if (targetHeight > maxHeight) {
      const ratio = maxHeight / targetHeight;
      targetHeight = maxHeight;
      targetWidth = Math.round(targetWidth * ratio);
    }
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const photoData = canvas.toDataURL("image/jpeg", 0.6);
    setCapturedPhoto(photoData);
    setIsCapturing(false);
    
    // Analyze face in captured photo
    setIsAnalyzingFace(true);
    try {
      const result = await detectFacesFromDataUrl(photoData);
      setFaceResult(result);
      
      if (result.isValid) {
        // Only save to session storage if face is valid
        sessionStorage.setItem("candidateReferencePhoto", photoData);
      }
    } catch (error) {
      console.error("Face detection error:", error);
      setFaceResult({
        faceCount: 0,
        status: "no_face",
        confidence: 0,
        message: "Face detection failed. Please try again.",
        isValid: false,
      });
    } finally {
      setIsAnalyzingFace(false);
    }
  }, [cameraReady, detectFacesFromDataUrl]);

  const handleRetakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    setFaceResult(null);
    setLocalError(null);
    sessionStorage.removeItem("candidateReferencePhoto");
  }, []);

  const handleNextToScreenShare = useCallback(() => {
    if (capturedPhoto && consentChecked && faceResult?.isValid) {
      setCurrentStep(2);
    }
  }, [capturedPhoto, consentChecked, faceResult]);

  const handleRequestScreenShare = useCallback(async () => {
    setIsRequestingScreen(true);
    setLocalError(null);
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      
      setScreenStream(stream);
      setScreenShareGranted(true);
      sessionStorage.setItem("screenShareGranted", "true");
      
      stream.getVideoTracks()[0].onended = () => {
        setScreenShareGranted(false);
        setScreenStream(null);
        sessionStorage.removeItem("screenShareGranted");
      };
    } catch (error) {
      console.error("Screen share error:", error);
      setLocalError("Screen sharing is required. Please select 'Entire Screen'.");
    } finally {
      setIsRequestingScreen(false);
    }
  }, []);

  const handleNextToFullscreen = useCallback(() => {
    if (screenShareGranted) {
      setCurrentStep(3);
    }
  }, [screenShareGranted]);

  const handleRequestFullscreen = useCallback(async () => {
    setIsRequestingFullscreen(true);
    setLocalError(null);
    
    try {
      const elem = document.documentElement;
      
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).mozRequestFullScreen) {
        await (elem as any).mozRequestFullScreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      
      // Wait for fullscreen to apply
      await new Promise(resolve => setTimeout(resolve, 200));
      setIsFullscreen(true);
    } catch (error) {
      console.error("Fullscreen error:", error);
      setLocalError("Failed to enter fullscreen. Please try again.");
    } finally {
      setIsRequestingFullscreen(false);
    }
  }, []);

  const handleStartAssessment = async () => {
    if (!capturedPhoto || !screenStream || !previewStreamRef.current || !isFullscreen) return;
    
    isStartingRef.current = true;
    setIsStarting(true);
    setLocalError(null);
    
    try {
      const webcamStream = previewStreamRef.current;
      const success = await onAccept(capturedPhoto, screenStream, webcamStream);
      
      if (!success) {
        setLocalError("Failed to start. Please try again.");
        isStartingRef.current = false;
      }
    } catch (error) {
      setLocalError("An error occurred. Please try again.");
      isStartingRef.current = false;
    } finally {
      setIsStarting(false);
    }
  };

  const displayError = cameraError || localError;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "0.5rem",
      }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <canvas ref={canvasRef} style={{ display: "none" }} />
      
      <div
        ref={modalRef}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "0.75rem",
          maxWidth: "480px",
          width: "100%",
          padding: "1.25rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          animation: "cameraModalFadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step Indicator - 3 steps now */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          {[1, 2, 3].map((step, idx) => (
            <React.Fragment key={step}>
              <div style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: currentStep >= step ? "#10b981" : "#e2e8f0",
                color: currentStep >= step ? "#fff" : "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}>
                {currentStep > step ? "✓" : step}
              </div>
              {idx < 2 && (
                <div style={{ width: "30px", height: "2px", backgroundColor: currentStep > step ? "#10b981" : "#e2e8f0" }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error message */}
        {displayError && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "0.75rem", textAlign: "center" }}>
            <p style={{ margin: 0, color: "#dc2626", fontSize: "0.8125rem", fontWeight: 500 }}>{displayError}</p>
          </div>
        )}

        {/* STEP 1: Photo Capture */}
        {currentStep === 1 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ width: "40px", height: "40px", backgroundColor: "#ecfdf5", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>Step 1: Capture Photo</h2>
                {candidateName && <p style={{ margin: 0, color: "#64748b", fontSize: "0.8125rem" }}>Welcome, <strong>{candidateName}</strong></p>}
              </div>
            </div>

            <div style={{ 
              marginBottom: "0.75rem", 
              borderRadius: "0.5rem", 
              overflow: "hidden", 
              backgroundColor: "#000", 
              aspectRatio: "16/10", 
              position: "relative", 
              border: capturedPhoto 
                ? faceResult?.isValid 
                  ? "2px solid #10b981" 
                  : faceResult 
                    ? "2px solid #ef4444" 
                    : "2px solid #f59e0b"
                : "2px solid #e2e8f0" 
            }}>
              {isCameraLoading && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#1e293b", zIndex: 1 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  <p style={{ color: "#94a3b8", marginTop: "0.75rem", fontSize: "0.875rem" }}>Initializing camera...</p>
                </div>
              )}
              {capturedPhoto ? (
                <img src={capturedPhoto} alt="Captured" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <video ref={previewVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: cameraReady ? "block" : "none" }} />
              )}
              
              {/* Model Loading Indicator */}
              {isModelLoading && !capturedPhoto && (
                <div style={{ position: "absolute", bottom: "0.5rem", left: "0.5rem", backgroundColor: "rgba(0,0,0,0.7)", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.625rem" }}>
                  Loading face detection...
                </div>
              )}
              
              {/* Analyzing Face Overlay */}
              {isAnalyzingFace && capturedPhoto && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)", zIndex: 2 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  <p style={{ color: "#fff", marginTop: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}>Analyzing face...</p>
                </div>
              )}
              
              {/* Face Detection Badge */}
              {capturedPhoto && !isAnalyzingFace && faceResult && (
                <div style={{ 
                  position: "absolute", 
                  top: "0.75rem", 
                  left: "0.75rem", 
                  backgroundColor: faceResult.isValid ? "#10b981" : "#ef4444", 
                  color: "#fff", 
                  padding: "0.375rem 0.75rem", 
                  borderRadius: "1rem", 
                  fontSize: "0.75rem", 
                  fontWeight: 600 
                }}>
                  {faceResult.isValid ? "✓ Face Verified" : faceResult.status === "multiple_faces" ? "⚠ Multiple Faces" : "✗ No Face Detected"}
                </div>
              )}
            </div>
            
            {/* Face Detection Result Message */}
            {capturedPhoto && !isAnalyzingFace && faceResult && !faceResult.isValid && (
              <div style={{ 
                marginBottom: "0.75rem", 
                padding: "0.625rem", 
                backgroundColor: faceResult.status === "multiple_faces" ? "#fef3c7" : "#fef2f2", 
                border: `1px solid ${faceResult.status === "multiple_faces" ? "#fcd34d" : "#fecaca"}`, 
                borderRadius: "0.5rem",
                textAlign: "center"
              }}>
                <p style={{ 
                  margin: 0, 
                  color: faceResult.status === "multiple_faces" ? "#92400e" : "#dc2626", 
                  fontSize: "0.8125rem", 
                  fontWeight: 500 
                }}>
                  {faceResult.status === "multiple_faces" ? "👥 " : "😕 "}
                  {faceResult.message}
                </p>
                <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.75rem" }}>
                  Please retake the photo
                </p>
              </div>
            )}
            
            {/* Face Detection Success Message */}
            {capturedPhoto && !isAnalyzingFace && faceResult?.isValid && (
              <div style={{ 
                marginBottom: "0.75rem", 
                padding: "0.625rem", 
                backgroundColor: "#f0fdf4", 
                border: "1px solid #86efac", 
                borderRadius: "0.5rem",
                textAlign: "center"
              }}>
                <p style={{ margin: 0, color: "#16a34a", fontSize: "0.8125rem", fontWeight: 500 }}>
                  ✅ {faceResult.message}
                </p>
                <p style={{ margin: "0.25rem 0 0", color: "#22c55e", fontSize: "0.75rem" }}>
                  This photo will be used as your reference for proctoring
                </p>
              </div>
            )}

            <div style={{ marginBottom: "0.75rem" }}>
              {!capturedPhoto ? (
                <button 
                  type="button" 
                  onClick={handleCapturePhoto} 
                  disabled={!cameraReady || isCapturing || isModelLoading} 
                  style={{ 
                    width: "100%", 
                    padding: "0.625rem", 
                    backgroundColor: cameraReady && !isModelLoading ? "#3b82f6" : "#94a3b8", 
                    color: "#fff", 
                    border: "none", 
                    borderRadius: "0.375rem", 
                    fontSize: "0.875rem", 
                    fontWeight: 600, 
                    cursor: cameraReady && !isModelLoading ? "pointer" : "not-allowed" 
                  }}
                >
                  {isCapturing ? "Capturing..." : isModelLoading ? "Loading..." : "📸 Capture Photo"}
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={handleRetakePhoto} 
                  disabled={isAnalyzingFace}
                  style={{ 
                    width: "100%", 
                    padding: "0.5rem", 
                    backgroundColor: "#f1f5f9", 
                    color: "#475569", 
                    border: "1px solid #e2e8f0", 
                    borderRadius: "0.375rem", 
                    fontSize: "0.8125rem", 
                    fontWeight: 500, 
                    cursor: isAnalyzingFace ? "not-allowed" : "pointer",
                    opacity: isAnalyzingFace ? 0.6 : 1
                  }}
                >
                  🔄 Retake Photo
                </button>
              )}
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", marginBottom: "0.75rem", padding: "0.5rem 0.625rem", backgroundColor: consentChecked ? "#f0fdf4" : "#f8fafc", border: `1.5px solid ${consentChecked ? "#10b981" : "#e2e8f0"}`, borderRadius: "0.375rem" }}>
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} style={{ width: "1rem", height: "1rem", marginTop: "1px", accentColor: "#10b981" }} />
              <span style={{ fontSize: "0.75rem", color: "#334155", lineHeight: 1.4 }}>
                I consent to camera, screen, and fullscreen monitoring
              </span>
            </label>

            <button 
              type="button" 
              onClick={handleNextToScreenShare} 
              disabled={!capturedPhoto || !consentChecked || !faceResult?.isValid || isAnalyzingFace} 
              style={{ 
                width: "100%", 
                padding: "0.625rem", 
                backgroundColor: capturedPhoto && consentChecked && faceResult?.isValid ? "#10b981" : "#94a3b8", 
                color: "#fff", 
                border: "none", 
                borderRadius: "0.375rem", 
                fontSize: "0.875rem", 
                fontWeight: 600, 
                cursor: capturedPhoto && consentChecked && faceResult?.isValid ? "pointer" : "not-allowed" 
              }}
            >
              Next: Share Screen →
            </button>
          </>
        )}

        {/* STEP 2: Screen Share */}
        {currentStep === 2 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ width: "40px", height: "40px", backgroundColor: screenShareGranted ? "#ecfdf5" : "#fef3c7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={screenShareGranted ? "#10b981" : "#f59e0b"} strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>Step 2: Share Screen</h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "0.8125rem" }}>Select "Entire Screen"</p>
              </div>
            </div>

            <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: screenShareGranted ? "#f0fdf4" : "#fffbeb", borderRadius: "0.5rem", border: `1px solid ${screenShareGranted ? "#86efac" : "#fcd34d"}`, textAlign: "center" }}>
              {screenShareGranted ? (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
                  <p style={{ margin: 0, color: "#16a34a", fontSize: "0.9375rem", fontWeight: 600 }}>Screen Sharing Active</p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🖥️</div>
                  <p style={{ margin: 0, color: "#92400e", fontSize: "0.9375rem", fontWeight: 600 }}>Screen Share Required</p>
                  <p style={{ margin: "0.25rem 0 0", color: "#a16207", fontSize: "0.75rem" }}>Click below and select "Entire screen"</p>
                </>
              )}
            </div>

            {!screenShareGranted ? (
              <button type="button" onClick={handleRequestScreenShare} disabled={isRequestingScreen} style={{ width: "100%", padding: "0.75rem", backgroundColor: isRequestingScreen ? "#94a3b8" : "#f59e0b", color: "#fff", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: 600, cursor: isRequestingScreen ? "not-allowed" : "pointer" }}>
                {isRequestingScreen ? "Requesting..." : "🖥️ Share Screen"}
              </button>
            ) : (
              <button type="button" onClick={handleNextToFullscreen} style={{ width: "100%", padding: "0.75rem", backgroundColor: "#10b981", color: "#fff", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer" }}>
                Next: Enter Fullscreen →
              </button>
            )}

            <button type="button" onClick={() => setCurrentStep(1)} style={{ width: "100%", marginTop: "0.5rem", padding: "0.5rem", backgroundColor: "transparent", color: "#64748b", border: "none", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}>
              ← Back to Photo
            </button>
          </>
        )}

        {/* STEP 3: Fullscreen + Start */}
        {currentStep === 3 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ width: "40px", height: "40px", backgroundColor: isFullscreen ? "#ecfdf5" : "#eff6ff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isFullscreen ? "#10b981" : "#3b82f6"} strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>Step 3: Enter Fullscreen</h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "0.8125rem" }}>Required for proctoring</p>
              </div>
            </div>

            <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: isFullscreen ? "#f0fdf4" : "#eff6ff", borderRadius: "0.5rem", border: `1px solid ${isFullscreen ? "#86efac" : "#93c5fd"}`, textAlign: "center" }}>
              {isFullscreen ? (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
                  <p style={{ margin: 0, color: "#16a34a", fontSize: "0.9375rem", fontWeight: 600 }}>Fullscreen Active</p>
                  <p style={{ margin: "0.25rem 0 0", color: "#22c55e", fontSize: "0.75rem" }}>You're ready to start!</p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🖥️</div>
                  <p style={{ margin: 0, color: "#1e40af", fontSize: "0.9375rem", fontWeight: 600 }}>Fullscreen Required</p>
                  <p style={{ margin: "0.25rem 0 0", color: "#3b82f6", fontSize: "0.75rem" }}>Click below to enter fullscreen mode</p>
                </>
              )}
            </div>

            {!isFullscreen ? (
              <button type="button" onClick={handleRequestFullscreen} disabled={isRequestingFullscreen} style={{ width: "100%", padding: "0.75rem", backgroundColor: isRequestingFullscreen ? "#94a3b8" : "#3b82f6", color: "#fff", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: 600, cursor: isRequestingFullscreen ? "not-allowed" : "pointer" }}>
                {isRequestingFullscreen ? "Entering..." : "🖥️ Enter Fullscreen"}
              </button>
            ) : (
              <button ref={acceptButtonRef} type="button" onClick={handleStartAssessment} disabled={isStarting || isLoading} style={{ width: "100%", padding: "0.75rem", backgroundColor: isStarting || isLoading ? "#94a3b8" : "#10b981", color: "#fff", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: 600, cursor: isStarting || isLoading ? "not-allowed" : "pointer" }}>
                {isStarting || isLoading ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite", display: "inline", marginRight: "0.5rem", verticalAlign: "middle" }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    Starting...
                  </>
                ) : (
                  "🚀 Start Assessment"
                )}
              </button>
            )}

            <button type="button" onClick={() => setCurrentStep(2)} style={{ width: "100%", marginTop: "0.5rem", padding: "0.5rem", backgroundColor: "transparent", color: "#64748b", border: "none", borderRadius: "0.375rem", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}>
              ← Back to Screen Share
            </button>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes cameraModalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default CameraProctorModal;
