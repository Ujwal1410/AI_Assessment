import { useState, useEffect } from "react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { getProviders, signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import axios from "axios";

interface SignInPageProps {
  providers: Awaited<ReturnType<typeof getProviders>>;
}

export default function SignInPage({ providers }: SignInPageProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"org_admin" | "editor" | "viewer">("org_admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [codeExpired, setCodeExpired] = useState(false);

  const googleProvider = providers ? providers["google"] : undefined;
  const microsoftProvider = providers ? providers["azure-ad"] ?? providers["azuread"] : undefined;
  const callbackUrl = (router.query.callbackUrl as string) ?? "/dashboard";

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
    setError(null);
    setCodeExpired(false);
    try {
      await axios.post("/api/auth/send-verification-code", { email });
      setError(null);
      setTimeRemaining(60);
    } catch (err: any) {
      let errorMessage = err.response?.data?.message || err.message || "Failed to send verification code";
      setError(errorMessage);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length < 4) {
      setError("Please enter a valid 6-digit verification code");
      return;
    }

    if (codeExpired) {
      setError("Verification code has expired. Please request a new code.");
      return;
    }

    setVerifyingCode(true);
    setError(null);
    try {
      await axios.post("/api/auth/verify-email-code", {
        email,
        code: verificationCode,
      });
      // Code verified, try signing in again
      setShowVerification(false);
      await handleSubmitAfterVerification();
    } catch (err: any) {
      let errorMessage = err.response?.data?.message || err.message || "Invalid verification code";
      
      // Only set codeExpired if the error explicitly says "expired"
      if (errorMessage.toLowerCase().includes("expired") && !errorMessage.toLowerCase().includes("invalid")) {
        errorMessage = "Verification code has expired. Please request a new code.";
        setCodeExpired(true);
      } else if (errorMessage.includes("Invalid") || errorMessage.includes("invalid") || errorMessage.includes("incorrect")) {
        errorMessage = "Invalid verification code. Please check and try again.";
        // Don't set codeExpired for invalid codes - only for expired codes
      } else if (errorMessage.includes("not found") || errorMessage.includes("User not found")) {
        errorMessage = "User not found. Please sign up first.";
      }
      
      setError(errorMessage);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSubmitAfterVerification = async () => {
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl,
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push(result?.url ?? callbackUrl);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl,
    });

    setLoading(false);

    if (result?.error) {
      // Check if error is about email verification
      if (result.error.includes("Email not verified") || result.error.includes("email verification")) {
        setShowVerification(true);
        setTimeRemaining(60);
        setCodeExpired(false);
        // Automatically send verification code
        await handleSendVerificationCode();
      } else {
        setError(result.error);
      }
      return;
    }

    router.push(result?.url ?? callbackUrl);
  };

  return (
    <div className="container" style={{ maxWidth: "480px" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <Image src="/logo.svg" alt="AI Assessment" width={72} height={72} />
        <h1>Welcome Back</h1>
        <p style={{ color: "#475569" }}>Sign in with your organization credentials.</p>
      </div>

      <div className="card">
        {!showVerification ? (
          <form onSubmit={handleSubmit}>
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value as "org_admin" | "editor" | "viewer")}
            >
              <option value="org_admin">Organization Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>

            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>Email Verification Required</h2>
            <p style={{ color: "#475569", marginBottom: "1.5rem" }}>
              We&apos;ve sent a verification code to <strong>{email}</strong>. Please enter the code below to verify your email.
            </p>

            <label htmlFor="verificationCode">Verification Code</label>
            <input
              id="verificationCode"
              type="text"
              required
              maxLength={10}
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(event) => {
                setVerificationCode(event.target.value.replace(/\D/g, ""));
                // Reset codeExpired when user starts typing a new code
                if (codeExpired) {
                  setCodeExpired(false);
                }
              }}
              style={{ textAlign: "center", fontSize: "1.25rem", letterSpacing: "0.5rem" }}
            />
            
            {timeRemaining !== null && (
              <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
                {codeExpired ? (
                  <p style={{ color: "#ef4444", fontSize: "0.875rem", fontWeight: 500 }}>
                    Code expired. Please request a new code.
                  </p>
                ) : (
                  <p style={{ color: "#475569", fontSize: "0.875rem" }}>
                    Code expires in{" "}
                    <strong style={{ color: timeRemaining < 60 ? "#ef4444" : "#2563eb" }}>
                      {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
                    </strong>
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="alert alert-error" role="alert" style={{ marginTop: "1rem" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleVerifyCode}
                disabled={verifyingCode || !verificationCode}
                style={{ flex: 1 }}
              >
                {verifyingCode ? "Verifying..." : "Verify Code"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSendVerificationCode}
                disabled={sendingCode}
              >
                {sendingCode ? "Sending..." : "Resend Code"}
              </button>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowVerification(false);
                setVerificationCode("");
                setError(null);
              }}
              style={{ width: "100%", marginTop: "0.75rem" }}
            >
              Back to Sign In
            </button>
          </div>
        )}

        {role === "org_admin" && (
          <div style={{ marginTop: "1.5rem" }}>
            <p style={{ color: "#475569", marginBottom: "0.75rem" }}>Or continue with</p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {googleProvider && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: "1 1 200px" }}
                  onClick={() => signIn("google", { callbackUrl })}
                >
                  Continue with Google
                </button>
              )}
              {microsoftProvider && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: "1 1 200px" }}
                  onClick={() => signIn(microsoftProvider.id, { callbackUrl })}
                >
                  Continue with Microsoft
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {role === "org_admin" && (
        <div style={{ marginTop: "1.5rem", textAlign: "center", color: "#475569" }}>
          <p>
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" style={{ color: "#2563EB", fontWeight: 600 }}>
              Sign up
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<SignInPageProps> = async () => {
  const providers = await getProviders();
  return {
    props: {
      providers,
    },
  };
};
