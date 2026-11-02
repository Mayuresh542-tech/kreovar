import {assertRenderSettings} from '@/app/lib/server/render/settingsValidation';
import {createClient} from "@supabase/supabase-js";
import {getAccessToken} from "@/app/lib/server/adminAuth";
import {legacyStoragePath} from "@/app/lib/media/legacyStorage";
import {assertVideoDuration} from "@/app/lib/editor/limits";
import {assertRenderResolution} from "@/app/lib/server/renderResolution";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import {reserveUsage,finishUsage,usageStatus,usageError,PlanLimitError} from '@/app/lib/server/planUsage';
async function refundCreditsForVideoRender(userId:string,id:string|undefined,_reason?:string){void _reason;if(id)await finishUsage(userId,id,false);}

import { trustedRenderMediaUrl } from "@/app/lib/server/render/mediaDownload";
import { renderTimelineWithFFmpeg } from "@/app/lib/server/render/ffmpegRenderer";
import { VeeloxTimelineProject } from "@/app/lib/timeline/types";

export const dynamic = "force-dynamic";

/**
 * Initiates an asynchronous server-side video rendering job.
 * Reserves plan allowance before rendering and commits it after saving the result.
 */
async function postHandler(req: NextRequest) {
  let userId: string | null = null;
  let transactionId: string | undefined;

  try {
    // 1. Authenticate user
    userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to render videos.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      projectId,
      timeline,
    }: {
      projectId?: string;
      timeline?: VeeloxTimelineProject;
    } = body;

    try { assertRenderSettings(timeline?.settings); } catch { return NextResponse.json({error:"Invalid numeric render settings."},{status:400}); }
    if (!timeline || !timeline.tracks || !Array.isArray(timeline.tracks)) {
      return NextResponse.json(
        { error: "Invalid timeline data. Tracks array is required.", code: "INVALID_TIMELINE" },
        { status: 400 }
      );
    }


    try {
      const resolve=async(raw:string)=>{const legacy=legacyStoragePath(raw);if(!legacy)return trustedRenderMediaUrl(raw).href;const scoped=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+getAccessToken(req)}}});const signed=await scoped.storage.from(legacy.bucket).createSignedUrl(legacy.path,120);if(signed.error||!signed.data)throw new Error("Media unavailable.");return trustedRenderMediaUrl(signed.data.signedUrl).href;};
      for (const track of timeline.tracks) for (const item of track.items ?? []) if (item.source) item.source=await resolve(item.source);
      if (timeline.settings?.watermark?.logoUrl) timeline.settings.watermark.logoUrl=await resolve(timeline.settings.watermark.logoUrl);
    } catch { return NextResponse.json({ error: "Use imported or supported stock media URLs for server rendering." }, { status: 400 }); }

    // 2. Validate project ownership if projectId is provided
    if (projectId) {
      const { data: proj, error: projErr } = await adminDb
        .from("projects")
        .select("id, user_id")
        .eq("id", projectId)
        .maybeSingle();

      if (projErr || !proj || proj.user_id !== userId) {
        return NextResponse.json(
          { error: "Forbidden. You do not own this project.", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    }

    try { assertVideoDuration(timeline.duration); for(const track of timeline.tracks)for(const item of track.items??[])assertVideoDuration(Number(item.startTime)+Number(item.duration)); } catch {return NextResponse.json({error:"Videos up to 60 seconds are supported. Trim the timeline before rendering."},{status:400});}
    try{assertRenderResolution(timeline.resolution);}catch{return NextResponse.json({error:'Use a video resolution up to 1080p.'},{status:400});}

    // 3. Atomically reserve server export allowance.
    const entitlement=await usageStatus(userId);if(entitlement.maxResolution<1080)throw new PlanLimitError('Use browser export at 720p on Free, or upgrade for server rendering.');
    transactionId=(await reserveUsage(userId,{exports:1})).reservationId;

    // 4. Create record in render_jobs table
    const { data: job, error: jobErr } = await adminDb
      .from("render_jobs")
      .insert({
        user_id: userId,
        project_id: projectId || null,
        status: "queued",
        progress: 0,
        duration: timeline.duration,
        aspect_ratio: timeline.aspectRatio,
        timeline,
        created_at: new Date().toISOString(),
      })
      .select("id, status, progress, created_at")
      .single();

    if (jobErr || !job) {
      // Refund credits if job creation failed
      await refundCreditsForVideoRender(userId, transactionId, "Failed to initialize render job record");
      return NextResponse.json(
        { error: `Database error creating render job: ${jobErr?.message || "Unknown"}` },
        { status: 500 }
      );
    }

    const jobId = job.id;

    // 5. Fire-and-forget background render worker
    // Do not block the HTTP response!
    (async () => {
      try {
        console.log(`[RenderJob] Starting job ${jobId} for user ${userId}...`);

        await adminDb
          .from("render_jobs")
          .update({ status: "processing", progress: 5 })
          .eq("id", jobId);

        // Progress throttler to prevent spamming database
        let lastReportedProgress = 5;
        const progressHandler = async (progressPercent: number, message: string) => {
          if (progressPercent - lastReportedProgress >= 4 || progressPercent >= 90) {
            lastReportedProgress = progressPercent;
            await adminDb
              .from("render_jobs")
              .update({ progress: progressPercent })
              .eq("id", jobId);
          }
        };

        const renderResult = await renderTimelineWithFFmpeg(timeline, jobId, progressHandler);

        // Persist a downloadable result before charging the allowance.
        const {error:saveError}=await adminDb
          .from("render_jobs")
          .update({
            status: "completed",
            progress: 100,
            output_url: renderResult.outputUrl,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        if(saveError)throw new Error('Rendered output could not be saved.');
        await finishUsage(userId!,transactionId!,true);

        // If project ID exists, also sync output to public.projects
        if (projectId) {
          await Promise.resolve(adminDb
            .from("projects")
            .update({
              export_url: renderResult.outputUrl,
              status: "exported",
              updated_at: new Date().toISOString(),
            })
            .eq("id", projectId)
            .eq("user_id", userId)).catch(()=>{});
        }

        console.log(`[RenderJob] Job ${jobId} completed successfully!`);
      } catch (renderErr: any) {
        console.error(`[RenderJob] Job ${jobId} failed:`, renderErr);

        // Update job record with failure status
        await adminDb
          .from("render_jobs")
          .update({
            status: "failed",
            error: renderErr?.message || "FFmpeg video rendering failed.",
          })
          .eq("id", jobId);

        // Automatic Server-Side Credit Refund
        try {
          await refundCreditsForVideoRender(
            userId!,
            transactionId,
            renderErr?.message || "Render failed during video compilation"
          );
          console.log(`[RenderJob] Restored export allowance for user ${userId}`);
        } catch (refundErr) {
          console.error(`[RenderJob] Failed to refund credits for job ${jobId}:`, refundErr);
        }
      }
    })();

    // 6. Return response immediately with job info
    return NextResponse.json({
      success: true,
      jobId,
      status: "queued",

      message: "Render job queued. Track progress using /api/render/[id].",
    });
  } catch (err: any) {
    if(err instanceof PlanLimitError)return usageError(err);
    console.error("[Render API] Unexpected error:", err);
    if (userId && transactionId) {
      await refundCreditsForVideoRender(userId, transactionId, err?.message || "Unexpected exception");
    }
    return NextResponse.json(
      { error: err?.message || "Failed to process render request." },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
