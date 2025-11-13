import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import axios from "axios";

const EXPERIENCE_LEVELS = ["0-2 years", "2-5 years", "5-10 years", "10+ years"];

export default function CreateAssessmentPage() {
  const router = useRouter();
  const [jobRole, setJobRole] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [currentSkill, setCurrentSkill] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSkill = () => {
    if (currentSkill.trim() && !skills.includes(currentSkill.trim())) {
      setSkills([...skills, currentSkill.trim()]);
      setCurrentSkill("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((skill) => skill !== skillToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSkill();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!jobRole.trim()) {
      setError("Job role is required");
      return;
    }
    if (!experience) {
      setError("Experience level is required");
      return;
    }
    if (skills.length === 0) {
      setError("At least one skill is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post("/api/assessments/generate-topics", {
        jobRole: jobRole.trim(),
        experience,
        skills,
      });

      if (response.data?.success && response.data?.data) {
        const assessmentId = response.data.data._id || response.data.data.id;
        router.push(`/assessments/${assessmentId}/configure`);
      } else {
        setError("Failed to generate topics. Please try again.");
      }
    } catch (err: any) {
      console.error("Error generating topics:", err);
      setError(err.response?.data?.message || err.message || "Failed to generate topics. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/dashboard" style={{ color: "#3b82f6", textDecoration: "none" }}>
            ← Back to Dashboard
          </Link>
        </div>

        <h1 style={{ marginBottom: "0.5rem" }}>Create New Assessment</h1>
        <p style={{ color: "#475569", marginBottom: "2rem" }}>
          Enter the job details below. Our AI will generate relevant technical topics for your assessment.
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="jobRole" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
              Job Role *
            </label>
            <input
              id="jobRole"
              type="text"
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              placeholder="e.g., Python Developer, Frontend Engineer, Data Scientist"
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
            <label htmlFor="experience" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
              Experience Level *
            </label>
            <select
              id="experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
                fontSize: "1rem",
                backgroundColor: "#ffffff",
              }}
            >
              <option value="">Select experience level</option>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="skills" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500, color: "#1e293b" }}>
              Key Skills * (Add at least one skill)
            </label>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input
                id="skills"
                type="text"
                value={currentSkill}
                onChange={(e) => setCurrentSkill(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., Python, React, MongoDB"
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                  fontSize: "1rem",
                }}
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="btn-secondary"
                disabled={!currentSkill.trim()}
              >
                Add
              </button>
            </div>
            {skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {skills.map((skill) => (
                  <span
                    key={skill}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      backgroundColor: "#eff6ff",
                      color: "#1e40af",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#1e40af",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: "1.125rem",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !jobRole.trim() || !experience || skills.length === 0}
            >
              {loading ? "Generating Topics..." : "Generate Topics"}
            </button>
            <Link href="/dashboard">
              <button type="button" className="btn-secondary">
                Cancel
              </button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}




