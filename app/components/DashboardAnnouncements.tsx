
"use client";
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
type Announcement={id:string;title:string;body:string;updated_at:string};
export default function DashboardAnnouncements(){
 const [items,setItems]=useState<Announcement[]>([]);
 const [hidden,setHidden]=useState<string[]>([]);
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   const {data}=await supabase.auth.getSession();if(!data.session){if(alive)setItems([]);return;}
   const res=await fetch('/api/announcements',{headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'}).catch(()=>null);
   if(res?.ok){const json=await res.json();if(alive)setItems(json.announcements||[]);}
  };
  void load();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 return <div className="space-y-3 mb-5">{items.filter(a=>!hidden.includes(a.id+':'+a.updated_at)).map(a=><section key={a.id} aria-label="Announcement" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 flex gap-4"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-blue-700 mb-1">Announcement</p><h2 className="font-semibold text-slate-900 break-words">{a.title}</h2><p className="text-sm text-slate-700 whitespace-pre-wrap break-words mt-1">{a.body}</p></div><button type="button" aria-label={'Dismiss '+a.title} onClick={()=>setHidden(h=>[...h,a.id+':'+a.updated_at])} className="self-start p-2 rounded-lg hover:bg-blue-100">×</button></section>)}</div>;
}
