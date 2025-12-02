import React, { useState, useRef, useEffect, useCallback } from "react";

interface CameraProctorModalProps {
  isOpen: boolean;
  onAccept: (referencePhoto: string) => Promise<boolean>;
  candidateName?: string;
  isLoading?: boolean;
  cameraError?: string | null;
}

/**
 * Modal for camera proctoring consent and initialization.
 * Camera auto-starts when modal opens. Requires photo capture and consent before starting proctoring.
 */
export function CameraProctorModal({
  isOpen,
  onAccept,
  candidateName,
  isLoading = false,
  cameraError = null,
}: CameraProctorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // Auto-start camera when modal opens
  useEffect(() => {
    if (isOpen && !previewStreamRef.current) {
      startCameraPreview();
    }
    
    // Cleanup when modal closes
    if (!isOpen && previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(track => track.stop());
      previewStreamRef.current = null;
      setCameraReady(false);
      setIsCameraLoading(false);
    }
  }, [isOpen]);

  // Focus the accept button when modal opens and consent is checked
  useEffect(() => {
    if (isOpen && acceptButtonRef.current && consentChecked) {
      acceptButtonRef.current.focus();
    }
  }, [isOpen, consentChecked]);

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

  // Trap focus within modal
  useEffect(() => {
    if (!isOpen) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  // Cleanup preview stream on unmount
  useEffect(() => {
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCameraPreview = useCallback(async () => {
    try {
      setIsCameraLoading(true);
      setLocalError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });
      
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      console.error("Camera preview error:", error);
      setLocalError("Could not access camera. Please check your permissions and try again.");
    } finally {
      setIsCameraLoading(false);
    }
  }, []);

  // Capture photo from video stream
  const handleCapturePhoto = useCallback(() => {
    if (!previewVideoRef.current || !canvasRef.current || !cameraReady) return;
    
    setIsCapturing(true);
    
    const video = previewVideoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      setIsCapturing(false);
      return;
    }
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw mirrored image (to match what user sees)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64
    const photoData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedPhoto(photoData);
    
    // Store reference photo in sessionStorage
    sessionStorage.setItem("candidateReferencePhoto", photoData);
    
    setIsCapturing(false);
  }, [cameraReady]);

  // Retake photo
  const handleRetakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    sessionStorage.removeItem("candidateReferencePhoto");
  }, []);

  const handleAcceptClick = async () => {
    if (!consentChecked || !capturedPhoto) return;
    
    setIsStarting(true);
    setLocalError(null);
    
    // Stop preview if running
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(track => track.stop());
      previewStreamRef.current = null;
      setCameraReady(false);
    }
    
    try {
      const success = await onAccept(capturedPhoto);
      if (!success) {
        setLocalError("Failed to start camera proctoring. Please try again.");
        // Restart preview on failure
        setCapturedPhoto(null);
        startCameraPreview();
      }
    } catch (error) {
      setLocalError("An error occurred. Please try again.");
      // Restart preview on failure
      setCapturedPhoto(null);
      startCameraPreview();
    } finally {
      setIsStarting(false);
    }
  };

  const displayError = cameraError || localError;

  if (!isOpen) return null;

  return (
    <div
      ref={modalContainerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 10000,
        padding: "1rem",
        overflowY: "auto",
        overflowX: "hidden",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-proctor-modal-title"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      
      <div
        ref={modalRef}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "1rem",
          maxWidth: "580px",
          width: "100%",
          margin: "2rem auto",
          padding: "2rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          animation: "cameraModalFadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          style={{
            width: "72px",
            height: "72px",
            backgroundColor: displayError ? "#fef2f2" : "#ecfdf5",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
          }}
        >
          {displayError ? (
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>

        {/* Title */}
        <h2
          id="camera-proctor-modal-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: displayError ? "#dc2626" : "#1e293b",
            textAlign: "center",
            marginBottom: "0.75rem",
          }}
        >
          {displayError ? "Camera Access Required" : "Camera Proctoring"}
        </h2>

        {/* Greeting */}
        {candidateName && !displayError && (
          <p
            style={{
              textAlign: "center",
              color: "#64748b",
              marginBottom: "1rem",
              fontSize: "0.9375rem",
            }}
          >
            Welcome, <strong>{candidateName}</strong>!
          </p>
        )}

        {/* Error message */}
        {displayError && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.5rem",
              padding: "1rem",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            <p style={{ margin: 0, color: "#dc2626", fontSize: "0.875rem", fontWeight: 500 }}>
              {displayError}
            </p>
            <button
              type="button"
              onClick={startCameraPreview}
              style={{
                marginTop: "0.75rem",
                padding: "0.5rem 1rem",
                backgroundColor: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fecaca",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Retry Camera Access
            </button>
          </div>
        )}

        {/* Camera Preview / Captured Photo Display */}
        <div
          style={{
            marginBottom: "1rem",
            borderRadius: "0.75rem",
            overflow: "hidden",
            backgroundColor: "#000",
            aspectRatio: "4/3",
            position: "relative",
            border: capturedPhoto ? "3px solid #10b981" : "3px solid transparent",
          }}
        >
          {/* Loading indicator */}
          {isCameraLoading && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#1e293b",
                zIndex: 1,
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                style={{ animation: "spin 1s linear infinite" }}
              >
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              <p style={{ color: "#94a3b8", marginTop: "0.75rem", fontSize: "0.875rem" }}>
                Initializing camera...
              </p>
            </div>
          )}
          
          {/* Show captured photo if available */}
          {capturedPhoto ? (
            <img
              src={capturedPhoto}
              alt="Captured reference photo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <>
              {/* Video element */}
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                  display: cameraReady ? "block" : "none",
                }}
              />
              
              {/* Placeholder when camera not ready and not loading */}
              {!isCameraLoading && !cameraReady && !displayError && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#1e293b",
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="1.5"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <p style={{ color: "#64748b", marginTop: "0.5rem", fontSize: "0.875rem" }}>
                    Camera preview
                  </p>
                </div>
              )}
            </>
          )}
          
          {/* Captured badge */}
          {capturedPhoto && (
            <div
              style={{
                position: "absolute",
                top: "0.75rem",
                left: "0.75rem",
                backgroundColor: "#10b981",
                color: "#fff",
                padding: "0.375rem 0.75rem",
                borderRadius: "1rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Photo Captured
            </div>
          )}
        </div>

        {/* Capture / Retake Photo Buttons */}
        <div style={{ marginBottom: "1rem" }}>
          {!capturedPhoto ? (
            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={!cameraReady || isCapturing}
              style={{
                width: "100%",
                padding: "0.875rem",
                backgroundColor: cameraReady && !isCapturing ? "#3b82f6" : "#94a3b8",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: cameraReady && !isCapturing ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "background-color 0.2s",
              }}
            >
              {isCapturing ? (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: "spin 1s linear infinite" }}
                  >
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  Capturing...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  📸 Capture Your Photo
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRetakePhoto}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#f1f5f9",
                color: "#475569",
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "background-color 0.2s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Retake Photo
            </button>
          )}
          
          {!capturedPhoto && cameraReady && (
            <p style={{ textAlign: "center", color: "#64748b", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              Position yourself clearly in the frame and click capture
            </p>
          )}
        </div>

        {/* Description */}
        <div
          style={{
            backgroundColor: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "0.5rem",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem", fontWeight: 600, color: "#166534" }}>
            What we monitor:
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem", color: "#14532d", lineHeight: 1.7 }}>
            <li><strong>Face presence:</strong> Ensures you remain visible during the exam</li>
            <li><strong>Multiple faces:</strong> Detects if additional people appear on camera</li>
            <li><strong>Gaze direction:</strong> Monitors if you look away from the screen</li>
            <li><strong>Liveness check:</strong> Basic verification that you&apos;re present (blinks, movement)</li>
          </ul>
        </div>

        {/* Privacy Notice */}
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: "0.5rem",
            padding: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#d97706"
              strokeWidth="2"
              style={{ flexShrink: 0, marginTop: "2px" }}
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div style={{ fontSize: "0.8125rem", color: "#92400e", lineHeight: 1.6 }}>
              <strong>Privacy Notice:</strong> Video processing occurs locally in your browser — no video 
              is streamed to servers. Snapshots are captured <em>only</em> when a violation is detected 
              and are retained according to your organization&apos;s data policy.
            </div>
          </div>
        </div>

        {/* Consent Checkbox */}
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            cursor: "pointer",
            marginBottom: "1.25rem",
            padding: "0.75rem",
            backgroundColor: consentChecked ? "#f0fdf4" : "#f8fafc",
            border: `2px solid ${consentChecked ? "#10b981" : "#e2e8f0"}`,
            borderRadius: "0.5rem",
            transition: "all 0.2s",
          }}
        >
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            style={{
              width: "1.25rem",
              height: "1.25rem",
              marginTop: "2px",
              accentColor: "#10b981",
            }}
          />
          <span style={{ fontSize: "0.875rem", color: "#334155", lineHeight: 1.5 }}>
            I understand that my camera will be used for proctoring purposes and consent to 
            face monitoring during this assessment. I acknowledge that snapshots will be 
            captured only when violations are detected.
          </span>
        </label>

        {/* Action Button - Only Accept */}
        {(() => {
          const canProceed = consentChecked && capturedPhoto && !isStarting && !isLoading;
          return (
            <button
              ref={acceptButtonRef}
              type="button"
              onClick={handleAcceptClick}
              disabled={!canProceed}
              style={{
                width: "100%",
                padding: "0.875rem",
                backgroundColor: canProceed ? "#10b981" : "#94a3b8",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: canProceed ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "background-color 0.2s",
              }}
              onMouseOver={(e) => {
                if (canProceed) {
                  e.currentTarget.style.backgroundColor = "#059669";
                }
              }}
              onMouseOut={(e) => {
                if (canProceed) {
                  e.currentTarget.style.backgroundColor = "#10b981";
                }
              }}
            >
              {isStarting || isLoading ? (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: "spin 1s linear infinite" }}
                  >
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  Starting Proctoring...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Start Assessment
                </>
              )}
            </button>
          );
        })()}

        {/* Helper text */}
        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            fontSize: "0.75rem",
            marginTop: "1rem",
          }}
        >
          {!capturedPhoto 
            ? "📸 Please capture your photo first to continue"
            : !consentChecked 
            ? "☑️ Please check the consent box to continue"
            : "✅ You're ready to start the assessment"
          }
        </p>
      </div>

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes cameraModalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
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
