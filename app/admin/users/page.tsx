"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";
import AdminHeader from "@/app/components/admin/AdminHeader";

interface UserRow {
  id: string;
  email: string;
  source: "direct" | "whop";
  sourceBadge: "MAIN SITE" | "WHOP";
  plan: string;
  status: string;
  credits: number;
  joined: string;
  lastActive: string | null;
  revenue: number;
  externalCustomerId: string | null;
}

function AdminUsersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") || "all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("joined_desc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalCount: 0, totalPages: 1 });

  // Action modal state
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [actionType, setActionType] = useState<"credits" | "plan">("credits");
  const [creditDelta, setCreditDelta] = useState("100");
  const [newPlanSelection, setNewPlanSelection] = useState("creator");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !session) return;
    loadUsers();
  }, [isAdmin, session, search, sourceFilter, planFilter, statusFilter, sortBy, page]);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        search,
        source: sourceFilter,
        plan: planFilter,
        status: statusFilter,
        sort: sortBy,
        page: page.toString(),
        limit: "15",
      });

      const res = await fetch(`/api/admin/users?${q.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Error ${res.status}`);
      }

      const json = await res.json();
      setUsers(json.users || []);
      setPagination(json.pagination || { page: 1, limit: 15, totalCount: 0, totalPages: 1 });
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminAction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser || !session) return;

    setActionLoading(true);
    setActionSuccess(null);
    setError(null);

    try {
      const payload: any = {
        userId: selectedUser.id,
        action: actionType === "credits" ? "adjust_credits" : "change_plan",
      };

      if (actionType === "credits") {
        payload.creditAdjustment = parseInt(creditDelta, 10);
      } else {
        payload.newPlan = newPlanSelection;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");

      setActionSuccess(json.message || "Action executed successfully.");
      setTimeout(() => {
        setSelectedUser(null);
        setActionSuccess(null);
        loadUsers();
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (!isAdmin) {
    return <AuthLoadingScreen label="Validating administrator clearance…" />;
  }

  return (
    <StudioShell active="settings">
      <div className="max-w-7xl mx-auto w-full py-6 space-y-6">
        <AdminHeader
          title="Creator Identity &amp; Subscription Directory"
          subtitle="Detailed multi-tenant user table with acquisition source distinction (MAIN SITE vs WHOP), plan filtering, and credit controls."
          badge="DATABASE REGISTRY"
        />

        {/* Filter & Search Deck */}
        <div className="p-5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-4 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Search Email or User ID
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by email..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#12151E] border border-[#202534] text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            {/* Filter by Source */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Acquisition Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#12151E] border border-[#202534] text-white text-xs focus:outline-none focus:border-sky-500 font-mono cursor-pointer"
              >
                <option value="all">All Sources</option>
                <option value="direct">Main Site (Direct)</option>
                <option value="whop">Whop Store</option>
              </select>
            </div>

            {/* Filter by Plan */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Subscription Plan
              </label>
              <select
                value={planFilter}
                onChange={(e) => {
                  setPlanFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#12151E] border border-[#202534] text-white text-xs focus:outline-none focus:border-sky-500 font-mono cursor-pointer"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="creator">Creator</option>
                <option value="studio">Studio</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Sort Order
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#12151E] border border-[#202534] text-white text-xs focus:outline-none focus:border-sky-500 font-mono cursor-pointer"
              >
                <option value="joined_desc">Joined: Newest First</option>
                <option value="joined_asc">Joined: Oldest First</option>
                <option value="credits_desc">Credits: Highest First</option>
                <option value="revenue_desc">Revenue: Highest First</option>
                <option value="last_active_desc">Last Active: Recent</option>
              </select>
            </div>
          </div>
        </div>

        {/* User Table Card */}
        <div className="rounded-3xl bg-[#0D0F15] border border-[#202534] overflow-hidden shadow-xl">
          <div className="p-4 sm:p-5 border-b border-[#202534] flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              Users Registry ({pagination.totalCount} matches)
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#202534] text-slate-400 font-mono text-[11px] bg-[#12151E]/60">
                  <th className="py-3 px-4 font-normal">User</th>
                  <th className="py-3 px-4 font-normal">Email</th>
                  <th className="py-3 px-4 font-normal">Source</th>
                  <th className="py-3 px-4 font-normal">Plan</th>
                  <th className="py-3 px-4 font-normal">Subscription Status</th>
                  <th className="py-3 px-4 font-normal text-right">Credits</th>
                  <th className="py-3 px-4 font-normal">Joined</th>
                  <th className="py-3 px-4 font-normal">Last Active</th>
                  <th className="py-3 px-4 font-normal text-right">Est. Revenue</th>
                  <th className="py-3 px-4 font-normal text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1F2C]">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400 font-mono text-xs">
                      Loading user records…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500 font-mono text-xs">
                      No creators match current filters.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isWhop = u.source === "whop";

                    return (
                      <tr key={u.id} className="hover:bg-[#12151E] transition">
                        {/* User ID */}
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                          {u.id.slice(0, 8)}…
                        </td>

                        {/* Email */}
                        <td className="py-3 px-4 font-medium text-white max-w-[200px] truncate">
                          {u.email}
                        </td>

                        {/* Source Badge: MAIN SITE vs WHOP */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              isWhop
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isWhop ? "bg-amber-400" : "bg-sky-400"
                              }`}
                            />
                            <span>{u.sourceBadge}</span>
                          </span>
                        </td>

                        {/* Plan */}
                        <td className="py-3 px-4">
                          <span className="font-mono text-[11px] capitalize text-slate-300">
                            {u.plan}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase border ${
                              u.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>

                        {/* Credits */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {u.credits.toLocaleString()}
                        </td>

                        {/* Joined */}
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                          {new Date(u.joined).toLocaleDateString()}
                        </td>

                        {/* Last Active */}
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                          {u.lastActive ? new Date(u.lastActive).toLocaleDateString() : "Never"}
                        </td>

                        {/* Revenue */}
                        <td className="py-3 px-4 text-right font-mono text-slate-300 font-semibold">
                          ${u.revenue}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="px-2.5 py-1 rounded-lg bg-[#181D2A] hover:bg-[#22293B] text-slate-300 hover:text-white font-mono text-[11px] border border-[#283146] transition cursor-pointer"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-[#202534] flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3.5 py-1.5 rounded-xl bg-[#12151E] hover:bg-[#181D2A] text-slate-300 text-xs font-mono border border-[#202534] disabled:opacity-40 cursor-pointer"
            >
              ← Previous
            </button>
            <span className="text-xs font-mono text-slate-400">
              Page {page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages || loading}
              className="px-3.5 py-1.5 rounded-xl bg-[#12151E] hover:bg-[#181D2A] text-slate-300 text-xs font-mono border border-[#202534] disabled:opacity-40 cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Action Modal (Grant Credits / Change Plan) */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="max-w-md w-full p-6 sm:p-7 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#202534] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Manage Creator Privileges
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400 truncate max-w-[280px]">
                    {selectedUser.email}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-slate-400 hover:text-white text-base font-bold"
                >
                  ✕
                </button>
              </div>

              {actionSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                  ✓ {actionSuccess}
                </div>
              )}

              {/* Action Type Toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActionType("credits")}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition ${
                    actionType === "credits"
                      ? "bg-sky-500 text-white"
                      : "bg-[#12151E] text-slate-400 border border-[#202534]"
                  }`}
                >
                  Adjust Credits
                </button>
                <button
                  type="button"
                  onClick={() => setActionType("plan")}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition ${
                    actionType === "plan"
                      ? "bg-sky-500 text-white"
                      : "bg-[#12151E] text-slate-400 border border-[#202534]"
                  }`}
                >
                  Override Plan
                </button>
              </div>

              <form onSubmit={handleAdminAction} className="space-y-4">
                {actionType === "credits" ? (
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-slate-300 block">
                      Credit Delta (+ to grant, - to deduct)
                    </label>
                    <input
                      type="number"
                      value={creditDelta}
                      onChange={(e) => setCreditDelta(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#12151E] border border-[#202534] text-white font-mono text-sm focus:border-sky-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      Current balance: {selectedUser.credits} pts. Appends a cryptographically recorded transaction.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-slate-300 block">
                      Select Plan Tier
                    </label>
                    <select
                      value={newPlanSelection}
                      onChange={(e) => setNewPlanSelection(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#12151E] border border-[#202534] text-white font-mono text-sm focus:border-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="free">Free (30 credits/mo)</option>
                      <option value="creator">Creator (400 credits/mo - $19)</option>
                      <option value="studio">Studio (1,500 credits/mo - $49)</option>
                    </select>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl bg-white hover:bg-slate-100 text-zinc-950 font-bold text-xs uppercase font-mono transition disabled:opacity-50"
                  >
                    {actionLoading ? "Executing…" : "Confirm Change"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading user registry…" />}>
      <AdminUsersContent />
    </Suspense>
  );
}
