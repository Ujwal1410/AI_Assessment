import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import axios from "axios";

export default function AssessmentDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchAssessment();
    }
  }, [id]);

  const fetchAssessment = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/assessments/get-questions?assessmentId=${id}`);
      if (response.data?.success && response.data?.data) {
        setAssessment(response.data.data);
      }
    } catch (err: any) {
      console.error("Error fetching assessment:", err);
      setError(err.response?.data?.message || err.message || "Failed to load assessment");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "#10b981";
      case "draft":
        return "#f59e0b";
      case "scheduled":
        return "#3b82f6";
      case "active":
        return "#8b5cf6";
      default:
        return "#6b7280";
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ textAlign: "center", color: "#475569" }}>Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="container">
        <div className="card">
          <div className="alert alert-error">{error || "Assessment not found"}</div>
          <Link href="/dashboard">
            <button type="button" className="btn-secondary" style={{ marginTop: "1rem" }}>
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const totalQuestions = assessment.questions?.length || 0;
  const topicsCount = assessment.topics?.length || 0;

  return (
    <div className="container">
      <div className="card">
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/dashboard" style={{ color: "#3b82f6", textDecoration: "none" }}>
            ← Back to Dashboard
          </Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ margin: 0, marginBottom: "0.5rem" }}>{assessment.assessment?.title || "Untitled Assessment"}</h1>
            <p style={{ color: "#475569", margin: 0 }}>{assessment.assessment?.description || "No description"}</p>
          </div>
          <span
            style={{
              backgroundColor: getStatusColor(assessment.assessment?.status || "draft") + "20",
              color: getStatusColor(assessment.assessment?.status || "draft"),
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              fontSize: "0.875rem",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {assessment.assessment?.status || "draft"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
          <div style={{ backgroundColor: "#f8fafc", padding: "1.5rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.125rem" }}>Topics</h3>
            <p style={{ marginTop: "0.5rem", color: "#475569", fontSize: "1.5rem", fontWeight: 600 }}>
              {topicsCount}
            </p>
          </div>
          <div style={{ backgroundColor: "#f8fafc", padding: "1.5rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.125rem" }}>Questions</h3>
            <p style={{ marginTop: "0.5rem", color: "#475569", fontSize: "1.5rem", fontWeight: 600 }}>
              {totalQuestions}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          {assessment.assessment?.status === "draft" && (
            <>
              <Link href={`/assessments/${id}/configure`}>
                <button type="button" className="btn-secondary">
                  Configure Topics
                </button>
              </Link>
              <Link href={`/assessments/${id}/questions`}>
                <button type="button" className="btn-primary">
                  {totalQuestions > 0 ? "View Questions" : "Generate Questions"}
                </button>
              </Link>
            </>
          )}
          {assessment.assessment?.status === "ready" && (
            <Link href={`/assessments/${id}/questions`}>
              <button type="button" className="btn-primary">
                View Questions
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}




