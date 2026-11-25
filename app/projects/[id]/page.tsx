"use client";

import { use, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import AuthLoadingScreen from "../../components/AuthLoadingScreen";

function DirectEditorRedirect({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  useEffect(() => {
    if (id) {
      router.replace(`/editor?projectId=${encodeURIComponent(id)}`);
    } else {
      router.replace("/projects");
    }
  }, [id, router]);

  return <AuthLoadingScreen label="Opening Editor…" />;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Opening Editor…" />}>
      <DirectEditorRedirect params={params} />
    </Suspense>
  );
}
