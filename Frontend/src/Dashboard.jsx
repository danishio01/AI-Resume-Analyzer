import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import "./App.css";

function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // =========================================================
  // GET ATS SCORE SAFELY
  // =========================================================

  const getAtsScore = (item) => {
    const possibleScores = [
      item?.atsScore,
      item?.analysis?.atsScore,
      item?.data?.analysis?.atsScore,
      item?.data?.atsScore,
    ];

    for (const score of possibleScores) {
      if (
        score !== null &&
        score !== undefined &&
        score !== "" &&
        !Number.isNaN(Number(score))
      ) {
        return Number(score);
      }
    }

    return null;
  };

  // =========================================================
  // LOAD COMPLETE RESUME + ANALYSIS HISTORY
  // =========================================================

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true);

        // ---------------------------------------------------
        // STEP 1: GET ALL USER RESUMES
        // ---------------------------------------------------

        const resumeResponse = await fetch(
          "http://localhost:5000/api/resumes",
          {
            method: "GET",
            credentials: "include",
          }
        );

        const resumeData = await resumeResponse.json();

        console.log(
          "DASHBOARD RESUMES:",
          JSON.stringify(resumeData, null, 2)
        );

        if (!resumeResponse.ok) {
          throw new Error(
            resumeData?.error?.message ||
              "Failed to load resumes"
          );
        }

        const resumeList =
          resumeData.resumes ||
          resumeData ||
          [];

        // ---------------------------------------------------
        // STEP 2: GET ALL ANALYSES FOR EVERY RESUME
        // ---------------------------------------------------

        const historyItems = [];

        for (const resume of resumeList) {
          try {
            const analysisResponse = await fetch(
              `http://localhost:5000/api/resumes/${resume._id}/analyses`,
              {
                method: "GET",
                credentials: "include",
              }
            );

            const analysisData =
              await analysisResponse.json();

            console.log(
              `ANALYSES FOR RESUME ${resume._id}:`,
              JSON.stringify(
                analysisData,
                null,
                2
              )
            );

            if (!analysisResponse.ok) {
              console.error(
                "Failed to load analyses for resume:",
                resume._id,
                analysisData
              );

              return;
            }

            const analyses =
              analysisData.analyses || [];

            // -------------------------------------------------
            // CREATE ONE HISTORY ITEM FOR EACH ANALYSIS
            // -------------------------------------------------

            analyses.forEach((analysis) => {
              historyItems.push({
                ...analysis,

                resumeTitle:
                  resume.title ||
                  resume.fileName ||
                  resume.name ||
                  "Resume",

                resumeId:
                  resume._id,

                currentVersionId:
                  resume.currentVersionId,
              });
            });
          } catch (error) {
            console.error(
              `Failed to load analyses for resume ${resume._id}:`,
              error
            );
          }
        }

        // ---------------------------------------------------
        // STEP 3: SORT NEWEST → OLDEST
        // ---------------------------------------------------

        historyItems.sort((a, b) => {
          const dateA = new Date(
            a.createdAt || 0
          ).getTime();

          const dateB = new Date(
            b.createdAt || 0
          ).getTime();

          return dateB - dateA;
        });

        console.log(
          "COMPLETE ANALYSIS HISTORY:",
          JSON.stringify(
            historyItems,
            null,
            2
          )
        );

        setHistory(historyItems);
      } catch (error) {
        console.error(
          "Failed to load resume history:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );
    }
  };

  // =========================================================
  // CALCULATE AVERAGE ATS SCORE
  // =========================================================

  const scores = history
    .map((item) => getAtsScore(item))
    .filter(
      (score) => score !== null
    );

  const averageAtsScore =
    scores.length > 0
      ? Math.round(
          scores.reduce(
            (total, score) =>
              total + score,
            0
          ) / scores.length
        )
      : null;

  // =========================================================
  // FORMAT DATE
  // =========================================================

  const formatDate = (date) => {
    if (!date) {
      return "Recently analyzed";
    }

    const parsedDate =
      new Date(date);

    if (
      Number.isNaN(
        parsedDate.getTime()
      )
    ) {
      return "Recently analyzed";
    }

    return parsedDate.toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  };

  // =========================================================
  // FORMAT TIME
  // =========================================================

  const formatTime = (date) => {
    if (!date) {
      return "";
    }

    const parsedDate =
      new Date(date);

    if (
      Number.isNaN(
        parsedDate.getTime()
      )
    ) {
      return "";
    }

    return parsedDate.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <div className="dashboard-page">

      {/* =====================================================
          NAVBAR
      ===================================================== */}

      <nav className="dashboard-navbar">

        <div className="brand">

          <div className="brand-icon">
            📝
          </div>

          <span>
            Resume Optimizer
          </span>

        </div>

        <div className="dashboard-nav-actions">

          <button
            className="dashboard-home-btn"
            onClick={() =>
              navigate("/upload-resume")
            }
          >
            Analyze New Resume →
          </button>

          <button
            className="dashboard-logout-btn"
            onClick={handleLogout}
          >
            Sign out
          </button>

        </div>

      </nav>


      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="dashboard-container">

        {/* ===================================================
            WELCOME
        =================================================== */}

        <section className="dashboard-welcome">

          <div>

            <span className="dashboard-label">
              DASHBOARD
            </span>

            <h1>
              Welcome back,
              <span>
                {" "}
                {user?.name || "there"}!
              </span>
            </h1>

            <p>
              Track your resume performance and
              continue improving your chances
              of landing interviews.
            </p>

          </div>

          <button
            className="dashboard-analyze-btn"
            onClick={() =>
              navigate("/upload-resume")
            }
          >
            Analyze New Resume →
          </button>

        </section>


        {/* ===================================================
            STATS
        =================================================== */}

        <section className="dashboard-stats">

          {/* RESUMES ANALYZED */}

          <div className="dashboard-stat-card">

            <span>
              📝
            </span>

            <div>

              <small>
                RESUMES ANALYZED
              </small>

              <strong>
                {history.length}
              </strong>

            </div>

          </div>


          {/* AVERAGE ATS SCORE */}

          <div className="dashboard-stat-card">

            <span>
              📊
            </span>

            <div>

              <small>
                AVERAGE ATS SCORE
              </small>

              <strong>
                {averageAtsScore !== null
                  ? averageAtsScore
                  : "—"}
              </strong>

            </div>

          </div>


          {/* PLAN */}

          <div className="dashboard-stat-card">

            <span>
              ✨
            </span>

            <div>

              <small>
                PLAN
              </small>

              <strong>
                Free
              </strong>

            </div>

          </div>

        </section>


        {/* ===================================================
            HISTORY
        =================================================== */}

        <section className="dashboard-history">

          <div className="dashboard-section-header">

            <div>

              <span>
                YOUR ACTIVITY
              </span>

              <h2>
                Resume History
              </h2>

            </div>

            <span className="history-count">

              {history.length} analysis
              {history.length !== 1
                ? "es"
                : ""}

            </span>

          </div>


          {/* =================================================
              LOADING
          ================================================= */}

          {loading ? (

            <div className="dashboard-loading">

              <div className="dashboard-spinner"></div>

              <p>
                Loading your resume history...
              </p>

            </div>

          ) : history.length > 0 ? (

            <div className="history-list">

              {history.map(
                (item, index) => {

                  const score =
                    getAtsScore(item);

                  return (

                    <div
                      className="history-card"
                      key={
                        item._id ||
                        `${item.resumeId}-${index}`
                      }
                    >

                      {/* =====================================
                          ICON
                      ===================================== */}

                      <div className="history-icon">
                        📝
                      </div>


                      {/* =====================================
                          RESUME INFO
                      ===================================== */}

                      <div className="history-info">

                        <h3>
                          {item.resumeTitle}
                        </h3>

                        <p>

                          {formatDate(
                            item.createdAt
                          )}

                          {formatTime(
                            item.createdAt
                          ) && (
                            <>
                              {" • "}
                              {formatTime(
                                item.createdAt
                              )}
                            </>
                          )}

                        </p>

                        {item.versionId && (
                          <small
                            style={{
                              display:
                                "block",
                              marginTop:
                                "4px",
                              opacity:
                                0.65,
                            }}
                          >
                            Analysis version
                          </small>
                        )}

                      </div>


                      {/* =====================================
                          ATS SCORE
                      ===================================== */}

                      <div className="history-score">

                        <small>
                          ATS SCORE
                        </small>

                        <strong>
                          {score !== null
                            ? `${score}/100`
                            : "—"}
                        </strong>

                      </div>

                    </div>

                  );
                }
              )}

            </div>

          ) : (

            /* ===============================================
               EMPTY HISTORY
            =============================================== */

            <div className="empty-history">

              <div className="empty-history-icon">
                📝
              </div>

              <h3>
                No resumes analyzed yet
              </h3>

              <p>
                Upload your first resume and
                get your personalized ATS score.
              </p>

              <button
                onClick={() =>
                  navigate(
                    "/upload-resume"
                  )
                }
              >
                Analyze Your First Resume →
              </button>

            </div>

          )}

        </section>

      </main>

    </div>
  );
}

export default Dashboard;