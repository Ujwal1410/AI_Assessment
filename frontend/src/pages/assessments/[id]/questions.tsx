import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import axios from "axios";

interface Question {
  questionText: string;
  type: string;
  difficulty: string;
  options?: string[];
  correctAnswer?: string;
  idealAnswer?: string;
  expectedLogic?: string;
  topic?: string;
  questionIndex?: number;
}

interface Topic {
  topic: string;
  questions: Question[];
  numQuestions: number;
  questionTypes: string[];
  difficulty: string;
}

export default function QuestionsPage() {
  const router = useRouter();
  const { id } = router.query;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<{ topic: string; index: number } | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);
  const [finalTitle, setFinalTitle] = useState("");
  const [finalDescription, setFinalDescription] = useState("");

  useEffect(() => {
    if (id) {
      fetchQuestions();
    }
  }, [id]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/assessments/get-questions?assessmentId=${id}`);
      if (response.data?.success && response.data?.data) {
        const data = response.data.data;
        // Transform the data into topics with questions
        const topicsMap: { [key: string]: Topic } = {};
        
        if (data.topics && Array.isArray(data.topics)) {
          data.topics.forEach((topic: any) => {
            topicsMap[topic.topic] = {
              topic: topic.topic,
              questions: [],
              numQuestions: topic.numQuestions || 0,
              questionTypes: topic.questionTypes || [],
              difficulty: topic.difficulty || "Medium",
            };
          });
        }

        if (data.questions && Array.isArray(data.questions)) {
          data.questions.forEach((question: any) => {
            const topicName = question.topic;
            if (topicsMap[topicName]) {
              topicsMap[topicName].questions.push(question);
            }
          });
        }

        setTopics(Object.values(topicsMap));
      }
    } catch (err: any) {
      console.error("Error fetching questions:", err);
      setError(err.response?.data?.message || err.message || "Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await axios.post("/api/assessments/generate-questions", {
        assessmentId: id,
      });

      if (response.data?.success) {
        setSuccess("Questions generated successfully!");
        await fetchQuestions();
      } else {
        setError("Failed to generate questions");
      }
    } catch (err: any) {
      console.error("Error generating questions:", err);
      setError(err.response?.data?.message || err.message || "Failed to generate questions");
    } finally {
      setGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (!finalTitle.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await axios.post("/api/assessments/finalize", {
        assessmentId: id,
        title: finalTitle.trim(),
        description: finalDescription.trim() || undefined,
      });

      if (response.data?.success) {
        setSuccess("Assessment finalized successfully!");
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      } else {
        setError("Failed to finalize assessment");
      }
    } catch (err: any) {
      console.error("Error finalizing assessment:", err);
      setError(err.response?.data?.message || err.message || "Failed to finalize assessment");
    } finally {
      setSaving(false);
    }
  };

  const totalQuestions = topics.reduce((sum, topic) => sum + topic.questions.length, 0);
  const hasQuestions = totalQuestions > 0;

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ textAlign: "center", color: "#475569" }}>Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/dashboard" style={{ color: "#3b82f6", textDecoration: "none" }}>
            ← Back to Dashboard
          </Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, marginBottom: "0.5rem" }}>Questions</h1>
            <p style={{ color: "#475569", margin: 0 }}>
              {hasQuestions
                ? `Total: ${totalQuestions} questions across ${topics.length} topics`
                : "Generate questions for your configured topics"}
            </p>
          </div>
          {!hasQuestions && (
            <button
              type="button"
              onClick={handleGenerateQuestions}
              className="btn-primary"
              disabled={generating}
            >
              {generating ? "Generating..." : "Generate Questions"}
            </button>
          )}
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
            {success}
          </div>
        )}

        {!hasQuestions ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <p style={{ color: "#64748b", marginBottom: "2rem" }}>
              No questions generated yet. Click the button above to generate questions using AI.
            </p>
          </div>
        ) : (
          <>
            {topics.map((topic) => (
              <div
                key={topic.topic}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  padding: "1.5rem",
                  marginBottom: "2rem",
                  backgroundColor: "#ffffff",
                }}
              >
                <h2 style={{ margin: 0, marginBottom: "1rem", color: "#0f172a", fontSize: "1.25rem" }}>
                  {topic.topic}
                </h2>
                <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                  {topic.questions.length} question{topic.questions.length !== 1 ? "s" : ""} • Difficulty: {topic.difficulty}
                </p>

                {topic.questions.map((question, qIndex) => (
                  <div
                    key={qIndex}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "0.5rem",
                      padding: "1.25rem",
                      marginBottom: "1rem",
                      backgroundColor: "#f8fafc",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span
                          style={{
                            backgroundColor: "#3b82f6",
                            color: "#ffffff",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          Q{qIndex + 1}
                        </span>
                        <span
                          style={{
                            backgroundColor: "#e2e8f0",
                            color: "#475569",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            textTransform: "uppercase",
                          }}
                        >
                          {question.type}
                        </span>
                        <span
                          style={{
                            backgroundColor: question.difficulty === "Hard" ? "#fee2e2" : question.difficulty === "Medium" ? "#fef3c7" : "#d1fae5",
                            color: question.difficulty === "Hard" ? "#991b1b" : question.difficulty === "Medium" ? "#92400e" : "#065f46",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {question.difficulty}
                        </span>
                      </div>
                    </div>

                    <p style={{ color: "#1e293b", marginBottom: "1rem", lineHeight: 1.6, fontWeight: 500 }}>
                      {question.questionText}
                    </p>

                    {question.type === "MCQ" && question.options && (
                      <div style={{ marginBottom: "1rem" }}>
                        <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>
                          Options:
                        </p>
                        <ul style={{ margin: 0, paddingLeft: "1.5rem", color: "#64748b" }}>
                          {question.options.map((option, optIndex) => (
                            <li key={optIndex} style={{ marginBottom: "0.25rem" }}>
                              {option}
                              {question.correctAnswer === option && (
                                <span style={{ color: "#10b981", marginLeft: "0.5rem", fontWeight: 600 }}>✓ Correct</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(question.type === "Subjective" || question.type === "Descriptive" || question.type === "Pseudo Code") &&
                      question.idealAnswer && (
                        <div style={{ marginBottom: "1rem" }}>
                          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>
                            Ideal Answer:
                          </p>
                          <p style={{ color: "#64748b", backgroundColor: "#ffffff", padding: "0.75rem", borderRadius: "0.5rem", margin: 0 }}>
                            {question.idealAnswer}
                          </p>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            ))}

            <div style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid #e2e8f0" }}>
              {!showFinalize ? (
                <button
                  type="button"
                  onClick={() => setShowFinalize(true)}
                  className="btn-primary"
                  style={{ fontSize: "1rem", padding: "0.75rem 2rem" }}
                >
                  Finalize Assessment
                </button>
              ) : (
                <div style={{ backgroundColor: "#f8fafc", padding: "1.5rem", borderRadius: "0.75rem" }}>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1.125rem" }}>Finalize Assessment</h3>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
                      Title *
                    </label>
                    <input
                      type="text"
                      value={finalTitle}
                      onChange={(e) => setFinalTitle(e.target.value)}
                      placeholder="Enter assessment title"
                      required
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.5rem",
                        fontSize: "1rem",
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
                      Description
                    </label>
                    <textarea
                      value={finalDescription}
                      onChange={(e) => setFinalDescription(e.target.value)}
                      placeholder="Enter assessment description (optional)"
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.5rem",
                        fontSize: "1rem",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button
                      type="button"
                      onClick={handleFinalize}
                      className="btn-primary"
                      disabled={saving || !finalTitle.trim()}
                    >
                      {saving ? "Finalizing..." : "Finalize & Complete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFinalize(false)}
                      className="btn-secondary"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}




