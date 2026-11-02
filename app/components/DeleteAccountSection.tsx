"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function DeleteAccountSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const submitting = useRef(false);

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || confirmation !== "DELETE" || !password) return;
    submitting.current = true; setBusy(true); setError(""); setCode("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== userId) throw new Error("Your session expired. Sign in again before deleting your account.");
      const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ confirmation, password }) });
      const result = await response.json();
      if (!response.ok || !result.deleted) { setCode(result.code || ""); throw new Error(result.error || "Deletion could not finish. Please retry."); }
      setPassword("");
      const { clearDeletedAccountDeviceData } = await import("../lib/auth/deletedAccount");
      await clearDeletedAccountDeviceData(userId).catch(() => {});
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      // Hard navigation clears authenticated in-memory state and editor URLs.
      window.location.replace("/login?account=deleted");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Deletion could not finish. Please retry.");
      setPassword(""); setBusy(false); submitting.current = false;
    }
  }

  return <section aria-labelledby="delete-account-heading" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5 space-y-3">
    <h3 id="delete-account-heading" className="text-sm font-bold text-rose-400">Delete account</h3>
    <p className="text-xs leading-relaxed text-slate-400">Permanently delete your account, projects and saved library assets. This cannot be undone. Download anything you want to keep first. Some payment and security records may be retained.</p>
    {!open ? <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-rose-500/40 px-4 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-rose-400">Delete my account</button> :
      <form onSubmit={deleteAccount} aria-busy={busy} className="space-y-4" aria-label="Confirm account deletion">
        <p className="text-xs text-slate-400">Have a paid subscription? Cancel renewal in <a href="https://whop.com/orders/" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">Whop billing</a> first. Account deletion does not issue a refund. Close your other editor tabs before continuing.</p>
        <div><label htmlFor="delete-account-password" className="mb-1 block text-xs font-semibold text-white">Current password</label><input autoFocus id="delete-account-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="w-full rounded-lg border border-[#202534] bg-[#12151E] px-3 py-2.5 text-sm text-white focus:outline-2 focus:outline-rose-400" /></div>
        <div><label htmlFor="delete-account-confirmation" className="mb-1 block text-xs font-semibold text-white">Type DELETE to confirm</label><input id="delete-account-confirmation" autoComplete="off" spellCheck={false} required pattern="DELETE" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} className="w-full rounded-lg border border-[#202534] bg-[#12151E] px-3 py-2.5 text-sm text-white focus:outline-2 focus:outline-rose-400" /></div>
        {error && <div role="alert" className="text-xs text-rose-400 leading-relaxed">{error}{code === "MFA_REQUIRED" && <Link href="/admin-unlock" className="ml-1 text-sky-400 underline">Verify two-step authentication</Link>}</div>}
        <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || confirmation !== "DELETE" || !password} className="rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-rose-400">{busy ? "Deleting account…" : "Permanently delete account"}</button><button type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(""); setConfirmation(""); setError(""); setCode(""); }} className="rounded-lg border border-[#202534] px-4 py-2.5 text-xs font-semibold text-slate-300 disabled:opacity-50">Keep my account</button></div>
        {busy && <p role="status" className="text-xs text-slate-400">Removing your saved files and account. Keep this tab open.</p>}
      </form>}
  </section>;
}
