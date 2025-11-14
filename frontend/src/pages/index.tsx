import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  return (
    <main style={{ backgroundColor: "#f1dcba", minHeight: "100vh", color: "#1a1625" }}>
      <header className="enterprise-header">
        <div className="enterprise-header-content">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginLeft: "-5rem" }}>
            <Image 
              src="/gisullogo.png" 
              alt="Gisul Logo" 
              width={250} 
              height={100} 
              style={{ 
                objectFit: "contain", 
                height: "auto", 
                maxHeight: "100px",
                width: "auto",
                maxWidth: "300px"
              }}
              priority
            />
          </div>
          
        </div>
      </header>

      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "3rem 1rem 2rem",
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
          alignItems: "center",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              lineHeight: 1.1,
              marginBottom: "1.5rem",
              fontWeight: 800,
              color: "#1a1625",
              letterSpacing: "-0.03em",
            }}
          >
            Intelligent hiring for{" "}
            <span style={{ color: "#6953a3" }}>high-performing</span> teams
          </h1>
          <p
            style={{
              color: "#4a4558",
              fontSize: "clamp(1rem, 2vw, 1.125rem)",
              lineHeight: 1.8,
              marginBottom: "2rem",
              maxWidth: "600px",
            }}
          >
            Design AI-powered assessments, generate job-specific topics in seconds, and manage
            candidates in a secure, collaborative workspace. Built for fast-growing organizations
            that demand smarter hiring decisions.
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link href="/auth/signin">
              <button
                className="btn-primary"
                style={{
                  marginTop: 0,
                  padding: "0.875rem 2rem",
                  fontSize: "1rem",
                }}
              >
                Get Started
              </button>
            </Link>
            <Link href="/auth/signin">
              <button
                className="btn-secondary"
                style={{
                  marginTop: 0,
                  padding: "0.875rem 2rem",
                  fontSize: "1rem",
                }}
              >
                Learn More
              </button>
            </Link>
          </div>
        </div>
       
      </section>

     
    </main>
  );
}
