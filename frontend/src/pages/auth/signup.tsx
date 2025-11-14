import { useState, useEffect } from "react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import axios from "axios";
import { getProviders, signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import fastApiClient from "../../lib/fastapi";

interface StatusMessage {
  type: "success" | "error";
  text: string;
}

interface SignupPageProps {
  providers: Awaited<ReturnType<typeof getProviders>>;
}

// Google Logo SVG
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" fillRule="evenodd">
      <path
        d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"
        fill="#EA4335"
      />
      <path
        d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.21 1.18-.84 2.08-1.79 2.71l2.85 2.2c2.01-1.86 3.17-4.57 3.17-7.41z"
        fill="#4285F4"
      />
      <path
        d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"
        fill="#FBBC05"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.85-2.2c-.76.53-1.78.9-3.11.9-2.38 0-4.4-1.57-5.12-3.74L.96 13.04C2.45 15.98 5.48 18 9 18z"
        fill="#34A853"
      />
    </g>
  </svg>
);

// Microsoft Logo SVG
const MicrosoftLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path fill="#F25022" d="M0 0h8.4v8.4H0z" />
    <path fill="#00A4EF" d="M9.6 0H18v8.4H9.6z" />
    <path fill="#7FBA00" d="M0 9.6h8.4V18H0z" />
    <path fill="#FFB900" d="M9.6 9.6H18V18H9.6z" />
  </svg>
);

