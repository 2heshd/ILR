"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import AccountClasses from './AccountClasses';
import {inviteCodeFromHash,normalizeClassCode,validClassCode} from '@/lib/class-invites';

type SetupStatus = {
  accounts: { configured: boolean };
};

type Props = {
  user: User | null;
  username: string | null;
  cloudReady: boolean;
  status: string;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (username: string, email: string, password: string, classCode?:string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onChangePassword: (password: string) => Promise<void>;
  onChangeUsername: (username: string) => Promise<void>;
};

export default function AccountWorkspace({ user, username: savedUsername, cloudReady, status, onSignIn, onSignUp, onSignOut, onResetPassword, onChangePassword, onChangeUsername }: Props) {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [signupUsername, setSignupUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [classCode,setClassCode]=useState('');
  const [classConsent,setClassConsent]=useState(false);

  useEffect(() => {
    const invited=inviteCodeFromHash(window.location.hash);
    if(invited){setClassCode(invited);if(!user)setMode('signup');}
    fetch("/api/setup", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: SetupStatus) => setSetup(value))
      .catch(() => setSetup({ accounts: { configured: false } }));
  }, []);

  const usernameValid = /^[A-Za-z0-9_]{3,24}$/.test(signupUsername);
  const formValid = mode === "reset"
    ? Boolean(email.trim())
    : Boolean(email.trim() && password.length >= 8 && (mode === "signin" || (usernameValid && password === confirmPassword && (!classCode.trim() || (validClassCode(classCode)&&classConsent)))));
  const usernameValue = savedUsername || (user?.user_metadata?.username ? String(user.user_metadata.username) : "");
  const displayName = usernameValue || user?.email || "your account";
  const accountLabel = usernameValue ? `@${usernameValue}` : displayName;

  async function submit() {
    if (!formValid || busy) return;
    setBusy(true);
    try {
      if (mode === "reset") await onResetPassword(email.trim());
      else if (mode === "signup") await onSignUp(signupUsername.trim(), email.trim(), password, normalizeClassCode(classCode)||undefined);
      else await onSignIn(email.trim(), password);
      setPassword("");
      setConfirmPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile() {
    if (busy) return;
    const usernameChanged = newUsername.trim() && newUsername.trim() !== usernameValue;
    const passwordChanged = newPassword.length >= 8 && newPassword === confirmNewPassword;
    if (!usernameChanged && !passwordChanged) return;
    setBusy(true);
    try {
      if (usernameChanged) await onChangeUsername(newUsername.trim());
      if (passwordChanged) await onChangePassword(newPassword);
      setNewPassword("");
      setConfirmNewPassword("");
    } finally {
      setBusy(false);
    }
  }

  return <section className="account-workspace" id="account">
    <div className="account-overview">
      <span className="next-number">01</span>
      <h2>{user ? "Your progress is saved." : mode === "signup" ? "Create your account." : mode === "reset" ? "Reset your password." : "Keep your course with you."}</h2>
      <p>{user ? `Signed in as ${displayName}. New reviews, vocabulary, source work, and progress are saved automatically. This device remembers your session until you choose Sign out.` : mode === "signup" ? "Choose a unique username, then use your email and password to protect the account." : mode === "reset" ? "Enter the email attached to your account. We will send a secure recovery link." : "Sign in with your email and password to merge the progress already on this device and keep one private course history across your computer, phone, and future sessions."}</p>

      <div className="guided-capabilities">
        <div><span>Private</span><p>Every account can read and update only its own learning data.</p></div>
        <div><span>Automatic</span><p>Changes save after you study; there is no separate upload step.</p></div>
        <div><span>Portable</span><p>Sign in on another device and your course state follows you.</p></div>
        <div><span>Local-safe</span><p>Your current device keeps a local copy if cloud storage is temporarily unavailable.</p></div>
      </div>

      {user ? <><div className="account-action"><span className={`service-state ${cloudReady ? "ready" : "waiting"}`}>{cloudReady ? `Cloud sync active · ${accountLabel}` : "Connecting…"}</span><div className="row"><button className="secondary" onClick={() => { setManageOpen((value) => !value); setNewUsername(usernameValue); }}>{manageOpen ? "Close settings" : "Manage account"}</button><button className="secondary" onClick={() => void onSignOut()}>Sign out</button></div></div>
        {manageOpen && <form className="account-form account-manage" onSubmit={(event) => { event.preventDefault(); void updateProfile(); }}>
          <label>Username<input value={newUsername} onChange={(event) => setNewUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ""))} minLength={3} maxLength={24} autoComplete="username"/><small>Changing this does not affect your saved history.</small></label>
          <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Leave blank to keep it" minLength={8} autoComplete="new-password"/></label>
          {newPassword && <label>Confirm new password<input type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} minLength={8} autoComplete="new-password"/><small>{newPassword === confirmNewPassword ? "Passwords match." : "Passwords must match."}</small></label>}
          <button className="primary" type="submit" disabled={busy || !(/^[A-Za-z0-9_]{3,24}$/.test(newUsername)) || Boolean(newPassword && (newPassword.length < 8 || newPassword !== confirmNewPassword))}>{busy ? "Saving…" : "Save account"}</button>
        </form>}
        <AccountClasses key={user.id} user={user} username={usernameValue}/>
      </> : setup?.accounts.configured ? <form className="account-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {mode === "signup" && <label>Username<input value={signupUsername} onChange={(event) => setSignupUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ""))} placeholder="your_name" autoComplete="username" minLength={3} maxLength={24} required/><small>3–24 letters, numbers, or underscores.</small></label>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required/></label>
        {mode !== "reset" && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 characters minimum" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required/></label>}
        {mode === "signup" && <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Type it again" autoComplete="new-password" minLength={8} required/><small>{confirmPassword && password !== confirmPassword ? "Passwords must match." : ""}</small></label>}
        {mode==='signup'&&<><label>Class code · optional<input value={classCode} onChange={e=>{setClassCode(e.target.value);setClassConsent(false);}} maxLength={48} autoCapitalize="none" autoCorrect="off" placeholder="Invite code from your teacher"/><small>You can also join later from My classes. If email confirmation is required, your code is kept for your first sign-in.</small></label>{classCode.trim()&&<label className="class-consent"><input type="checkbox" checked={classConsent} onChange={e=>setClassConsent(e.target.checked)} required/>Join this class using my username and share my vocabulary practice counts and text, audio, and pattern recall results with its owner. Reading/listening comprehension requires a separate opt-in; answers and notes stay private.</label>}</>}
        <div className="account-form-actions"><button className="primary" type="submit" disabled={!formValid || busy}>{busy ? "Working…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button><button className="secondary" type="button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setPassword(""); setConfirmPassword(""); }}>{mode === "signup" ? "I already have an account" : "Create an account"}</button>{mode === "signin" && <button className="text-button" type="button" onClick={() => setMode("reset")}>Forgot password?</button>}{mode === "reset" && <button className="text-button" type="button" onClick={() => setMode("signin")}>Back to sign in</button>}</div>
      </form> : <div className="account-action setup-needed"><span>Account storage is not connected yet.</span><small>Add the Supabase project URL and public anon key to <code>.env.local</code>, then restart the app.</small></div>}
      {status && <p className="account-status">{status}</p>}
    </div>

    <div className="service-list" aria-label="Connected services">
      <div><span>Account storage</span><strong className={setup?.accounts.configured ? "ready" : "waiting"}>{setup ? setup.accounts.configured ? "Configured" : "Needs Supabase" : "Checking…"}</strong><small>{user ? `Signed in as ${accountLabel}` : "Username · email · password"}</small></div>
    </div>
  </section>;
}
