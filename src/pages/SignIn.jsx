import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { supabase } from "../components/supabaseClient";
import Logo from "../components/Logo";
import "./SignIn.css";

const rememberedEmail = () => {
  try {
    return window.localStorage.getItem("rememberedAdminEmail") || "";
  } catch {
    return "";
  }
};

export default function SignIn({ authError, recovery = false, onRecoveryComplete }) {
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(Boolean(rememberedEmail()));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (recovery ? password.length < 8 : !password) {
      setError(recovery ? "Use a password with at least 8 characters." : "Enter your password.");
      return;
    }
    if (recovery && password !== confirmPassword) {
      setError("The passwords don't match. Please enter them again.");
      return;
    }

    setBusy(true);
    try {
      if (recovery) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;

        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;

        setPassword("");
        setConfirmPassword("");
        setNotice("Your password has been updated. Sign in with your new password.");
        onRecoveryComplete?.();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) throw signInError;

        try {
          if (remember) window.localStorage.setItem("rememberedAdminEmail", normalizedEmail);
          else window.localStorage.removeItem("rememberedAdminEmail");
        } catch (storageError) {
          console.error("Could not save the remembered email preference:", storageError);
        }
      }
    } catch (requestError) {
      console.error(recovery ? "Could not update the password:" : "Could not sign in:", requestError);
      setError(requestError.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    setError("");
    setNotice("");
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      setError("Enter your email address above to receive a password reset link.");
      return;
    }

    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      });
      if (resetError) throw resetError;
      setNotice("If an account exists for this address, a password reset link has been sent.");
    } catch (requestError) {
      console.error("Could not request a password reset:", requestError);
      setError(requestError.message || "Could not send a password reset email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="signin-page">
      <div className="signin-blob signin-blob-one" aria-hidden="true" />
      <div className="signin-blob signin-blob-two" aria-hidden="true" />

      <section className="signin-card" aria-labelledby="signin-title">
        <div className="signin-logo">
          <Logo />
        </div>
        <h1 id="signin-title">{recovery ? "Choose a new password" : "Welcome back"}</h1>
        <p className="signin-subtitle">
          {recovery
            ? "Enter a new password for your TrackServ account."
            : "Sign in to continue to the TrackServ admin portal."}
        </p>

        <form className="signin-form" onSubmit={handleSubmit}>
          {(authError || error || notice) && (
            <div className={`signin-alert ${error || authError ? "is-error" : "is-success"}`} role="alert">
              {error || authError || notice}
            </div>
          )}

          {!recovery && (
            <div className="signin-field">
              <label htmlFor="admin-email">Email</label>
              <div className="signin-input-wrap">
                <Mail className="signin-input-icon" size={18} aria-hidden="true" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="signin-field">
            <label htmlFor="admin-password">{recovery ? "New password" : "Password"}</label>
            <div className="signin-input-wrap">
              <KeyRound className="signin-input-icon" size={18} aria-hidden="true" />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete={recovery ? "new-password" : "current-password"}
                placeholder={recovery ? "At least 8 characters" : "Enter your password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={recovery ? 8 : undefined}
                required
              />
              <button
                className="signin-show-password"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {recovery && (
            <div className="signin-field">
              <label htmlFor="admin-confirm-password">Confirm new password</label>
              <div className="signin-input-wrap">
                <KeyRound className="signin-input-icon" size={18} aria-hidden="true" />
                <input
                  id="admin-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
                <button
                  className="signin-show-password"
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          {!recovery && (
            <div className="signin-options">
              <label className="signin-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                Remember email
              </label>
              <button
                className="signin-link"
                type="button"
                onClick={sendPasswordReset}
                disabled={busy}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button className="signin-submit" type="submit" disabled={busy}>
            {busy ? <span className="signin-spinner" aria-label="Loading" /> : recovery ? "Update password" : "Sign in"}
          </button>
          {recovery && (
            <button
              className="signin-link signin-back"
              type="button"
              onClick={onRecoveryComplete}
              disabled={busy}
            >
              Return to sign in
            </button>
          )}
        </form>
        <p className="signin-footer">Authorized administrators only</p>
      </section>
    </main>
  );
}
