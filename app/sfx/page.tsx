"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import SfxLibrary from "../components/assets/SfxLibrary";
import {useStudioAuth as useAuthGate} from "../lib/useStudioAuth";
export default function SfxPage(){const {status}=useAuthGate();if(status!=="authed")return <AuthLoadingScreen label="Loading sound effects…"/>;return <StudioShell active="sfx"><div className="space-y-5"><h1 className="text-2xl font-bold text-slate-900">SFX Library</h1><SfxLibrary/></div></StudioShell>;}

