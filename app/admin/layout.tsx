import {privateMetadata} from "../lib/seo";
export const metadata=privateMetadata("Admin");
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "../lib/server/adminAuth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const result = await requireAdmin(new NextRequest("http://localhost/admin", { headers: new Headers(await headers()) }));
  if ("error" in result) { const body = await result.error.json(); redirect(result.error.status === 401 ? "/login" : body.code === "MFA_REQUIRED" ? "/admin-unlock" : "/dashboard"); }
  return children;
}
