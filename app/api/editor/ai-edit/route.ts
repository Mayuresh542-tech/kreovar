import {readEditingBudget,EditTokenBudgetError,type EditingBudget} from '@/app/lib/server/editorTokenBudget';
import {EDIT_STAGES,type EditStage} from '@/app/lib/editor/sequentialEdit';
import {readFootageFrames} from '@/app/lib/server/footageFrames';
import type {FootageFrame} from '@/app/lib/editor/footageContext';
import {withUsage} from '@/app/lib/server/planUsage';
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import {requireOwnedProject} from "@/app/lib/server/projectAccess";
import { aiProjectSnapshot } from "@/app/lib/editor/aiValidation";
import { planAiEdit } from "@/app/lib/server/editorAi";
import {RadoxEditorError} from '@/app/lib/server/radoxService';
import {GroqEditorError} from '@/app/lib/server/editorProvider';
import {projectDuration} from "@/app/lib/editor/model";
import type { EditorProject } from "@/app/lib/editor/model";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const requests = new Map<string, { since: number; count: number; busy: boolean }>();
const MAX_BODY = 1024 * 1024;

async function postHandler(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Sign in to use AI Edit." }, { status: 401 });
    const { data, error } = await getAdminClient().auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Missing edit request." }, { status: 400 });
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) { await reader.cancel(); return NextResponse.json({ error: "This project is too large for AI editing. Use a smaller project." }, { status: 413 }); }
      chunks.push(value);
    }
    let project: EditorProject, instruction: string, selectedClipIds: string[],playheadTime=0,footageFrames:FootageFrame[]=[],fallbackFootageFrames:FootageFrame[]|undefined,completeEdit=false,pipelineStage:EditStage|undefined,editingBudget:EditingBudget|undefined,conversationHistory:{instructions:string;summary:string}[]|undefined;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if(body.pipelineStage!==undefined){if(!EDIT_STAGES.includes(body.pipelineStage))throw Error("Unknown editing stage.");pipelineStage=body.pipelineStage;}
      if (typeof body.instruction !== "string" || !body.instruction.trim() || body.instruction.length > (body.pipelineStage ? 4000 : 2000)) throw new Error("Describe your edit in 1–2000 characters.");
      instruction = body.instruction.trim();
      project = aiProjectSnapshot(body.project);
      editingBudget=readEditingBudget(body.editingJobId,project.id);if(pipelineStage&&!editingBudget)throw Error("An editing job ID is required for the token budget.");
      if (!Array.isArray(body.selectedClipIds) || body.selectedClipIds.length > 300 || body.selectedClipIds.some((id: unknown) => typeof id !== "string" || !Object.hasOwn(project.clips, id))) throw new Error("Invalid clip selection.");
      selectedClipIds = body.selectedClipIds;
      if(body.conversationHistory!==undefined){
        if(!Array.isArray(body.conversationHistory)||body.conversationHistory.some((item:unknown)=>!item||typeof item!=="object"))throw new Error("Invalid conversation history.");
        conversationHistory=body.conversationHistory.slice(-20).map((item:Record<string,unknown>)=>({
          instructions:typeof item.instructions==="string"?item.instructions.slice(0,2000):typeof item.content==="string"?item.content.slice(0,2000):"",
          summary:typeof item.summary==="string"?item.summary.slice(0,2000):""
        }));
      }
      footageFrames=readFootageFrames(body.footageFrames,project,selectedClipIds);if(body.fallbackFootageFrames!==undefined){fallbackFootageFrames=readFootageFrames(body.fallbackFootageFrames,project,selectedClipIds);if(!fallbackFootageFrames.length&&footageFrames.length)throw Error("Fallback observations cannot omit the source footage.");}if(body.completeEdit!==undefined&&typeof body.completeEdit!=="boolean")throw Error("Invalid editing mode.");completeEdit=body.completeEdit===true;
      if(body.playheadTime!==undefined){if(typeof body.playheadTime!=="number"||!Number.isFinite(body.playheadTime)||body.playheadTime<0)throw new Error("Invalid playhead time.");playheadTime=Math.min(projectDuration(project),body.playheadTime);}
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid edit request." }, { status: 400 });
    }
    try{await requireOwnedProject(getAdminClient(),data.user.id,project.id);}catch{return NextResponse.json({error:"This project is unavailable."},{status:404});}
    const now = Date.now();
    for (const [id, s] of requests) if (now - s.since > 90000 || (!s.busy && now - s.since > 60000)) requests.delete(id);
    let state = requests.get(data.user.id);
    if (!state || now - state.since > 60000) {
      state = { since: now, count: 0, busy: false };
      requests.set(data.user.id, state);
    } else if (state.busy && now - state.since > 85000) {
      state.busy = false;
    }
    const maxRequests = pipelineStage ? 30 : 10;
    if (state.busy || state.count >= maxRequests) return NextResponse.json({ error: "Please wait a minute before requesting another AI edit." }, { status: 429, headers: { "Retry-After": "60" } });
    state.count++; state.busy = true;
    release = () => { state.busy = false; };
    const plan = await planAiEdit(project, instruction, selectedClipIds, data.user.id, AbortSignal.any([req.signal, AbortSignal.timeout(80000)]),playheadTime,{footageFrames,fallbackFootageFrames,completeEdit,pipelineStage,editingBudget,conversationHistory});
    return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if(error instanceof EditTokenBudgetError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers:{'Cache-Control':'no-store'}});
    if(error instanceof RadoxEditorError||error instanceof GroqEditorError)return NextResponse.json({error:error.message,code:error.code,...(error.retryAfterSeconds?{retryAfterSeconds:error.retryAfterSeconds}:{})},{status:error.status,headers:{"Cache-Control":"no-store",...(error.retryAfterSeconds?{"Retry-After":String(error.retryAfterSeconds)}:{})}});
    const timeout=error instanceof Error&&["TimeoutError","AbortError"].includes(error.name);
    return NextResponse.json({error:timeout?"AI editing timed out. Your timeline is unchanged; try a smaller request.":"AI could not produce a valid edit. Your timeline is unchanged; try a clearer instruction."},{status:timeout?504:502,headers:{"Cache-Control":"no-store"}});
  } finally { release?.(); }
}

export const POST = withSafeResponse(withBoundedRequest(withUsage(postHandler,'ai')));
