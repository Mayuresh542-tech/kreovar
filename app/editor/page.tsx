"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import { supabase } from "../lib/supabase";
import { getProjects } from "../lib/services/projectService";
import VeeloxVideoEditor from "../components/editor/VeeloxVideoEditor";

function EditorIndexContent() {
  const { status, session } = useAuthGate();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [authToken, setAuthToken] = useState<string | null>(null);

  const queryProjectId = searchParams.get("projectId") || undefined;
  const queryTopic = searchParams.get("topic") || undefined;
  const queryScript = searchParams.get("script") || undefined;
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(queryProjectId);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (status === "unauthed") {
      router.replace("/login");
      return;
    }
    if (queryProjectId) {
      setActiveProjectId(queryProjectId);
      return;
    }
    if (status === "authed" && session?.user?.id) {
      getProjects(session.user.id)
        .then((list) => {
          if (list && list.length > 0) {
            setActiveProjectId(list[0].id);
          } else {
            setActiveProjectId("demo_creator_starter");
          }
        })
        .catch(() => {
          setActiveProjectId("demo_creator_starter");
        });
    }
  }, [status, session, queryProjectId, router]);

  if (status !== "authed" || !activeProjectId) {
    return <AuthLoadingScreen label="Loading AI Video Editor…" />;
  }

  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      <VeeloxVideoEditor
        projectId={activeProjectId}
        projectTitle={queryTopic || (activeProjectId === "demo_creator_starter" ? "Creator Starter Reel (Demo)" : `Project Workspace`)}
        plannerInput={
          queryScript
            ? {
                projectId: activeProjectId,
                scriptText: queryScript,
              }
            : undefined
        }
        initialMediaUrl={searchParams.get("video") || searchParams.get("rawVideoUrl") || undefined}
        authToken={authToken}
        onExit={() => {
          if (activeProjectId && activeProjectId !== "demo_creator_starter") {
            router.push(`/projects/${activeProjectId}`);
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
