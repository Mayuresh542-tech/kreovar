import type { ReactNode } from "react";
import { privateMetadata } from "../../../lib/seo";

export const metadata = privateMetadata("/settings/billing/test");

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
