import {supabase} from "../supabase";
import {googleCallbackUrl} from "./googleAuth";
import {hasRecoverySession,clearRecoverySession} from "./recoverySession";
export type EmailFlow="confirm"|"recovery";
export function emailCallbackUrl(origin:string,flow:EmailFlow){const url=new URL(googleCallbackUrl(origin));url.searchParams.set("flow",flow);return url.toString();}
export function validatePassword(password:string,confirmation:string){if(password.length<12||password.length>256)throw new Error("Use a password between 12 and 256 characters.");if(password!==confirmation)throw new Error("Passwords do not match.");}
export async function sendAccountEmail(flow:EmailFlow,email:string,origin:string){
 email=email.trim();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new Error("Enter a valid email address.");
 const redirect=emailCallbackUrl(origin,flow);
 const {error}=flow==="recovery"?await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirect}):await supabase.auth.resend({type:"signup",email,options:{emailRedirectTo:redirect}});
 if(error)throw new Error(error.status===429?"Too many requests. Wait a few minutes before trying again.":"Could not send the email. Please try again shortly.");
}
export async function verifiedRecoveryUser(){const {error:sessionError}=await supabase.auth.getSession();if(sessionError)throw new Error("This reset link is invalid or expired. Request a new one.");const {data,error}=await supabase.auth.getUser();if(error||!data.user||!hasRecoverySession(data.user.id))throw new Error("Open a valid reset link from your email in this browser. If it expired, request a new one.");return data.user;}
export async function finishPasswordReset(password:string,confirmation:string){validatePassword(password,confirmation);await verifiedRecoveryUser();const {error}=await supabase.auth.updateUser({password});if(error)throw new Error("Could not update your password. Use a unique password and request a fresh link if needed.");clearRecoverySession();await supabase.auth.signOut({scope:"global"});}
