"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuthGate} from "./useAuthGate";
export function useStudioAuth(){const auth=useAuthGate(),router=useRouter();useEffect(()=>{if(auth.status==="unauthed")router.replace("/login");},[auth.status,router]);return auth;}
