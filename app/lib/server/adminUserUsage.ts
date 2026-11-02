import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsageStatus } from '../../config/allowances';

export function positivePage(value: string | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 1000000) : 1;
}

/** Enumerate Auth pages so search never silently excludes users after the first 1,000. */
export async function readUserUsage(db: SupabaseClient, page: number, search: string) {
  const users: Array<{ id: string; email?: string; created_at: string; last_sign_in_at?: string }> = [];
  for (let authPage = 1; ; authPage++) {
    const { data, error } = await db.auth.admin.listUsers({ page: authPage, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const filtered = users.filter(user => !search || `${user.email ?? ''} ${user.id}`.toLowerCase().includes(search));
  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, totalPages);
  const rows = await Promise.all(filtered.slice((currentPage - 1) * 25, currentPage * 25).map(async user => {
    const { data, error } = await db.rpc('kreovar_usage_status', { p_user_id: user.id });
    return {
      id: user.id, email: user.email || '(no email)', joined: user.created_at,
      lastSignIn: user.last_sign_in_at || null,
      usage: error || !data ? null : data as UsageStatus,
      error: error || !data ? 'Usage temporarily unavailable' : null,
    };
  }));
  return { users: rows, pagination: { page: currentPage, limit: 25, total: filtered.length, totalPages }, updatedAt: new Date().toISOString() };
}
