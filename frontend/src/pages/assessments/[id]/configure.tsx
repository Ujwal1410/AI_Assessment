import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import axios from "axios";

const QUESTION_TYPES = ["MCQ", "Subjective", "Pseudo Code", "Descriptive", "Aptitude", "Reasoning"];
const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"];

interface Topic {
  topic: string;
  numQuestions: number;
  questionTypes: string[];
  difficulty: string;
  source: string;
  questions: any[];
  questionConfigs: any[];
}

export default function ConfigureTopicsPage() {
  const router = useRouter();
  const { id } = router.query;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");

  useEffect(() => {
    if (id) {
      fetchTopics();
    }
  }, [id]);

  const fetchTopics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/assessments/get-topics?assessmentId=${id}`);
      if (response.data?.success && response.data?.data) {
        setTopics(response.data.data);
      }
    } catch (err: any) {
      console.error("Error fetching topics:", err);
      setError(err.response?.data?.message || err.message || "Failed to load topics");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTopic = (index: number, field: string, value: any) => {
    const updatedTopics = [...topics];
    updatedTopics[index] = { ...updatedTopics[index], [field]: value };
    setTopics(updatedTopics);
  };

  const handleToggleQuestionType = (topicIndex: number, questionType: string) => {
    const topic = topics[topicIndex];
    const currentTypes = topic.questionTypes || [];
    const newTypes = currentTypes.includes(questionType)
      ? currentTypes.filter((t) => t !== questionType)
      : [...currentTypes, questionType];
    handleUpdateTopic(topicIndex, "questionTypes", newTypes);
  };

  const handleAddCustomTopic = async () => {
    if (!newTopic.trim()) return;

    try {
      const response = await axios.post("/api/assessments/add-topic", {
        assessmentId: id,
        newTopics: [newTopic.trim()],
      });

      if (response.data?.success && response.data?.data) {
        setTopics(response.data.data);
        setNewTopic("");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to add topic");
    }
  };

  const handleRemoveTopic = async (topicName: string) => {
    if (!confirm(`Are you sure you want to remove "${topicName}"?`)) return;

    try {
      const response = await axios.delete("/api/assessments/remove-topic", {
        data: {
          assessmentId: id,
          topicsToRemove: [topicName],
        },
      });

      if (response.data?.success && response.data?.data) {
        setTopics(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to remove topic");
    }
  };

  const handleSaveAndContinue = async () => {
    // Validate that at least one topic has questions configured
    const validTopics = topics.filter(
      (t) => t.numQuestions > 0 && t.questionTypes && t.questionTypes.length > 0
    );

    if (validTopics.length === 0) {
      setError("Please configure at least one topic with questions and question types");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updatedTopics = topics.map((topic) => ({
        topic: topic.topic,
        numQuestions: topic.numQuestions,
        questionTypes: topic.questionTypes || [],
        difficulty: topic.difficulty,
      }));

      const response = await axios.post("/api/assessments/update-topics", {
        assessmentId: id,
        updatedTopics,
      });

      if (response.data?.success) {
        router.push(`/assessments/${id}/questions`);
      } else {
        setError("Failed to save topic configuration");
      }
    } catch (err: any) {
      console.error("Error updating topics:", err);
      setError(err.response?.data?.message || err.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p style={{ textAlign: "center", color: "#475569" }}>Loading topics...</p>
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

        <h1 style={{ marginBottom: "0.5rem" }}>Configure Topics</h1>
        <p style={{ color: "#475569", marginBottom: "2rem" }}>
          Configure the number of questions, question types, and difficulty for each topic. You can also add custom topics.
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}

        {/* Add Custom Topic */}
        <div style={{ marginBottom: "2rem", padding: "1.5rem", backgroundColor: "#f8fafc", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "1rem", fontSize: "1.125rem" }}>Add Custom Topic</h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomTopic();
                }
              }}
              placeholder="Enter topic name"
              style={{
                flex: 1,
                padding: "0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
                fontSize: "1rem",
              }}
            />
            <button type="button" onClick={handleAddCustomTopic} className="btn-secondary" disabled={!newTopic.trim()}>
              Add Topic
            </button>
          </div>
        </div>

        {/* Topics List */}
        <div style={{ marginBottom: "2rem" }}>
          {topics.length === 0 ? (
            <p style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No topics available</p>
          ) : (
            topics.map((topic, index) => (
              <div
                key={topic.topic}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                  backgroundColor: "#ffffff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem" }}>
                  <div>
                    <h3 style={{ margin: 0, color: "#0f172a", fontSize: "1.125rem" }}>{topic.topic}</h3>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        marginTop: "0.25rem",
                        display: "inline-block",
                      }}
                    >
                      Source: {topic.source}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTopic(topic.topic)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
                      Number of Questions
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={topic.numQuestions || 0}
                      onChange={(e) => handleUpdateTopic(index, "numQuestions", parseInt(e.target.value) || 0)}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.5rem",
                        fontSize: "1rem",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
                      Difficulty
                    </label>
                    <select
                      value={topic.difficulty || "Medium"}
                      onChange={(e) => handleUpdateTopic(index, "difficulty", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.5rem",
                        fontSize: "1rem",
                        backgroundColor: "#ffffff",
                      }}
                    >
                      {DIFFICULTY_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
                    Question Types
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {QUESTION_TYPES.map((type) => {
                      const isSelected = (topic.questionTypes || []).includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleToggleQuestionType(index, type)}
                          style={{
                            padding: "0.5rem 1rem",
                            border: `1px solid ${isSelected ? "#3b82f6" : "#e2e8f0"}`,
                            borderRadius: "0.5rem",
                            backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                            color: isSelected ? "#1e40af" : "#475569",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
          <button
            type="button"
            onClick={handleSaveAndContinue}
            className="btn-primary"
            disabled={saving || topics.length === 0}
          >
            {saving ? "Saving..." : "Save & Generate Questions"}
          </button>
          <Link href="/dashboard">
            <button type="button" className="btn-secondary">
              Cancel
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}




