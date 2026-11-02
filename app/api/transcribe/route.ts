import {readSpeechLanguage} from "@/app/lib/captions/speechLanguages";
import {reserveUsage,finishUsage,usageError,PlanLimitError} from '@/app/lib/server/planUsage';
import {speechDuration} from '@/app/lib/server/speechDuration';
import {transcribeWithGroq,SpeechProviderError} from "@/app/lib/server/groqTranscription";
import {transcribeLocally} from "@/app/lib/server/localTranscription";
import {getProviderCredential} from "@/app/lib/server/providerRegistry";
import {getStudioAsset} from "@/app/lib/server/assetStore";
import {STUDIO_BUCKET} from "@/app/lib/server/assetPolicy";
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import {exportToSRT} from "@/app/lib/captions/subtitlesParser";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import { fetchBrollDownload } from "@/app/lib/server/brollDownload";
import { groupWordsIntoSegments, TTSWordTimestamp } from "@/app/lib/captions/presets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function postHandler(req: NextRequest) {
 let usageUser:string|undefined,usageId:string|undefined,usageDone=false;
  try {
    const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const userId=token?(await getAdminClient().auth.getUser(token)).data.user?.id:null;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const provider=process.env.TRANSCRIPTION_PROVIDER||"elevenlabs";
    if(!["local","groq","elevenlabs"].includes(provider))return NextResponse.json({error:"Invalid transcription provider configuration."},{status:503});
    const local=provider==="local",groq=provider==="groq";
    const groqKey=groq?(process.env.GROQ_TRANSCRIPTION_API_KEY?.trim()||await getProviderCredential("groq")):null;
    if(groq&&!groqKey)return NextResponse.json({error:"Speech transcription is not configured."},{status:503});
    const elevenLabsKey = local||groq?null:await getProviderCredential("elevenlabs");

    if (!local && !groq && !elevenLabsKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured for transcription." },
        { status: 503 }
      );
    }

    if(Number(req.headers.get("content-length"))>101*1024*1024)return NextResponse.json({error:"Transcription supports files up to 100 MB."},{status:413});
    const signal=AbortSignal.any([req.signal,AbortSignal.timeout(80000)]);
    const contentType = req.headers.get("content-type") || "";
    let speechLanguage:string|undefined;
    let fileBuffer: Buffer | null = null;
    let fileName = "video_audio.mp4";
    let mimeType = "video/mp4";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      try{speechLanguage=readSpeechLanguage(formData.get("language"));}catch{return NextResponse.json({error:"Choose a supported caption language."},{status:400});}
      const file = formData.get("file") as File | null;
      const videoUrl = formData.get("videoUrl") as string | null;

      if (file instanceof File) {
        if(file.size>100*1024*1024)return NextResponse.json({error:"Transcription supports files up to 100 MB."},{status:413});
        if(!/^(audio|video)\//.test(file.type))return NextResponse.json({error:"Choose a video or audio file."},{status:400});
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        fileName = file.name;
        mimeType = file.type || "video/mp4";
      } else if (videoUrl) {
        // Fetch from public video URL
        const match=typeof videoUrl==="string"?videoUrl.match(/^\/api\/assets\/([0-9a-f-]{36})\/file$/i):null;
        let videoRes:Response;
        if(match){const asset=await getStudioAsset(userId,match[1]);if(!asset||!['audio','video'].includes(asset.kind))return NextResponse.json({error:"Asset unavailable."},{status:404});const original=await getAdminClient().storage.from(STUDIO_BUCKET).download(asset.storage_path,{}, {signal});signal.throwIfAborted();if(original.error||!original.data)throw new Error("Could not load this original.");videoRes=new Response(original.data,{headers:{"Content-Type":asset.mime}});fileName=asset.filename;mimeType=asset.mime;}
        else videoRes = await fetchBrollDownload(videoUrl,"footage.mp4",signal);
        if (!videoRes.ok) {
          throw new Error(`Failed to download video from URL: status ${videoRes.status}`);
        }
        const ab = await videoRes.arrayBuffer();
        fileBuffer = Buffer.from(ab);
        if(!match)fileName = videoUrl.split("/").pop() || "footage.mp4";
      }
    } else {
      const body = await req.json().catch(() => ({}));
      try{speechLanguage=readSpeechLanguage(body.language);}catch{return NextResponse.json({error:"Choose a supported caption language."},{status:400});}
      const videoUrl = body.videoUrl;
      if (videoUrl) {
        const match=typeof videoUrl==="string"?videoUrl.match(/^\/api\/assets\/([0-9a-f-]{36})\/file$/i):null;
        let videoRes:Response;
        if(match){const asset=await getStudioAsset(userId,match[1]);if(!asset||!['audio','video'].includes(asset.kind))return NextResponse.json({error:"Asset unavailable."},{status:404});const original=await getAdminClient().storage.from(STUDIO_BUCKET).download(asset.storage_path,{}, {signal});signal.throwIfAborted();if(original.error||!original.data)throw new Error("Could not load this original.");videoRes=new Response(original.data,{headers:{"Content-Type":asset.mime}});fileName=asset.filename;mimeType=asset.mime;}
        else videoRes = await fetchBrollDownload(videoUrl,"footage.mp4",signal);
        if (!videoRes.ok) {
          throw new Error(`Failed to download video from URL: status ${videoRes.status}`);
        }
        const ab = await videoRes.arrayBuffer();
        fileBuffer = Buffer.from(ab);
        if(!match)fileName = videoUrl.split("/").pop() || "footage.mp4";
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json(
        { error: "No video or audio file provided for transcription." },
        { status: 400 }
      );
    }

    let seconds:number;try{seconds=await speechDuration(fileBuffer,signal);}catch{return NextResponse.json({error:"Audio duration could not be verified. Use a supported speech audio file up to four minutes."},{status:422});}
    usageUser=userId;usageId=(await reserveUsage(userId,{caption_seconds:seconds})).reservationId;
    let elevenData;
    if(local)elevenData=await transcribeLocally(fileBuffer,signal,speechLanguage);
    else if(groq)elevenData=await transcribeWithGroq(fileBuffer,mimeType,groqKey!,signal,speechLanguage);
    else {
    // Existing external provider is used only when explicitly selected by server configuration.
    const elevenFormData = new FormData();
    elevenFormData.append("model_id", "scribe_v1");
    if(speechLanguage)elevenFormData.append("language_code",speechLanguage);

    // Convert Buffer to Blob
    const audioBlob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    elevenFormData.append("file", audioBlob, fileName);


    const elevenRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey!,
      },
      body: elevenFormData,
      signal,
    });

    if (!elevenRes.ok) {
      const errJson = await elevenRes.json().catch(() => ({}));
      console.warn("[Transcribe API] ElevenLabs Scribe returned error:", elevenRes.status, errJson);
      return NextResponse.json(
        {
          error:
            errJson?.detail?.message ||
            errJson?.message ||
            `ElevenLabs transcription failed with status ${elevenRes.status}`,
        },
        { status: elevenRes.status }
      );
    }

    elevenData = await elevenRes.json();
    }
    const rawWords = elevenData.words || [];

    // Filter and format word timestamps
    const words: TTSWordTimestamp[] = rawWords
      .filter((w: {type?:string;text?:string;start?:number;end?:number}) => w.type !== "audio_event" && typeof w.text === "string" && w.text.trim())
      .map((w: {text:string;start?:number;end?:number}) => ({
        word: String(w.text).trim(),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? (w.start ?? 0) + 0.3),
      }));

    const fullTranscript =
      elevenData.text || words.map((w) => w.word).join(" ");

    // Group words into natural kinetic caption segments (3-4 words per segment)
    const segments = groupWordsIntoSegments(words, 4);

    if(!segments.length)return NextResponse.json({error:"No speech was found."},{status:422});
    const subtitle=exportToSRT(segments.map(s=>({text:s.text,startTime:s.start,endTime:s.end})));
    const asset=await saveStudioAsset(userId,Buffer.from(subtitle),"application/x-subrip","Transcription",local?"local-whisper":groq?"groq-whisper-large-v3":"elevenlabs",{timingSource:"speech"});
    await finishUsage(userId,usageId,true);usageDone=true;
    return NextResponse.json({
      asset,
      success: true,
      transcript: fullTranscript,
      words,
      segments,
      duration: elevenData.audio_duration_secs || (words.length > 0 ? words[words.length - 1].end : 0),
      language: elevenData.language_code || "eng",
    });
  } catch (err: unknown) {
    if(err instanceof PlanLimitError)return usageError(err);
    if(err instanceof SpeechProviderError)return NextResponse.json({error:err.message},{status:err.status,headers:err.retryAfter?{"Retry-After":err.retryAfter}:{}});
    console.error("[Transcribe API] Transcription failed:", err instanceof Error?{name:err.name,message:err.message.replace(/https?:\/\/\S+/g,"[service]").slice(0,200)}:"Error");
    if(err instanceof Error&&err.message.startsWith("Speech timing is unavailable"))return NextResponse.json({error:"Some speech words have no usable timing. Please retry transcription."},{status:422});
    if(err instanceof Error&&err.message==="LOCAL_TRANSCRIPTION_BUSY")return NextResponse.json({error:"Local transcription is busy. Please retry shortly."},{status:503,headers:{"Retry-After":"5"}});
    if(err instanceof Error&&err.message==="LOCAL_TRANSCRIPTION_UNAVAILABLE")return NextResponse.json({error:"Local speech engine is unavailable. Check Python, faster-whisper and the cached model. No external service was called."},{status:503});
    return NextResponse.json(
      { error: err instanceof Error && ["TimeoutError","AbortError"].includes(err.name) ? "Transcription timed out. Try a shorter clip." : "Failed to transcribe audio from video." },
      { status: err instanceof Error && err.name === "TimeoutError" ? 504 : err instanceof Error && err.name === "AbortError" ? 408 : 500 }
    );
  }finally{if(usageUser&&usageId&&!usageDone)await finishUsage(usageUser,usageId,false).catch(()=>{});}
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
