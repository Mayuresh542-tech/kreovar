"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import MotionLibrary from "../components/assets/MotionLibrary";
import {useStudioAuth as useAuthGate} from "../lib/useStudioAuth";
export default function MotionPage(){const {status}=useAuthGate();if(status!=="authed")return <AuthLoadingScreen label="Loading motion graphics…"/>;return <StudioShell active="motion-graphics"><div className="space-y-5"><h1 className="text-2xl font-bold text-slate-900">Motion Graphics Library</h1><MotionLibrary/></div></StudioShell>;}

