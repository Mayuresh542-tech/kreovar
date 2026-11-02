/** Interpret only the signup response; no public email-directory lookup. */
export function isExistingSignup(data:{session?:unknown;user?:{identities?:unknown}|null}|null,error:{code?:string;message?:string}|null):boolean{
 if(error)return error.code==="user_already_exists"||error.code==="email_exists"||/^(User already registered|User already exists)\.?$/i.test(error.message||"");
 return !data?.session&&!!data?.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0;
}
