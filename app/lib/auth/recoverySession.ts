/** UI recovery state only; Supabase verifies identity and authorizes every password update. */
const key="veelox-password-recovery";
export function recordRecoveryEvent(event:string,userId?:string){
 if(typeof window==="undefined")return;
 try{if(event==="SIGNED_OUT")window.sessionStorage.removeItem(key);
 else if(event==="PASSWORD_RECOVERY"&&userId)window.sessionStorage.setItem(key,JSON.stringify({userId,expires:Date.now()+10*60*1000}));}catch{/* Storage may be unavailable; fail closed on the reset page. */}
}
export function hasRecoverySession(userId:string):boolean{
 if(typeof window==="undefined")return false;
 try{const value=JSON.parse(window.sessionStorage.getItem(key)||"null");return value?.userId===userId&&Number.isFinite(value.expires)&&value.expires>Date.now();}catch{return false;}
}
export function clearRecoverySession(){if(typeof window!=="undefined")try{window.sessionStorage.removeItem(key);}catch{}}
