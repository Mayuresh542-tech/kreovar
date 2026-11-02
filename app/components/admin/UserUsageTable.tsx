'use client';

import { useEffect, useState } from 'react';
import { USAGE_LABELS, type UsageFeature, type UsageStatus } from '@/app/config/allowances';

type Row = { id: string; email: string; lastSignIn: string | null; usage: UsageStatus | null; error: string | null };
type Result = { users: Row[]; pagination: { page: number; total: number; totalPages: number }; updatedAt: string };
const features = Object.keys(USAGE_LABELS) as UsageFeature[];
const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-40';
function amount(value: number, feature: UsageFeature) {
  return feature === 'caption_seconds' ? `${(value / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} min` : value.toLocaleString();
}

export default function UserUsageTable({ token }: { token: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${page}:${search}:${refresh}:${token}`;
  const [loadedKey, setLoadedKey] = useState('');
  const loading = loadedKey !== requestKey;
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), search });
    fetch(`/api/admin/user-usage?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load user usage.');
        if (!controller.signal.aborted) { setResult(data); setError(''); }
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message || 'Could not load user usage.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadedKey(requestKey); });
    return () => controller.abort();
  }, [token, page, search, refresh, requestKey]);

  return <section aria-labelledby="user-usage-title" className="space-y-4 rounded-2xl border border-slate-700 bg-[#0D0F15] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="user-usage-title" className="text-xl font-bold text-white">User usage &amp; allowances</h2>
        <p className="mt-1 text-sm text-slate-400">Each user&apos;s current allowance period. Includes completed usage and active reservations; failed or expired reservations do not consume allowance.</p></div>
      <button type="button" className={button} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh user usage</button>
    </div>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(draft.trim()); }}>
      <input aria-label="Search user usage by email or user ID" className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" value={draft} maxLength={254} onChange={event => setDraft(event.target.value)} placeholder="Search email or user ID" />
      <button className={button} type="submit">Search users</button>
    </form>
    {loading ? <p role="status" className="text-sm text-slate-400">Loading user usage…</p> : error ? <div role="alert" className="text-sm text-rose-300">{error} <button className="underline" onClick={() => setRefresh(value => value + 1)}>Retry</button></div> : result && <>
      <div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-xs text-slate-200">
        <caption className="sr-only">User plan, active projects, feature usage and monthly allowance limits</caption>
        <thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-3">User / last sign-in</th><th className="p-3">Plan / resets</th><th className="p-3">Active projects</th>{features.map(feature => <th key={feature} className="p-3">{USAGE_LABELS[feature]}</th>)}</tr></thead>
        <tbody>{result.users.map(user => <tr key={user.id} className="border-b border-slate-800 align-top">
          <th scope="row" className="p-3 font-normal"><div className="break-all font-semibold text-white">{user.email}</div><div className="mt-1 break-all text-[10px] text-slate-500">{user.id}</div><div className="mt-1 text-slate-400">{user.lastSignIn ? new Date(user.lastSignIn).toLocaleString() : 'Never signed in'}</div></th>
          {!user.usage ? <td colSpan={features.length + 2} className="p-3 text-amber-300">{user.error}</td> : <>
            <td className="p-3"><strong>{user.usage.unlimited ? 'Admin · unlimited' : user.usage.plan === 'pro' ? 'Pro' : 'Free'}</strong><div className="mt-1 text-slate-400">{new Date(user.usage.periodEnd).toLocaleString()}</div></td>
            <td className="p-3">{user.usage.activeProjects.toLocaleString()} / {user.usage.unlimited ? 'Unlimited' : user.usage.projectLimit}</td>
            {features.map(feature => {
              const used = user.usage!.used[feature] || 0;
              const limit = user.usage!.unlimited ? null : user.usage!.limits[feature];
              return <td key={feature} className="p-3"><span className={limit != null && used >= limit ? 'font-semibold text-amber-300' : ''}>{amount(used, feature)} / {limit == null ? 'Unlimited' : amount(limit, feature)}</span>
                {limit != null && <div className="mt-1 text-[10px] text-slate-500">{amount(Math.max(0, limit - used), feature)} remaining</div>}</td>;
            })}</>}
        </tr>)}</tbody>
      </table>{result.users.length === 0 && <p className="p-5 text-sm text-slate-400">No users match this search.</p>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>{result.pagination.total.toLocaleString()} users · Updated {new Date(result.updatedAt).toLocaleTimeString()}</span><div className="flex items-center gap-3">
        <button className={button} disabled={result.pagination.page <= 1} onClick={() => setPage(result.pagination.page - 1)}>Previous users</button><span>Page {result.pagination.page} of {result.pagination.totalPages}</span><button className={button} disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => setPage(result.pagination.page + 1)}>Next users</button>
      </div></div>
    </>}
  </section>;
}
