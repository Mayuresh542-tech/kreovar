"use client";

import { use, Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthLoadingScreen from "../../components/AuthLoadingScreen";
import { useAuthGate } from "../../lib/useAuthGate";
import { supabase } from "../../lib/supabase";
import VeeloxVideoEditor from "../../components/editor/VeeloxVideoEditor";

function EditorPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { status } = useAuthGate();
  const router = useRouter();
  const { id } = use(params);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => { if (status === "unauthed") router.replace("/login"); }, [status, router]);

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading video editor…" />;
  }

  return (
    <div className="w-full h-dvh overflow-auto bg-[#F8FAFC]">
      <VeeloxVideoEditor
        projectId={id}
        projectTitle={`Project #${id.slice(0, 8)}`}
        authToken={authToken}
        onExit={() => router.push(`/projects/${id}`)}
      />
    </div>
  );
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading video editor…" />}>
      <EditorPageContent params={params} />
    </Suspense>
  );
}
