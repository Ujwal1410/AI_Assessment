import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import axios from "axios";

interface Assessment {
  id: string;
  title: string;
  status: string;
  hasSchedule: boolean;
  scheduleStatus?: {
    startTime?: string;
    endTime?: string;
    duration?: number;
    isActive?: boolean;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = (session?.user as any)?.role ?? "unknown";
  const isOrgAdmin = role === "org_admin";

  useEffect(() => {
    fetchAssessments();
  }, []);

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get("/api/assessments/list");
      if (response.data?.success && response.data?.data) {
        setAssessments(response.data.data);
      }
    } catch (err: any) {
      console.error("Error fetching assessments:", err);
      setError(err.response?.data?.message || err.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAssessment = async (assessmentId: string, assessmentTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${assessmentTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      const response = await axios.delete(`/api/assessments/delete-assessment?assessmentId=${assessmentId}`);
      
      if (response.data?.success) {
        // Remove the assessment from the list
        setAssessments(assessments.filter((a) => a.id !== assessmentId));
      } else {
        setError(response.data?.message || "Failed to delete assessment");
      }
    } catch (err: any) {
      console.error("Error deleting assessment:", err);
      setError(err.response?.data?.message || err.message || "Failed to delete assessment");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "#10b981"; // green
      case "draft":
        return "#f59e0b"; // amber
      case "scheduled":
        return "#3b82f6"; // blue
      case "active":
        return "#8b5cf6"; // purple
      default:
        return "#6b7280"; // gray
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: "2rem", position: "relative", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          className="btn-secondary"
          style={{ position: "absolute", top: "1.5rem", right: "1.5rem" }}
        >
          Sign Out
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h1 style={{ margin: 0 }}>Assessments</h1>
            <p style={{ color: "#475569", marginTop: "0.5rem", marginBottom: 0 }}>
              You are signed in as <strong>{session?.user?.email}</strong> with role <strong>{role}</strong>.
            </p>
          </div>
          <Link href="/assessments/create">
            <button type="button" className="btn-primary">
              + Create New Assessment
            </button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <p style={{ textAlign: "center", color: "#475569" }}>Loading assessments...</p>
        </div>
      ) : error ? (
        <div className="card">
          <div className="alert alert-error">{error}</div>
          <button type="button" className="btn-primary" onClick={fetchAssessments} style={{ marginTop: "1rem" }}>
            Retry
          </button>
        </div>
      ) : assessments.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <h2 style={{ color: "#1e293b", marginBottom: "1rem" }}>No assessments yet</h2>
            <p style={{ color: "#475569", marginBottom: "2rem" }}>
              Create your first assessment to get started with AI-powered topic and question generation.
            </p>
            <Link href="/assessments/create">
              <button type="button" className="btn-primary">
                Create Your First Assessment
              </button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2 style={{ marginBottom: "1.5rem" }}>Your Assessments ({assessments.length})</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {assessments.map((assessment) => (
              <div
                key={assessment.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  padding: "1.5rem",
                  backgroundColor: "#ffffff",
                  transition: "box-shadow 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
                onClick={() => router.push(`/assessments/${assessment.id}`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem" }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.125rem" }}>{assessment.title}</h3>
                  <span
                    style={{
                      backgroundColor: getStatusColor(assessment.status) + "20",
                      color: getStatusColor(assessment.status),
                      padding: "0.25rem 0.75rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {assessment.status}
                  </span>
                </div>
                <div style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  Created: {formatDate(assessment.createdAt)}
                </div>
                {assessment.hasSchedule && assessment.scheduleStatus && (
                  <div style={{ color: "#64748b", fontSize: "0.875rem" }}>
                    {assessment.scheduleStatus.isActive ? "🟢 Active" : "⏸️ Scheduled"}
                  </div>
                )}
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/assessments/${assessment.id}`);
                    }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    style={{
                      fontSize: "0.875rem",
                      padding: "0.5rem 1rem",
                      backgroundColor: "#ef4444",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#dc2626";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#ef4444";
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAssessment(assessment.id, assessment.title);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