export default function SignupPage({ providers }: SignupPageProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [codeExpired, setCodeExpired] = useState(false);

  const googleProvider = providers ? providers["google"] : undefined;
  const microsoftProvider = providers ? providers["azure-ad"] ?? providers["azuread"] : undefined;

  const showMessage = (type: StatusMessage["type"], text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  // Countdown timer effect
  useEffect(() => {
    if (!showVerification || timeRemaining === null) return;

    if (timeRemaining <= 0) {
      setCodeExpired(true);
      setTimeRemaining(0);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          setCodeExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showVerification, timeRemaining]);

  const handleSendVerificationCode = async () => {
    setSendingCode(true);
    setMessage(null);
    setCodeExpired(false);
    try {
      const response = await axios.post("/api/auth/send-verification-code", { email });
      setMessage({ type: "success", text: "Verification code sent successfully" });
      setTimeRemaining(60);
    } catch (err: any) {
      console.error("Error sending verification code:", err);
      const errorMessage = err.response?.data?.message || err.message || "Failed to send verification code";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length < 4) {
      setMessage({ type: "error", text: "Please enter a valid 6-digit verification code" });
      return;
    }

    if (codeExpired) {
      setMessage({ type: "error", text: "Verification code has expired. Please request a new code." });
      return;
    }

    setVerifyingCode(true);
    setMessage(null);
    try {
      await axios.post("/api/auth/verify-email-code", {
        email,
        code: verificationCode,
      });
      setMessage({ type: "success", text: "Email verified successfully! Redirecting to sign in..." });
      setTimeout(() => {
        router.push("/auth/signin");
      }, 1500);
    } catch (err: any) {
      let errorMessage = err.response?.data?.message || err.message || "Invalid verification code";
      
      if (errorMessage.toLowerCase().includes("expired") && !errorMessage.toLowerCase().includes("invalid")) {
        errorMessage = "Verification code has expired. Please request a new code.";
        setCodeExpired(true);
      } else if (errorMessage.includes("Invalid") || errorMessage.includes("invalid") || errorMessage.includes("incorrect")) {
        errorMessage = "Invalid verification code. Please check and try again.";
      } else if (errorMessage.includes("not found") || errorMessage.includes("User not found")) {
        errorMessage = "User not found. Please sign up again.";
      }
      
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setVerifyingCode(false);
    }
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      showMessage("error", "Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      const { data } = await axios.post("/api/auth/signup", {
        name,
        email,
        password,
      });
      setShowVerification(true);
      setMessage({
        type: "success",
        text: "Please check your email for verification code.",
      });
      setTimeRemaining(60);
      setCodeExpired(false);
    } catch (error: any) {
      showMessage("error", error?.response?.data?.message ?? error?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#f1dcba",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
       

        <div className="card" style={{ padding: "1rem", maxHeight: "calc(100vh - 2rem)", overflowY: "auto" }}>
          {!showVerification ? (
            <>
              <form onSubmit={onSubmit} style={{ margin: 0 }}>
                <label htmlFor="name" style={{ fontSize: "0.8125rem", marginTop: 0, marginBottom: "0.25rem" }}>
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  style={{ marginBottom: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                />

                <label htmlFor="email" style={{ fontSize: "0.8125rem", marginTop: 0, marginBottom: "0.25rem" }}>
                  Work Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  style={{ marginBottom: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                />

                <label htmlFor="password" style={{ fontSize: "0.8125rem", marginTop: 0, marginBottom: "0.25rem" }}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ marginBottom: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                />

                <label htmlFor="confirmPassword" style={{ fontSize: "0.8125rem", marginTop: 0, marginBottom: "0.25rem" }}>
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={{ marginBottom: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}
                />

                {message && (
                  <div
                    className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
                    style={{ marginTop: "0.5rem", marginBottom: "0.5rem", padding: "0.5rem", fontSize: "0.8125rem" }}
                  >
                    {message.text}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ width: "100%", marginTop: "0.25rem", padding: "0.625rem", fontSize: "0.875rem" }}
                >
                  {loading ? "Submitting..." : "Sign Up"}
                </button>
              </form>

              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e8e0d0" }}>
                <p style={{ color: "#6b6678", marginBottom: "0.5rem", fontSize: "0.8125rem", textAlign: "center" }}>
                  Or continue with
                </p>
                <div style={{ display: "flex", gap: "0.5rem", flexDirection: "column" }}>
                  {googleProvider && (
                    <button
                      type="button"
                      onClick={() => signIn("google")}
                      style={{
                        width: "100%",
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.8125rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        backgroundColor: "#ffffff",
                        color: "#1a1625",
                        border: "1px solid #e8e0d0",
                        borderRadius: "0.5rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f8f8f8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                      }}
                    >
                      <GoogleLogo />
                      Continue with Google
                    </button>
                  )}
                  {microsoftProvider && (
                    <button
                      type="button"
                      onClick={() => signIn(microsoftProvider.id)}
                      style={{
                        width: "100%",
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.8125rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        backgroundColor: "#ffffff",
                        color: "#1a1625",
                        border: "1px solid #e8e0d0",
                        borderRadius: "0.5rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f8f8f8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                      }}
                    >
                      <MicrosoftLogo />
                      Continue with Microsoft
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div>
              <h2 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.125rem", fontWeight: 600 }}>
                Email Verification Required
              </h2>
              <p style={{ color: "#6b6678", marginBottom: "0.75rem", fontSize: "0.8125rem" }}>
                We&apos;ve sent a verification code to <strong>{email}</strong>. Please enter the code below.
              </p>

              <label htmlFor="verificationCode" style={{ fontSize: "0.8125rem", marginTop: 0, marginBottom: "0.25rem" }}>
                Verification Code
              </label>
              <input
                id="verificationCode"
                type="text"
                required
                maxLength={10}
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(event) => {
                  setVerificationCode(event.target.value.replace(/\D/g, ""));
                  if (codeExpired) {
                    setCodeExpired(false);
                  }
                }}
                style={{
                  textAlign: "center",
                  fontSize: "1rem",
                  letterSpacing: "0.5rem",
                  marginBottom: "0.5rem",
                  padding: "0.5rem 0.75rem",
                }}
              />

              {timeRemaining !== null && (
                <div style={{ marginTop: "0.25rem", textAlign: "center", marginBottom: "0.5rem" }}>
                  {codeExpired ? (
                    <p style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 500 }}>
                      Code expired. Please request a new code.
                    </p>
                  ) : (
                    <p style={{ color: "#6b6678", fontSize: "0.75rem" }}>
                      Code expires in{" "}
                      <strong style={{ color: timeRemaining < 60 ? "#ef4444" : "#6953a3" }}>
                        {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
                      </strong>
                    </p>
                  )}
                </div>
              )}

              {message && (
                <div
                  className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
                  style={{ marginTop: "0.5rem", marginBottom: "0.5rem", padding: "0.5rem", fontSize: "0.8125rem" }}
                >
                  {message.text}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleVerifyCode}
                  disabled={verifyingCode || !verificationCode}
                  style={{ flex: 1, padding: "0.625rem", fontSize: "0.875rem" }}
                >
                  {verifyingCode ? "Verifying..." : "Verify Code"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSendVerificationCode}
                  disabled={sendingCode}
                  style={{ padding: "0.625rem", fontSize: "0.875rem" }}
                >
                  {sendingCode ? "Sending..." : "Resend"}
                </button>
              </div>
            </div>
          )}
        </div>

        {!showVerification && (
          <div style={{ marginTop: "0.75rem", textAlign: "center", color: "#6b6678" }}>
            <p style={{ fontSize: "0.8125rem", margin: 0 }}>
              Already have an account?{" "}
              <Link href="/auth/signin" style={{ color: "#6953a3", fontWeight: 600 }}>
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<SignupPageProps> = async () => {
  const providers = await getProviders();
  return {
    props: {
      providers,
    },
  };
};
