"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthLoadingScreen from "../components/AuthLoadingScreen";

export default function SavedPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/projects?tab=kits");
  }, [router]);

  return <AuthLoadingScreen label="Navigating to Projects & Content Kits…" />;
}
