"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

type SetupStatus = {
  accounts: { configured: boolean };
};

type Props = {
  user: User | null;
  username: string | null;
  cloudReady: boolean;
  status: string;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (username: string, email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export default function AccountWorkspace({ user, username: savedUsername, cloudReady, status, onSignIn, onSignUp, onSignOut }: Props) {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupUsername, setSignupUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: SetupStatus) => setSetup(value))
      .catch(() => setSetup({ accounts: { configured: false } }));
  }, []);

  const usernameValid = /^[A-Za-z0-9_]{3,24}$/.test(signupUsername);
  const formValid = Boolean(email.trim() && password.length >= 8 && (mode === "signin" || usernameValid));
  const usernameValue = savedUsername || (user?.user_metadata?.username ? String(user.user_metadata.username) : "");
  const displayName = usernameValue || user?.email || "your account";
  const accountLabel = usernameValue ? `@${usernameValue}` : displayName;

  async function submit() {
    if (!formValid || busy) return;
    setBusy(true);
    try {
      if (mode === "signup") await onSignUp(signupUsername.trim(), email.trim(), password);
      else await onSignIn(email.trim(), password);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return <section className="account-workspace">
    <div className="account-overview">
      <span className="next-number">01</span>
      <h2>{user ? "Your progress is saved." : mode === "signup" ? "Create your account." : "Keep your course with you."}</h2>
      <p>{user ? `Signed in as ${displayName}. New reviews, vocabulary, source work, and progress are saved automatically.` : mode === "signup" ? "Choose a public username, then use your email and password to protect the account." : "Sign in with your email and password to keep one private course history across your computer, phone, and future sessions."}</p>

      <div className="guided-capabilities">
        <div><span>Private</span><p>Every account can read and update only its own learning data.</p></div>
        <div><span>Automatic</span><p>Changes save after you study; there is no separate upload step.</p></div>
        <div><span>Portable</span><p>Sign in on another device and your course state follows you.</p></div>
        <div><span>Local-safe</span><p>Your current device keeps a local copy if cloud storage is temporarily unavailable.</p></div>
      </div>

      {user ? <div className="account-action"><span className={`service-state ${cloudReady ? "ready" : "waiting"}`}>{cloudReady ? `Cloud sync active · ${accountLabel}` : "Connecting…"}</span><button className="secondary" onClick={() => void onSignOut()}>Sign out</button></div> : setup?.accounts.configured ? <form className="account-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {mode === "signup" && <label>Username<input value={signupUsername} onChange={(event) => setSignupUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ""))} placeholder="your_name" autoComplete="username" minLength={3} maxLength={24} required/><small>3–24 letters, numbers, or underscores.</small></label>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required/></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 characters minimum" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required/></label>
        <div className="account-form-actions"><button className="primary" type="submit" disabled={!formValid || busy}>{busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}</button><button className="secondary" type="button" onClick={() => { setMode((value) => value === "signin" ? "signup" : "signin"); setPassword(""); }}>{mode === "signin" ? "Create an account" : "I already have an account"}</button></div>
      </form> : <div className="account-action setup-needed"><span>Account storage is not connected yet.</span><small>Add the Supabase project URL and public anon key to <code>.env.local</code>, then restart the app.</small></div>}
      {status && <p className="account-status">{status}</p>}
    </div>

    <div className="service-list" aria-label="Connected services">
      <div><span>Account storage</span><strong className={setup?.accounts.configured ? "ready" : "waiting"}>{setup ? setup.accounts.configured ? "Configured" : "Needs Supabase" : "Checking…"}</strong><small>{user ? `Signed in as ${accountLabel}` : "Username · email · password"}</small></div>
    </div>
  </section>;
}
