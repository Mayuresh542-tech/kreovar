"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import AssetLibraryPanel from "../components/assets/AssetLibraryPanel";
import {useStudioAuth as useAuthGate} from "../lib/useStudioAuth";
export default function AssetsPage(){const {status}=useAuthGate();if(status!=="authed")return <AuthLoadingScreen label="Loading Asset Library…"/>;return <StudioShell active="assets"><div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">Asset Library</h1></div><AssetLibraryPanel/></div></StudioShell>;}

