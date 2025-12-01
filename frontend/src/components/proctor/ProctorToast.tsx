import React, { useEffect, useState } from "react";
import type { ProctorViolation } from "@/hooks/useProctor";

interface ProctorToastProps {
  violation: ProctorViolation | null;
  duration?: number;
  onDismiss?: () => void;
}

// Human-readable messages for each event type
const EVENT_MESSAGES: Record<string, string> = {
  TAB_SWITCH: "Tab switch detected — this has been recorded.",
  FOCUS_LOST: "Window focus lost — this has been recorded.",
  FULLSCREEN_EXIT: "Fullscreen exited — this has been recorded.",
  FULLSCREEN_ENABLED: "Fullscreen enabled.",
  FULLSCREEN_REFUSED: "Fullscreen declined — monitoring continues.",
  COPY_RESTRICT: "Copy attempt blocked — this has been recorded.",
  PASTE_ATTEMPT: "Paste attempt blocked — this has been recorded.",
  RIGHT_CLICK: "Right-click blocked — this has been recorded.",
  DEVTOOLS_OPEN: "Developer tools detected — this has been recorded.",
  SCREENSHOT_ATTEMPT: "Screenshot attempt detected — this has been recorded.",
  IDLE: "Idle timeout detected — this has been recorded.",
};

// Colors for different event severity
const getEventSeverity = (eventType: string): "warning" | "error" | "info" => {
  switch (eventType) {
    case "FULLSCREEN_ENABLED":
      return "info";
    case "FOCUS_LOST":
    case "FULLSCREEN_REFUSED":
      return "warning";
    default:
      return "error";
  }
};

const SEVERITY_STYLES = {
  info: {
    background: "#eff6ff",
    border: "#93c5fd",
    text: "#1e40af",
    icon: "#3b82f6",
  },
  warning: {
    background: "#fffbeb",
    border: "#fcd34d",
    text: "#92400e",
    icon: "#f59e0b",
  },
  error: {
    background: "#fef2f2",
    border: "#fca5a5",
    text: "#991b1b",
    icon: "#ef4444",
  },
};

/**
 * Toast notification component that shows when proctoring events occur.
 */
export function ProctorToast({ violation, duration = 4000, onDismiss }: ProctorToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentViolation, setCurrentViolation] = useState<ProctorViolation | null>(null);

  useEffect(() => {
    if (violation) {
      setCurrentViolation(violation);
      setIsVisible(true);

      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [violation, duration, onDismiss]);

  if (!isVisible || !currentViolation) return null;

  const severity = getEventSeverity(currentViolation.eventType);
  const styles = SEVERITY_STYLES[severity];
  const message = EVENT_MESSAGES[currentViolation.eventType] || `${currentViolation.eventType} detected.`;

  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        zIndex: 10001,
        maxWidth: "400px",
        animation: "slideIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          backgroundColor: styles.background,
          border: `1px solid ${styles.border}`,
          borderRadius: "0.75rem",
          padding: "1rem 1.25rem",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        {/* Icon */}
        <div style={{ flexShrink: 0, marginTop: "2px" }}>
          {severity === "info" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={styles.icon} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          ) : severity === "warning" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={styles.icon} strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={styles.icon} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, color: styles.text, fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.5 }}>
            {message}
          </p>
          <p style={{ margin: "0.25rem 0 0", color: styles.text, fontSize: "0.75rem", opacity: 0.8 }}>
            {new Date(currentViolation.timestamp).toLocaleTimeString()}
          </p>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={() => {
            setIsVisible(false);
            onDismiss?.();
          }}
          style={{
            background: "none",
            border: "none",
            padding: "0.25rem",
            cursor: "pointer",
            color: styles.text,
            opacity: 0.6,
            transition: "opacity 0.2s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseOut={(e) => (e.currentTarget.style.opacity = "0.6")}
          aria-label="Dismiss notification"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* CSS for animation */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

export default ProctorToast;

