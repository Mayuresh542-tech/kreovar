import {legacyStorageEndpoint} from "@/app/lib/media/legacyStorage";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Checks the status and progress of an ongoing or completed render job.
 * Enforces ownership check (user can only query their own jobs).
 */
async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;
    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job ID.", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const adminDb = getAdminClient();
    const { data: job, error } = await adminDb
      .from("render_jobs")
      .select("id, user_id, project_id, status, progress, output_url, error, duration, aspect_ratio, created_at, completed_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json(
        { error: "Render job not found.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Security check: verify job ownership
    if (job.user_id !== userId) {
      return NextResponse.json(
        { error: "Forbidden. You cannot view this render job.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        projectId: job.project_id,
        status: job.status,
        progress: job.progress,
        outputUrl: job.output_url?legacyStorageEndpoint(job.output_url):null,
        error: job.error,
        duration: job.duration,
        aspectRatio: job.aspect_ratio,
        createdAt: job.created_at,
        completedAt: job.completed_at,
      },
    });
  } catch (err: any) {
    console.error("[Render API] Error fetching job status:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch render status." },
      { status: 500 }
    );
  }
}

export const GET = withSafeResponse(getHandler);
