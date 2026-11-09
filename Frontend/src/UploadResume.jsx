import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

function UploadResume() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resumeId, setResumeId] = useState(null);
  const [rewrittenVersion, setRewrittenVersion] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // =========================
  // TARGET JOB ROLE
  // =========================

  const [targetRole, setTargetRole] = useState("");

  // =========================
  // FILE HANDLING
  // =========================

  const handleFile = (selectedFile) => {
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB.");
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setResumeId(null);
    setRewrittenVersion(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];

    if (droppedFile) {
      handleFile(droppedFile);
    }
  };

  // =========================
  // ANALYZE RESUME
  // =========================

  const handleAnalyze = async () => {
    if (!file) {
      alert("Please upload your resume first.");
      return;
    }

    if (!targetRole.trim()) {
      alert("Please enter the job role you are applying for.");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      document
        .getElementById("upload-analysis-loader")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
    }, 100);

    try {
      // =========================
      // STEP 1: UPLOAD
      // =========================

      const formData = new FormData();

      formData.append("file", file);

      const uploadResponse = await fetch(
        "http://localhost:5000/api/resumes",
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      const uploadData = await uploadResponse.json();

      console.log("UPLOAD RESPONSE:", uploadData);

      if (!uploadResponse.ok) {
        throw new Error(
          uploadData?.error?.message ||
            "Resume upload failed"
        );
      }

      const uploadedResumeId =
        uploadData?.resume?._id;

      const versionId =
        uploadData?.version?._id;

      if (!uploadedResumeId || !versionId) {
        throw new Error(
          "Resume upload succeeded, but resume information was not returned."
        );
      }

      setResumeId(uploadedResumeId);

      console.log(
        "Resume ID:",
        uploadedResumeId
      );

      console.log(
        "Version ID:",
        versionId
      );

      console.log(
        "Target Role:",
        targetRole.trim()
      );

      // =========================
      // STEP 2: ANALYZE
      // =========================

      const analysisResponse = await fetch(
        `http://localhost:5000/api/resumes/${uploadedResumeId}/analyze`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            versionId: versionId,
            targetRole: targetRole.trim(),
          }),
        }
      );

      const analysisData =
        await analysisResponse.json();

      console.log(
        "ANALYSIS RESPONSE:",
        analysisData
      );

      if (!analysisResponse.ok) {
        console.error(
          "ANALYSIS ERROR DETAILS:",
          analysisData
        );

        throw new Error(
          analysisData?.error?.message ||
            "Resume analysis failed"
        );
      }

      setResult(analysisData);

      // =========================
      // SCROLL TO RESULT
      // =========================

      setTimeout(() => {
        document
          .getElementById("upload-analysis-result")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 200);

    } catch (error) {
      console.error(
        "Resume analysis error:",
        error
      );

      alert(
        error.message ||
          "Failed to analyze resume."
      );

    } finally {
      setLoading(false);
    }
  };

  // =========================
  // DOWNLOAD REWRITTEN RESUME
  // =========================

  const handleDownloadRewrittenResume = async () => {
    if (!resumeId || !rewrittenVersion?._id) {
      alert(
        "Rewritten resume is not available yet."
      );
      return;
    }

    try {
      setDownloading(true);

      const response = await fetch(
        `http://localhost:5000/api/resumes/${resumeId}/versions/${rewrittenVersion._id}/pdf`,
        {
          method: "GET",

          credentials: "include",

          headers: {
            Accept: "application/pdf",
          },
        }
      );

      if (!response.ok) {
        const errorData =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          errorData?.error?.message ||
            "Failed to download rewritten resume."
        );
      }

      const blob =
        await response.blob();

      const url =
        window.URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        `${rewrittenVersion.label || "AI-Rewritten-Resume"}.pdf`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error(
        "Download rewritten resume error:",
        error
      );

      alert(
        error.message ||
          "Failed to download rewritten resume."
      );

    } finally {
      setDownloading(false);
    }
  };

  // =========================
  // AI REWRITE
  // =========================

  const handleAIRewrite = async () => {
    if (!resumeId) {
      alert(
        "Resume information is missing. Please analyze your resume again."
      );
      return;
    }

    if (!result?.analysis?._id) {
      alert(
        "Analysis information is missing. Please analyze your resume again."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:5000/api/resumes/${resumeId}/rewrite`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            analysisId:
              result.analysis._id,
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        "AI REWRITE RESPONSE:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
            "AI rewrite failed."
        );
      }

      const appliedCount =
        data.appliedCount ??
        data.rewrites?.length ??
        data.version?.parsedSections?.experience?.reduce(
          (total, job) =>
            total +
            (job.bullets?.length || 0),
          0
        ) ??
        0;

      alert(
        `AI rewrite completed! ${appliedCount} improvements applied.`
      );

      console.log(
        "NEW RESUME VERSION:",
        data.version
      );

      setRewrittenVersion(
        data.version
      );

    } catch (error) {
      console.error(
        "AI rewrite error:",
        error
      );

      alert(
        error.message ||
          "Failed to rewrite your resume."
      );

    } finally {
      setLoading(false);
    }
  };

  // =========================
  // SCORE HELPERS
  // =========================

  const getScoreTitle = (score) => {
    if (score >= 85) {
      return "Excellent Resume";
    }

    if (score >= 70) {
      return "Good Resume";
    }

    if (score >= 50) {
      return "Needs Improvement";
    }

    return "Needs Work";
  };

  const getScoreDescription = (score) => {
    if (score >= 85) {
      return "Your resume is highly optimized for ATS systems.";
    }

    if (score >= 70) {
      return "Your resume is performing well, but a few improvements can make it stronger.";
    }

    if (score >= 50) {
      return "Your resume has a solid foundation, but several areas should be improved.";
    }

    return "Your resume needs significant improvements to perform better with ATS systems.";
  };

  // =========================
  // RETURN
  // =========================

  return (
    <div className="upload-resume-page">

      {/* =========================
          NAVBAR
      ========================= */}

      <nav className="dashboard-navbar upload-navbar">

        <div className="brand">

          <div className="brand-icon">
            📝
          </div>

          <span>
            Resume Optimizer
          </span>

        </div>

        <div className="upload-nav-center">

          <span className="upload-nav-status">
            ● Resume Analysis
          </span>

        </div>

        <div className="dashboard-nav-actions">

          <button
            className="dashboard-home-btn"
            onClick={() =>
              navigate("/dashboard")
            }
          >
            ← Dashboard
          </button>

        </div>

      </nav>

      {/* =========================
          MAIN
      ========================= */}

      <main className="upload-resume-container">

        {/* =========================
            PAGE HEADER
        ========================= */}

        <div className="upload-page-header">

          <span className="dashboard-label">
            NEW RESUME ANALYSIS
          </span>

          <h1>
            Make your resume
            <span className="interview-ready">
              {" "}interview-ready.
            </span>
          </h1>

          <p>
            Upload your resume and let our AI analyze its ATS
            compatibility, keywords, formatting, clarity and impact.
          </p>

        </div>

        {/* =========================
            UPLOAD CARD
        ========================= */}

        <div className="resume-upload-card">

          <div className="upload-card-header">

            <div className="upload-content">

              <span className="upload-step">
                STEP 01
              </span>

              <h2>
                Upload your resume
              </h2>

              <p>
                PDF format recommended for the best analysis.
              </p>

            </div>

            <div className="upload-step-number">
              01
            </div>

          </div>

          {/* =========================
              DROP AREA
          ========================= */}

          <div
            className={`upload-box ${
              dragActive
                ? "drag-active"
                : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => {
              setDragActive(false);
            }}
            onDrop={handleDrop}
          >

            <div className="upload-circle">
              ↑
            </div>

            <h3>
              {file
                ? file.name
                : "Drag & drop your resume"}
            </h3>

            <p>
              {file
                ? `${(
                    file.size /
                    1024 /
                    1024
                  ).toFixed(2)} MB`
                : "or choose a PDF file from your computer"}
            </p>

            <label className="browse-btn">

              Browse PDF

              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) =>
                  handleFile(
                    e.target.files[0]
                  )
                }
              />

            </label>

            <div className="upload-requirements">

              <span>
                ✓ PDF only
              </span>

              <span>
                ✓ Maximum 5MB
              </span>

              <span>
                ✓ Secure upload
              </span>

            </div>

          </div>

          {/* =========================
              TARGET JOB ROLE
          ========================= */}

          <div className="job-role-container">

            <label htmlFor="targetRole">
              What job role are you applying for?
            </label>

            <input
              id="targetRole"
              type="text"
              placeholder="e.g. Frontend Developer"
              value={targetRole}
              onChange={(e) =>
                setTargetRole(e.target.value)
              }
              maxLength={120}
              disabled={loading}
            />

            <p>
              AI will analyze your resume specifically
              for this role.
            </p>

          </div>

          {/* =========================
              ANALYZE BUTTON
          ========================= */}

          <button
            type="button"
            className="analyze-btn"
            onClick={handleAnalyze}
            disabled={
              loading ||
              !file ||
              !targetRole.trim()
            }
          >

            {loading
              ? "Analyzing your resume..."
              : "Analyze My Resume →"}

          </button>

          {/* =========================
              SECURITY
          ========================= */}

          <div className="upload-security">
            🔒 Your resume is securely processed and analyzed.
          </div>

        </div>

        {/* =========================
            LOADING CARD
        ========================= */}

        {loading && (

          <div
            id="upload-analysis-loader"
            className="analysis-loader"
          >

            <div className="loader-spinner"></div>

            <div className="loader-content">

              <span className="loader-eyebrow">
                AI ANALYSIS IN PROGRESS
              </span>

              <h3>
                Analyzing your resume
              </h3>

              <p>
                We're checking your resume against
                modern ATS criteria for{" "}
                <strong>
                  {targetRole}
                </strong>.
              </p>

              <div className="loading-step">
                <span>01</span>
                <span>
                  Reading your resume...
                </span>
              </div>

              <div className="loading-step">
                <span>02</span>
                <span>
                  Analyzing keywords...
                </span>
              </div>

              <div className="loading-step">
                <span>03</span>
                <span>
                  Calculating ATS score...
                </span>
              </div>

              <div className="loading-step">
                <span>04</span>
                <span>
                  Preparing recommendations...
                </span>
              </div>

            </div>

          </div>

        )}

        {/* =========================
            PREMIUM ANALYSIS RESULT
        ========================= */}

        {result && (

          <div
            id="upload-analysis-result"
            className="premium-analysis-result"
          >

            {/* =========================
                HEADER
            ========================= */}

            <div className="premium-result-header">

              <div>

                <span className="premium-result-eyebrow">
                  ✦ ANALYSIS COMPLETE
                </span>

                <h2>
                  Your Resume Analysis
                </h2>

                <p>
                  Here's how your resume performs against
                  modern ATS requirements for{" "}
                  <strong>
                    {targetRole}
                  </strong>.
                </p>

              </div>

              <div className="analysis-complete-badge">

                <span>✓</span>

                Complete

              </div>

            </div>

            {/* =========================
                ATS SCORE
            ========================= */}

            <div className="premium-score-card">

              <div className="premium-score-left">

                <div
                  className="premium-score-ring"
                  style={{
                    "--ats-score":
                      result.analysis?.atsScore ?? 0,
                  }}
                >

                  <div className="premium-score-ring-inner">

                    <strong>
                      {result.analysis?.atsScore ??
                        "—"}
                    </strong>

                    <span>
                      / 100
                    </span>

                  </div>

                </div>

              </div>

              <div className="premium-score-content">

                <span className="premium-score-label">
                  OVERALL ATS SCORE
                </span>

                <h3>
                  {getScoreTitle(
                    result.analysis?.atsScore ?? 0
                  )}
                </h3>

                <p>
                  {getScoreDescription(
                    result.analysis?.atsScore ?? 0
                  )}
                </p>

                <div className="score-status">

                  <span className="score-status-dot"></span>

                  Resume analyzed for{" "}
                  <strong>
                    {targetRole}
                  </strong>

                </div>

              </div>

            </div>

            {/* =========================
                SCORE BREAKDOWN
            ========================= */}

            {result.analysis?.scoreBreakdown && (

              <section className="premium-breakdown-section">

                <div className="premium-section-heading">

                  <div>

                    <span>
                      PERFORMANCE
                    </span>

                    <h3>
                      Score Breakdown
                    </h3>

                  </div>

                  <p>
                    See how each part of your resume performs.
                  </p>

                </div>

                <div className="premium-breakdown-grid">

                  {[
                    {
                      label: "Keywords",
                      short: "KEY",
                      value:
                        result.analysis.scoreBreakdown.keywords ??
                        0,
                      max: 25,
                    },

                    {
                      label: "Formatting",
                      short: "FMT",
                      value:
                        result.analysis.scoreBreakdown.formatting ??
                        0,
                      max: 20,
                    },

                    {
                      label: "Impact",
                      short: "IMP",
                      value:
                        result.analysis.scoreBreakdown.impact ??
                        0,
                      max: 25,
                    },

                    {
                      label: "Clarity",
                      short: "CLR",
                      value:
                        result.analysis.scoreBreakdown.clarity ??
                        0,
                      max: 30,
                    },

                  ].map((item) => {

                    const percentage =
                      Math.min(
                        100,
                        Math.max(
                          0,
                          Math.round(
                            (item.value /
                              item.max) *
                              100
                          )
                        )
                      );

                    return (

                      <div
                        className="premium-breakdown-card"
                        key={item.label}
                      >

                        <div className="premium-breakdown-top">

                          <div className="premium-breakdown-icon">
                            {item.short}
                          </div>

                          <span>
                            {percentage}%
                          </span>

                        </div>

                        <h4>
                          {item.label}
                        </h4>

                        <div className="premium-breakdown-score">

                          <strong>
                            {item.value}
                          </strong>

                          <span>
                            / {item.max}
                          </span>

                        </div>

                        <div className="premium-progress">

                          <div
                            style={{
                              width:
                                `${percentage}%`,
                            }}
                          />

                        </div>

                      </div>

                    );

                  })}

                </div>

              </section>

            )}

            {/* =========================
                SCORE SUMMARY
            ========================= */}

            <div className="premium-summary">

              <div className="premium-summary-icon">
                ✦
              </div>

              <div>

                <span>
                  YOUR SCORE
                </span>

                <h3>
                  {result.analysis?.atsScore >= 85
                    ? "Your resume is highly optimized."
                    : result.analysis?.atsScore >= 70
                    ? "Your resume is performing well."
                    : result.analysis?.atsScore >= 50
                    ? "Your resume has room for improvement."
                    : "Your resume needs significant improvement."}
                </h3>

                <p>
                  Your ATS score is based on keywords,
                  formatting, impact and clarity across
                  your resume.
                </p>

              </div>

            </div>

            {/* =========================
                NEXT ACTION
            ========================= */}

            <div className="premium-result-footer">

              <div>

                <span>
                  READY TO IMPROVE YOUR RESUME?
                </span>

                <h3>
                  Let AI rewrite your resume.
                </h3>

                <p>
                  Apply the AI-generated improvements to create
                  a stronger resume version.
                </p>

              </div>

              <div className="premium-result-actions">

                <button
                  type="button"
                  className="ai-rewrite-btn"
                  onClick={handleAIRewrite}
                  disabled={loading}
                >

                  <span>✦</span>

                  {loading
                    ? "Rewriting Resume..."
                    : "AI Rewrite Resume"}

                </button>

                {rewrittenVersion && (

                  <button
                    type="button"
                    className="download-rewritten-btn"
                    onClick={
                      handleDownloadRewrittenResume
                    }
                    disabled={downloading}
                  >

                    {downloading
                      ? "Preparing PDF..."
                      : "↓ Download AI Rewrite"}

                  </button>

                )}

                <button
                  type="button"
                  className="analyze-another-btn"
                  onClick={() => {

                    setResult(null);
                    setFile(null);
                    setResumeId(null);
                    setRewrittenVersion(null);
                    setTargetRole("");

                    window.scrollTo({
                      top: 0,
                      behavior: "smooth",
                    });

                  }}
                >

                  Analyze Another Resume

                  <span>
                    →
                  </span>

                </button>

              </div>

            </div>

          </div>

        )}

      </main>

    </div>
  );
}

export default UploadResume;