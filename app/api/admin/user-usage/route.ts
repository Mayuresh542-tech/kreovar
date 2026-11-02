import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminClient } from '@/app/lib/server/adminAuth';
import { positivePage, readUserUsage } from '@/app/lib/server/adminUserUsage';
import { withSafeResponse } from '@/app/lib/server/safeResponse';

export const dynamic = 'force-dynamic';
export const GET = withSafeResponse(async (req: NextRequest) => {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  const page = positivePage(req.nextUrl.searchParams.get('page'));
  const search = (req.nextUrl.searchParams.get('search') || '').trim().toLowerCase().slice(0, 254);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(25000)]);
  const result = await readUserUsage(getAdminClient(signal), page, search);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
});
