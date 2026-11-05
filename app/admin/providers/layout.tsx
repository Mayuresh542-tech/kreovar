import type { ReactNode } from "react";
import { privateMetadata } from "../../lib/seo";

export const metadata = privateMetadata("/admin/providers");

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
