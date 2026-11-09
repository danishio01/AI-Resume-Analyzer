import { useEffect, useState } from "react";
import { useTheme } from "./context/ThemeContext";
import { useAuth } from "./context/AuthContext";
import { Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import UploadResume from "./UploadResume";

import Login from "./login";
import Dashboard from "./Dashboard";

function Home() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const { darkMode, toggleTheme } = useTheme();

  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [loadingStep, setLoadingStep] = useState(0);
  const [targetRole, setTargetRole] = useState("");

  const [scoreHovered, setScoreHovered] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);

  // =========================
  // SCROLL TO UPLOAD
  // =========================

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("upload") === "true") {
      setSelectedPlan("free");

      setTimeout(() => {
        document
          .getElementById("upload")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 300);
    }
  }, []);

  // =========================
  // HERO SCORE ANIMATION
  // =========================

  useEffect(() => {
    if (!scoreHovered) {
      setAnimatedScore(0);
      return;
    }

    let current = 0;

    const interval = setInterval(() => {
      current += 2;

      if (current >= 100) {
        current = 100;
        clearInterval(interval);
      }

      setAnimatedScore(current);
    }, 10);

    return () => clearInterval(interval);
  }, [scoreHovered]);

  // =========================
  // HANDLE FILE
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
  };

  // =========================
  // HANDLE DROP
  // =========================

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  // =========================
  // ANALYZE RESUME
  // =========================

  const handleAnalyze = async () => {
    // Wait until authentication check is complete
    if (authLoading) {
      return;
    }

    // User is not logged in
    if (!user) {
      alert("Please sign in to analyze your resume.");
      navigate("/login");
      return;
    }

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
        .getElementById("analysis-loader")
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

      if (!uploadResponse.ok) {
        throw new Error(
          uploadData?.error?.message || "Resume upload failed"
        );
      }

      console.log("Upload response:", uploadData);

      const resumeId = uploadData.resume._id;
      const versionId = uploadData.version._id;

      // =========================
      // STEP 2: ANALYZE
      // =========================

      const analysisResponse = await fetch(
        `http://localhost:5000/api/resumes/${resumeId}/analyze`,
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

      const analysisData = await analysisResponse.json();

      if (!analysisResponse.ok) {
        throw new Error(
          analysisData?.error?.message || "Resume analysis failed"
        );
      }

      // =========================
      // DEBUG RESPONSE
      // =========================

      console.log("=================================");
      console.log("FULL ANALYSIS RESPONSE:");
      console.log(JSON.stringify(analysisData, null, 2));
      console.log("=================================");

      setResult(analysisData);

      setTimeout(() => {
        document
          .getElementById("analysis-result")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 200);
    } catch (error) {
      console.error("Resume analysis error:", error);
      alert(error.message || "Failed to analyze resume.");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // SCROLL TO UPLOAD
  // =========================

  const scrollToUpload = () => {
    document
      .getElementById("upload")
      ?.scrollIntoView({
        behavior: "smooth",
      });
  };

  // =========================
  // SCORE TITLE
  // =========================

  const getScoreTitle = (score) => {
    if (score >= 85) return "Excellent Resume";
    if (score >= 70) return "Good Resume";
    if (score >= 50) return "Needs Improvement";
    return "Needs Work";
  };

  // =========================
  // SCORE DESCRIPTION
  // =========================

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
  // GET ATS SCORE SAFELY
  // =========================

  const atsScore =
    result?.analysis?.atsScore ??
    result?.atsScore ??
    result?.data?.analysis?.atsScore ??
    result?.data?.atsScore ??
    result?.version?.analysis?.atsScore ??
    result?.version?.atsScore ??
    null;

  // =========================
  // PAGE
  // =========================

  return (
    <div className="app">

      {/* =========================
          NAVBAR
      ========================= */}

      <nav className="navbar">

        <div className="brand">
          <div className="brand-icon">
            📝
          </div>

          <span>
            Resume Optimizer
          </span>
        </div>

        <div className="nav-links">

          <a href="#features">
            Features
          </a>

          <a href="#how-it-works">
            How it works
          </a>

          <a href="#pricing">
            Pricing
          </a>

        </div>

        <div className="nav-actions">

          <button
            className="signin-btn"
            onClick={() => navigate("/login")}
          >

            Sign in
          </button>

          <button
            className="get-started-btn"
            onClick={() => {
              document
                .getElementById("pricing")
                ?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            }}
          >
            Get started
            <span>→</span>
          </button>

        </div>

      </nav>

      {/* =========================
          HERO
      ========================= */}

      <section className="hero">

        <div className="hero-inner">

          <div className="hero-left">

            <div className="announcement">
              <span>✣</span>
              NOW SCORING AGAINST ATS 2026 CRITERIA
            </div>

            <h1>

              <span className="white-text">
                Beat the ATS.
              </span>

              <span>
                Land more
              </span>

              <span>
                interviews.
              </span>

            </h1>

            <p className="hero-description">
              Upload your resume. Get an instant ATS score,
              fixable issues, and AI-rewritten bullets that
              actually sound like you — built for engineers,
              by engineers.
            </p>

            <div className="hero-buttons">

              <button
                className="upload-hero-btn"
                onClick={() => {
                  document
                    .getElementById("pricing")
                    ?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                }}
              >
                Upload your resume
                <span>→</span>
              </button>

              <a
                href="#how-it-works"
                className="how-btn"
              >
                <span className="play-icon">
                  ▶
                </span>

                See how it works
              </a>

            </div>

            <div className="trust-row">

              <span>
                ♧ Designed and Maintained by
              </span>

              <span></span>

              <span>
                MUHAMMAD DANISH J
              </span>

              <span></span>

              <span>
                100+ resumes analyzed
              </span>

            </div>

          </div>

          {/* HERO VISUAL */}

          <div className="hero-visual">

            <div
              className="score-card"
              onMouseEnter={() => setScoreHovered(true)}
              onMouseLeave={() => setScoreHovered(false)}
            >

              <div className="score-top">

                <div>

                  <div className="mini-label">
                    ATS READINESS
                  </div>

                  <div className="resume-name">
                    Resume Analysis
                  </div>

                </div>

                <div className="strong-badge">
                  • Strong
                </div>

              </div>

              <div className="score-gauge">

                <div
                  className="gauge"
                  style={{
                    "--score": `${animatedScore * 1.8}deg`,
                  }}
                >

                  <div className="gauge-number">

                    {animatedScore}

                    <small>
                      out of 100
                    </small>

                  </div>

                </div>

              </div>

              <div className="score-change">
                ↗ +18 vs V1
              </div>

            </div>

            <div className="tech-tags">
              <span>+React</span>
              <span>+TypeScript</span>
              <span>+AWS</span>
            </div>

            <div className="issues-card">

              <div className="floating-card-header">

                <span>◉</span>

                <strong>
                  Top issues
                </strong>

                <small>
                  5
                </small>

              </div>

              <div className="issue">
                <i className="red-dot"></i>
                Weak action verbs
              </div>

              <div className="issue">
                <i className="yellow-dot"></i>
                Missing keywords
              </div>

              <div className="issue">
                <i className="green-dot"></i>
                No Quantifiable Results
              </div>

            </div>

            <div className="rewrite-card">

              <div className="floating-card-header">

                <span>⚙</span>

                <strong>
                  AI rewrite
                </strong>

                <small className="improved">
                  ● improved
                </small>

              </div>

              <div className="before">

                <label>
                  BEFORE
                </label>

                <p>
                  AI makes the resume more enhanced
                </p>

              </div>

              <div className="after">

                <label>
                  → AFTER
                </label>

                <p>
                  Write Better & Impress More.
                  AI-powered rewriting made simple and effective.
                </p>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          UPLOAD SECTION
      ========================= */}

      {selectedPlan === "free" && (

        <section
          id="upload"
          className="upload-section"
        >

          <div className="section-container">

            <div className="section-label">
              START ANALYZING
            </div>

            <h2>
              Turn your resume into
              <span>
                {" "}an interview magnet.
              </span>
            </h2>

            <p className="section-description">
              Upload your PDF resume and let our AI identify
              ATS problems, missing keywords, formatting issues,
              and opportunities to improve your impact.
            </p>

            {/* =========================
                UPLOAD BOX
            ========================= */}

            <div
              className={`upload-box ${
                dragActive ? "drag-active" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >

              <div className="upload-circle">
                ↑
              </div>

              <h3>
                {file
                  ? file.name
                  : "Drop your resume here"}
              </h3>

              <p>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : "PDF files only, maximum 5MB"}
              </p>

              <label className="browse-btn">

                Choose PDF

                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) =>
                    handleFile(e.target.files[0])
                  }
                />

              </label>

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
                    onChange={(e) => setTargetRole(e.target.value)}
                    maxLength={120}
                  />

                  <p>
                    AI will analyze your resume specifically for this role.
                  </p>

                </div>

            {/* =========================
                ANALYZE BUTTON
            ========================= */}

            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading
                ? "Analyzing resume..."
                : "Analyze Resume →"}
            </button>

            {/* =========================
                ANALYSIS LOADING
            ========================= */}

            {loading && (
              <div
                id="analysis-loader"
                className="premium-analysis-loader"
              >

                <div className="loader-orbit">

                  <div className="loader-orbit-inner">
                    ✦
                  </div>

                </div>

                <div className="premium-loader-content">

                  <span className="loader-eyebrow">
                    AI ANALYSIS IN PROGRESS
                  </span>

                  <h2>
                    Analyzing your resume
                  </h2>

                  <p>
                    We're checking your resume against modern ATS criteria.
                  </p>

                  <div className="premium-loading-steps">

                    <div className="premium-loading-step active">

                      <span>01</span>

                      <div>
                        <strong>
                          Reading your resume
                        </strong>

                        <small>
                          Extracting your resume information
                        </small>
                      </div>

                      <b>✓</b>

                    </div>

                    <div className="premium-loading-step active">

                      <span>02</span>

                      <div>
                        <strong>
                          Analyzing keywords
                        </strong>

                        <small>
                          Checking relevant skills and terms
                        </small>
                      </div>

                      <b>✓</b>

                    </div>

                    <div className="premium-loading-step processing">

                      <span>03</span>

                      <div>
                        <strong>
                          Calculating ATS score
                        </strong>

                        <small>
                          Evaluating resume performance
                        </small>
                      </div>

                      <b>●</b>

                    </div>

                    <div className="premium-loading-step">

                      <span>04</span>

                      <div>
                        <strong>
                          Preparing recommendations
                        </strong>

                        <small>
                          Creating personalized improvements
                        </small>
                      </div>

                      <b>○</b>

                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* =========================
                ANALYSIS RESULT
            ========================= */}

            {result && (

              <div
                id="analysis-result"
                className="result-box"
              >

                {/* RESULT HEADER */}

                <div className="analysis-result-header">

                  <div>

                    <div className="analysis-complete-badge">
                      <span>✓</span>
                      ANALYSIS COMPLETE
                    </div>

                    <h3>
                      Your resume has been analyzed.
                    </h3>

                    <p>
                      Here's a detailed look at how your resume
                      performs against modern ATS requirements.
                    </p>

                  </div>

                  <div className="analysis-header-check">
                    ✓
                  </div>

                </div>

                {/* ATS SCORE */}

                <div className="ats-score-panel">

                  <div
                    className="ats-score-ring"
                    style={{
                      "--ats-score": atsScore ?? 0,
                    }}
                  >

                    <div className="ats-score-ring-inner">

                      <strong>
                        {atsScore !== null ? atsScore : "—"}
                      </strong>

                      <span>
                        / 100
                      </span>

                    </div>

                  </div>

                  <div className="ats-score-info">

                    <span className="ats-score-label">
                      OVERALL ATS SCORE
                    </span>

                    <h4>
                      {getScoreTitle(atsScore ?? 0)}
                    </h4>

                    <p>
                      {getScoreDescription(atsScore ?? 0)}
                    </p>

                  </div>

                </div>

                {/* =========================
                    SCORE BREAKDOWN
                ========================= */}

                {result.analysis?.scoreBreakdown && (

                  <div className="score-breakdown">

                    <div className="analysis-section-heading">

                      <div>

                        <span>
                          PERFORMANCE
                        </span>

                        <h4>
                          Score Breakdown
                        </h4>

                      </div>

                      <small>
                        How your resume performs
                      </small>

                    </div>

                    <div className="breakdown-grid">

                      {[
                        {
                          label: "Keywords",
                          value:
                            result.analysis.scoreBreakdown.keywords,
                          max: 25,
                          icon: "⌕",
                        },
                        {
                          label: "Formatting",
                          value:
                            result.analysis.scoreBreakdown.formatting,
                          max: 20,
                          icon: "▤",
                        },
                        {
                          label: "Impact",
                          value:
                            result.analysis.scoreBreakdown.impact,
                          max: 25,
                          icon: "↗",
                        },
                        {
                          label: "Clarity",
                          value:
                            result.analysis.scoreBreakdown.clarity,
                          max: 30,
                          icon: "✦",
                        },
                      ].map((item) => {

                        const percentage = Math.min(
                          100,
                          Math.round(
                            (item.value / item.max) * 100
                          )
                        );

                        return (

                          <div
                            className="breakdown-card"
                            key={item.label}
                          >

                            <div className="breakdown-card-top">

                              <span className="breakdown-icon">
                                {item.icon}
                              </span>

                              <span className="breakdown-percent">
                                {percentage}%
                              </span>

                            </div>

                            <span className="breakdown-label">
                              {item.label}
                            </span>

                            <div className="breakdown-score">

                              <strong>
                                {item.value}
                              </strong>

                              <span>
                                / {item.max}
                              </span>

                            </div>

                            <div className="breakdown-bar">

                              <div
                                className="breakdown-bar-fill"
                                style={{
                                  width: `${percentage}%`,
                                }}
                              />

                            </div>

                          </div>

                        );
                      })}

                    </div>

                  </div>

                )}

                {/* =========================
                    ISSUES
                ========================= */}

                <div className="analysis-issues">

                  <div className="analysis-section-heading">

                    <div>

                      <span>
                        ATTENTION NEEDED
                      </span>

                      <h4>
                        Issues Found
                      </h4>

                    </div>

                    <div className="issue-count">
                      {result.analysis?.issues?.length || 0}
                    </div>

                  </div>

                  {result.analysis?.issues?.length > 0 ? (

                    <div className="issues-list">

                      {result.analysis.issues.map(
                        (issue, index) => {

                          const message =
                            typeof issue === "string"
                              ? issue
                              : issue?.message ||
                                issue?.title ||
                                JSON.stringify(issue);

                          return (

                            <div
                              className="analysis-issue"
                              key={index}
                            >

                              <div className="issue-number">
                                {String(index + 1).padStart(2, "0")}
                              </div>

                              <div className="issue-status-dot"></div>

                              <div className="issue-content">

                                <strong>
                                  {message}
                                </strong>

                                <span>
                                  This area may affect your ATS
                                  performance.
                                </span>

                              </div>

                              <div className="issue-arrow">
                                →
                              </div>

                            </div>

                          );

                        }
                      )}

                    </div>

                  ) : (

                    <div className="no-issues-card">

                      <span>
                        ✓
                      </span>

                      <div>

                        <strong>
                          No major issues found
                        </strong>

                        <p>
                          Your resume is looking good from
                          an ATS perspective.
                        </p>

                      </div>

                    </div>

                  )}

                </div>

                {/* =========================
                    NEXT STEP
                ========================= */}

                <div className="analysis-next-step">

                  <div className="next-step-icon">
                    ✦
                  </div>

                  <div className="next-step-content">

                    <span>
                      NEXT STEP
                    </span>

                    <strong>
                      Improve your resume
                    </strong>

                    <p>
                      Use the issues above as a guide and make
                      targeted improvements to increase your ATS score.
                    </p>

                  </div>

                  <button
                    className="analyze-again-btn"
                    onClick={() => {

                      setResult(null);
                      setFile(null);

                      document
                        .getElementById("upload")
                        ?.scrollIntoView({
                          behavior: "smooth",
                        });

                    }}
                  >
                    Analyze Again →
                  </button>

                </div>

              </div>

            )}

          </div>

        </section>

      )}

      {/* =========================
          FEATURES
      ========================= */}

      <section
        id="features"
        className="features-section"
      >

        <div className="section-container">

          <div className="section-label">
            FEATURES
          </div>

          <h2>
            Everything you need to
            <span>{" "}beat the ATS.</span>
          </h2>

          <div className="feature-grid">

            {/* 01 */}

            <div className="feature-card">

              <div className="feature-top">

                <div className="feature-number">
                  01
                </div>

                <div className="feature-icon">
                  ◉
                </div>

              </div>

              <div className="feature-content">

                <h3>
                  ATS Score
                </h3>

                <p>
                  See how well your resume performs against
                  modern Applicant Tracking Systems.
                </p>

                <div className="feedback-preview">

                  <div>
                    ✓ Match your resume with job requirements
                  </div>

                  <div>
                    ✓ Identify missing keywords and skills
                  </div>

                </div>

              </div>

              <div className="feature-link">
                View Score
              </div>

            </div>

            {/* 02 */}

            <div className="feature-card">

              <div className="feature-top">

                <div className="feature-number">
                  02
                </div>

                <div className="feature-icon">
                  ⌕
                </div>

              </div>

              <div className="feature-content">

                <h3>
                  Keyword Analysis
                </h3>

                <p>
                  Discover missing skills and keywords
                  recruiters are looking for.
                </p>

                <div className="feedback-preview">

                  <div>
                    ✓ Add missing job-specific keywords
                  </div>

                  <div>
                    ✓ Match keywords to your target role
                  </div>

                </div>

              </div>

              <div className="feature-link">
                Find Keywords
              </div>

            </div>

            {/* 03 */}

            <div className="feature-card">

              <div className="feature-top">

                <div className="feature-number">
                  03
                </div>

                <div className="feature-icon">
                  ✦
                </div>

              </div>

              <div className="feature-content">

                <h3>
                  AI Rewrites
                </h3>

                <p>
                  Transform weak resume bullets into
                  stronger, measurable achievements.
                </p>

                <div className="rewrite-preview">

                  <div className="rewrite-before">

                    <span>
                      Before
                    </span>

                    Created websites

                  </div>

                  <div className="rewrite-arrow">
                    →
                  </div>

                  <div className="rewrite-after">

                    <span>
                      AI Improved
                    </span>

                    Built responsive, user-friendly web applications

                  </div>

                </div>

              </div>

              <div className="feature-link">
                Rewrites Resume
              </div>

            </div>

            {/* 04 */}

            <div className="feature-card">

              <div className="feature-top">

                <div className="feature-number">
                  04
                </div>

                <div className="feature-icon">
                  ✓
                </div>

              </div>

              <div className="feature-content">

                <h3>
                  Actionable Feedback
                </h3>

                <p>
                  Get specific recommendations instead of
                  receiving only a generic score.
                </p>

                <div className="feedback-preview">

                  <div>
                    ✓ Add measurable results
                  </div>

                  <div>
                    ✓ Add relevant keywords
                  </div>

                </div>

              </div>

              <div className="feature-link">
                Get Feedback
              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          HOW IT WORKS
      ========================= */}

      <section
        className="steps-section"
        id="how-it-works"
      >

        <div className="section-container">

          <span className="section-label">
            HOW IT WORKS
          </span>

          <h2>
            From resume to <span>ready to apply.</span>
          </h2>

          <p className="section-description">
            Get a complete AI-powered resume analysis in four simple steps.
            Upload your resume, discover what needs improvement, and make
            your resume stronger.
          </p>

          <div className="how-it-works-layout">

            {/* LEFT — STEPS */}

            <div className="how-steps">

              {/* STEP 01 */}

              <div className="how-step active-step">

                <div className="step-number">
                  01
                </div>

                <div className="step-line"></div>

                <div className="step-content">

                  <div className="step-icon">
                    📝
                  </div>

                  <div>

                    <h3>
                      Upload Your Resume
                    </h3>

                    <p>
                      Upload your resume as a PDF and let our system
                      prepare it for intelligent analysis.
                    </p>

                  </div>

                </div>

              </div>

              {/* STEP 02 */}

              <div className="how-step">

                <div className="step-number">
                  02
                </div>

                <div className="step-line"></div>

                <div className="step-content">

                  <div className="step-icon">
                    🧠
                  </div>

                  <div>

                    <h3>
                      AI Analyzes Your Resume
                    </h3>

                    <p>
                      Our AI examines your keywords, formatting,
                      skills, experience and overall resume quality.
                    </p>

                  </div>

                </div>

              </div>

              {/* STEP 03 */}

              <div className="how-step">

                <div className="step-number">
                  03
                </div>

                <div className="step-line"></div>

                <div className="step-content">

                  <div className="step-icon">
                    📊
                  </div>

                  <div>

                    <h3>
                      Get Your ATS Score
                    </h3>

                    <p>
                      See how your resume performs with a clear ATS
                      score and detailed category breakdown.
                    </p>

                  </div>

                </div>

              </div>

              {/* STEP 04 */}

              <div className="how-step last-step">

                <div className="step-number">
                  04
                </div>

                <div className="step-content">

                  <div className="step-icon">
                    ✨
                  </div>

                  <div>

                    <h3>
                      Improve & Apply
                    </h3>

                    <p>
                      Follow personalized recommendations and improve
                      your resume before sending it to employers.
                    </p>

                  </div>

                </div>

              </div>

            </div>

            {/* RIGHT — ANALYSIS PREVIEW */}

            <div className="how-preview">

              <div className="preview-glow"></div>

              <div className="preview-card">

                <div className="preview-header">

                  <div>

                    <span>
                      AI RESUME ANALYSIS
                    </span>

                    <h3>
                      Resume.pdf
                    </h3>

                  </div>

                  <div className="preview-status">
                    ✓ Analyzed
                  </div>

                </div>

                <div className="preview-score">

                  <div className="preview-score-ring">

                    <div>

                      <strong>
                        95
                      </strong>

                      <span>
                        ATS SCORE
                      </span>

                    </div>

                  </div>

                  <div className="preview-score-info">

                    <span>
                      YOUR RESUME
                    </span>

                    <h4>
                      Strong Match
                    </h4>

                    <p>
                      Your resume is performing well,
                      but there are opportunities to improve.
                    </p>

                  </div>

                </div>

                <div className="preview-metrics">

                  <div className="preview-metric">

                    <div>

                      <span>
                        Keywords
                      </span>

                      <strong>
                        92%
                      </strong>

                    </div>

                    <div className="metric-bar">
                      <span style={{ width: "92%" }}></span>
                    </div>

                  </div>

                  <div className="preview-metric">

                    <div>

                      <span>
                        Formatting
                      </span>

                      <strong>
                        84%
                      </strong>

                    </div>

                    <div className="metric-bar">
                      <span style={{ width: "84%" }}></span>
                    </div>

                  </div>

                  <div className="preview-metric">

                    <div>

                      <span>
                        Impact
                      </span>

                      <strong>
                        76%
                      </strong>

                    </div>

                    <div className="metric-bar">
                      <span style={{ width: "76%" }}></span>
                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          PRICING
      ========================= */}

      <section
        id="pricing"
        className="pricing-section"
      >

        <div className="section-container">

          <div className="section-label">
            PRICING
          </div>

          <h2>
            Choose the plan that
            <span>
              {" "}works for you.
            </span>
          </h2>

          <p className="pricing-description">
            Start free and upgrade whenever you need more powerful
            resume optimization tools.
          </p>

          <div className="pricing-grid">

            {/* FREE */}

            <div className="pricing-card">

              <div className="plan-name">
                FREE
              </div>

              <h3>
                Free
              </h3>

              <div className="plan-price">

                <span className="currency">
                  ₹
                </span>

                <span className="price">
                  0
                </span>

                <span className="period">
                  / month
                </span>

              </div>

              <p className="plan-description">
                Perfect for getting started with resume optimization.
              </p>

              <ul className="plan-features">

                <li>
                  ✓ 3 resume analyses per month
                </li>

                <li>
                  ✓ 3 AI-powered rewrites
                </li>


                <li>
                  ✓ ATS score
                </li>

                <li>
                  ✓ Basic feedback
                </li>

              
                <li>
                  ✓ Keyword analysis
                </li>

              </ul>

              <button
                className="plan-btn free-btn"
                onClick={() => {

                  setSelectedPlan("free");

                  setTimeout(() => {

                    document
                      .getElementById("upload")
                      ?.scrollIntoView({
                        behavior: "smooth",
                      });

                  }, 100);

                }}
              >
                Get Started →
              </button>

            </div>

            {/* PRO */}

            <div className="pricing-card popular-plan">

              <div className="popular-badge">
                MOST POPULAR
              </div>

              <div className="plan-name">
                PRO
              </div>

              <h3>
                Pro
              </h3>

              <div className="plan-price">

                <span className="currency">
                  ₹
                </span>

                <span className="price">
                  299
                </span>

                <span className="period">
                  / month
                </span>

              </div>

              <p className="plan-description">
                For job seekers who want to maximize their chances.
              </p>

              <ul className="plan-features">

                <li>
                  ✓ 20 resume analyses per month
                </li>

                <li>
                  ✓ Detailed ATS analysis
                </li>

                <li>
                  ✓ AI-powered rewrites
                </li>

                <li>
                  ✓ Advanced recommendations
                </li>

                <li>
                  ✓ Resume optimization tools
                </li>

              </ul>

              <button
                className="plan-btn pro-btn"
                onClick={() =>
                  alert("Pro checkout coming soon!")
                }
              >
                Choose Pro →
              </button>

            </div>

            {/* PREMIUM */}

            <div className="pricing-card">

              <div className="plan-name">
                PREMIUM
              </div>

              <h3>
                Premium
              </h3>

              <div className="plan-price">

                <span className="currency">
                  ₹
                </span>

                <span className="price">
                  599
                </span>

                <span className="period">
                  / month
                </span>

              </div>

              <p className="plan-description">
                Everything you need for complete resume optimization.
              </p>

              <ul className="plan-features">

                <li>
                  ✓ Unlimited resume analyses
                </li>

                <li>
                  ✓ Everything in Pro
                </li>

                <li>
                  ✓ Advanced AI optimization
                </li>

                <li>
                  ✓ Multiple resume versions
                </li>

                <li>
                  ✓ Priority features
                </li>

              </ul>

              <button
                className="plan-btn premium-btn"
                onClick={() =>
                  alert("Premium checkout coming soon!")
                }
              >
                Choose Premium →
              </button>

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          FOOTER
      ========================= */}

      <footer>

        <div className="footer-brand">

          <div className="brand-icon">
            📝
          </div>

          <span>
            Resume Optimizer
          </span>

        </div>

        <p>
          AI-powered resume analysis for better job applications.
        </p>

        <small>
          © 2026 Resume Optimizer. All rights reserved.
        </small>

      </footer>

    </div>
  );
}

/* =========================
   ROUTER
========================= */

function App() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <Routes>

      <Route
        path="/"
        element={<Home />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/dashboard"
        element={<Dashboard />}
      />

      <Route
        path="/upload-resume"
        element={<UploadResume />}
      />

    </Routes>
  );
}

export default App;

