"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useAuthGate } from "../lib/useAuthGate";
import { isAdminEmail } from "../lib/admin";
import AuthShell, { authInputClass, authSubmitClass } from "../components/AuthShell";

export default function AdminUnlock() {
  const { status, session } = useAuthGate();
  const router = useRouter();
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (status === "unauthed") router.replace("/login");
    if (status !== "authed") return;
    // Presentation only. All admin authorization stays on the server.
    if (!isAdminEmail(session?.user.email)) { router.replace("/dashboard"); return; }
    let active = true;
    void supabase.auth.mfa.listFactors().then(({ data, error: problem }) => {
      if (!active) return;
      if (problem) setError("Could not load two-step verification. Please retry.");
      else setFactorId(data?.totp?.find(factor => factor.status === "verified")?.id ?? "");
      setReady(true);
    });
    return () => { active = false; };
  }, [status, session?.user.email, router]);

  async function enroll() {
    setBusy(true); setError("");
    try {
      const { data, error: problem } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer:"Kreovar", friendlyName: `Kreovar admin ${Date.now()}` });
      if (problem || !data) throw new Error();
      setFactorId(data.id); setQr(data.totp.qr_code);
    } catch { setError("Could not set up your authenticator. Please retry or check Supabase MFA settings."); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError("");
    try {
      const { error: problem } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (problem) throw new Error();
      setCode(""); setQr(""); router.replace("/admin"); router.refresh();
    } catch { setError("Code could not be verified. Use the latest Kreovar code and enable automatic date/time on your phone."); }
    finally { setBusy(false); }
  }

  return <AuthShell mode="login"><div className="space-y-5">
    <h2 className="text-xl font-semibold">Protect admin access</h2>
    <p className="text-sm text-slate-500">Administration requires your password and a code from your authenticator app.</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {!ready ? <p role="status">Checking account…</p> : !factorId ? <button type="button" disabled={busy} className={authSubmitClass} onClick={() => void enroll()}>Set up authenticator</button> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void verify(); }}>
      {qr && <div><p className="mb-3 text-sm">Scan this private QR code in your authenticator app, then enter its code. Keep your authenticator backup safe.</p><img src={qr} alt="Private authenticator setup QR code" className="h-48 w-48 bg-white" /></div>}
      <label className="block text-sm" htmlFor="admin-code">Authenticator code</label>
      <input id="admin-code" className={authInputClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={busy} required />
      <button type="submit" className={authSubmitClass} disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Unlock administration"}</button>
    </form>}
  </div></AuthShell>;
}
