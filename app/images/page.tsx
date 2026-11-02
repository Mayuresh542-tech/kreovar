"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import ImageGenerator from "../components/assets/ImageGenerator";
import {useStudioAuth as useAuthGate} from "../lib/useStudioAuth";
export default function ImagesPage(){const {status}=useAuthGate();if(status!=="authed")return <AuthLoadingScreen label="Loading Images…"/>;return <StudioShell active="images"><div className="max-w-3xl space-y-5"><h1 className="text-2xl font-bold text-slate-900">AI Image Studio</h1><ImageGenerator/></div></StudioShell>;}

