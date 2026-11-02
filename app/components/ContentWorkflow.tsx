"use client";
import Link from "next/link";import {useSearchParams} from "next/navigation";
export default function ContentWorkflow({step,topic=""}:{step:"trends"|"ideas"|"script";topic?:string}){
 const params=useSearchParams();const project=params.get("projectId");
 return <nav aria-label="Content creation workflow" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">{[["trends","1. Find trends"],["ideas","2. Content ideas"],["script","3. Write script"]].filter(([key])=>step!=="trends"||key!=="script").map(([key,label])=>{const query=new URLSearchParams();if(project)query.set("projectId",project);if(topic)query.set(key==="trends"?"q":"topic",topic);return <Link key={key} href={"/"+key+(query.size?"?"+query:"")} aria-current={step===key?"step":undefined} className={"rounded-lg px-3 py-2 text-sm font-medium "+(step===key?"bg-slate-900 text-white":"text-slate-600 hover:bg-slate-50")}>{label}</Link>;})}</nav>;
}
