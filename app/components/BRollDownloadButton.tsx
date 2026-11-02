"use client";
import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Check } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import {uploadAssetFile} from "@/app/lib/assets/client";
import {readMediaDuration} from "@/app/lib/media/metadata";
import { downloadMedia } from "@/app/lib/media/download";

export default function BRollDownloadButton({ url, name = "veelox-broll", className = "", authToken }: { url: string; name?: string; className?: string; authToken?: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setState("loading"); setError(undefined);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || authToken;
      if (!token) throw new Error("Sign in to download B-roll.");
      await downloadMedia(url, name, token, AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]), url.startsWith("/api/assets/")?undefined:async file=>{await uploadAssetFile(file,{duration:await readMediaDuration(file)},controller.signal);});
      if (!controller.signal.aborted) setState("done");
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "Download timed out. Please retry." : error instanceof TypeError ? "Download was interrupted. Please retry." : error instanceof Error ? error.message : "Download failed. Please retry.");
        setState("idle");
      }
    } finally { if (pending.current === controller) pending.current = null; }
  }
  return <div onClick={event => event.stopPropagation()}>
    <button type="button" className={className} aria-label={`Download ${name}`} aria-busy={state === "loading"} disabled={state === "loading" || !url} onClick={() => void download()}>
      {state === "loading" ? <LoaderCircle size={14} className="animate-spin" /> : state === "done" ? <Check size={14} /> : <Download size={14} />}
      <span>{state === "loading" ? "Downloading…" : state === "done" ? "Download again" : "Download"}</span>
    </button>
    {error && <p role="alert" className="mt-1 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>}
    {state === "done" && <span role="status" className="sr-only">File sent to your browser downloads.</span>}
  </div>;
}
