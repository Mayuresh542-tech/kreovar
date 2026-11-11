"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import { supabase } from "../lib/supabase";
import VeeloxVideoEditor from "../components/editor/VeeloxVideoEditor";

function EditorIndexContent() {
  const { status } = useAuthGate();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [authToken, setAuthToken] = useState<string | null>(null);

  const queryProjectId = searchParams.get("projectId") || undefined;
  const queryTopic = searchParams.get("topic") || undefined;
  const queryScript = searchParams.get("script") || undefined;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (status === "unauthed") { router.replace("/login"); return; }
    if (status === "authed" && !queryProjectId) router.replace("/projects");
  },[status,queryProjectId,router,searchParams]);

  if (status !== "authed" || !queryProjectId) {
    return <AuthLoadingScreen label="Loading AI Video Editor…" />;
  }

  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      <VeeloxVideoEditor
        projectId={queryProjectId || "default_project"}
        projectTitle={queryTopic || (queryProjectId ? `Project Workspace` : "New Video Production")}
        plannerInput={
          queryScript
            ? {
                projectId: queryProjectId || "default_project",
                scriptText: queryScript,
              }
            : undefined
        }
        initialMediaUrl={searchParams.get("video") || searchParams.get("rawVideoUrl") || undefined}
        authToken={authToken}
        onExit={() => {
          if (queryProjectId) {
            router.push(`/projects/${queryProjectId}`);
          } else {
            router.push("/projects");
          }
        }}
      />
    </div>
  );
}

export default function EditorIndexPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading AI Video Editor…" />}>
      <EditorIndexContent />
    </Suspense>
  );
}
