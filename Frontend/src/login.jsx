import { useEffect, useState } from "react";
import "./App.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

function Login({ onBack }) {
  const [isRegister, setIsRegister] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();

  // Reset login form whenever the Login component opens
  useEffect(() => {
  setIsRegister(false);
  setName("");
  setEmail("");
  setPassword("");
  setError("");
  setShowPassword(false);
}, [location.key]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
        });
      } else {
        await login({
          email: email.trim(),
          password,
        });
      }

      navigate("/dashboard");
    } catch (err) {
      console.error("Authentication error:", err);

      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsRegister((prev) => !prev);
    setError("");
    setName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* BACK BUTTON */}
        {onBack && (
          <button
            className="back-btn"
            type="button"
            onClick={onBack}
            disabled={loading}
          >
            ← Back
          </button>
        )}

        {/* LOGO */}
        <div className="login-logo">
          <span>Resume Optimizer</span>
        </div>

        {/* HEADER */}
        <div className="login-header">
          <h1>
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>

          <p className="login-subtitle">
            {isRegister
              ? "Create an account and start optimizing your resume."
              : "Sign in to continue analyzing and improving your resume."}
          </p>
        </div>

        {/* FORM */}
          <form
            className="login-form"
            onSubmit={handleSubmit}
            autoComplete="off"
          >
          {/* NAME */}
          {isRegister && (
            <div className="login-field">
              <label htmlFor="name">Full name</label>

              <input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                disabled={loading}
              />
            </div>
          )}

          {/* EMAIL */}
          <div className="login-field">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          {/* PASSWORD */}
          <div className="login-field">
            <label htmlFor="password">Password</label>

            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={
                  isRegister
                    ? "Minimum 8 characters"
                    : "Enter your password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={isRegister ? 8 : undefined}
                required
                disabled={loading}
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {isRegister && (
              <span className="password-hint">
                Use at least 8 characters.
              </span>
            )}
          </div>

          {/* ERROR */}
          {error && (
            <div className="login-error" role="alert">
              <span className="error-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="login-spinner"></span>

                <span>
                  {isRegister
                    ? "Creating account..."
                    : "Signing in..."}
                </span>
              </>
            ) : (
              <>
                <span>
                  {isRegister ? "Create account" : "Login"}
                </span>

                <span className="submit-arrow">→</span>
              </>
            )}
          </button>
        </form>

        {/* SWITCH LOGIN / REGISTER */}
        <div className="login-footer">
          <span>
            {isRegister
              ? "Already have an account?"
              : "Don't have an account?"}
          </span>

          <button
            type="button"
            className="login-switch"
            onClick={switchMode}
            disabled={loading}
          >
            {isRegister ? "Login" : "Create account"}
          </button>
        </div>

        {/* SECURITY TEXT */}
        <div className="login-trust">
          <span>🔒</span>
          <span>Your information is secure</span>
        </div>

      </div>
    </div>
  );
}

export default Login;