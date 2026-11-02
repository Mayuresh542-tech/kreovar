/** Read model intent as untrusted data. Clarification never executes proposed edits. */
export function readEditingIntent(value:unknown){
 if(!value||typeof value!=="object")throw new Error("Invalid edit response.");
 const intent=(value as {intent?:unknown}).intent;
 if(intent===undefined)return undefined; // Compatibility with existing provider responses.
 if(!intent||typeof intent!=="object")throw new Error("Invalid editing intent.");
 const data=intent as Record<string,unknown>;
 const text=(v:unknown,max:number)=>{if(typeof v!=="string"||!v.trim()||v.length>max)throw new Error("Invalid editing intent text.");return v.trim();};
 const list=(v:unknown)=>{if(!Array.isArray(v)||v.length>8)throw new Error("Invalid editing intent list.");return v.map(t=>text(t,160));};
 const goal=text(data.goal,400),preserve=list(data.preserve),questions=list(data.questions);
 return {questions,summary:["My understanding: "+goal,...(preserve.length?["Keep: "+preserve.join("; ")]:[]),...(questions.length?["Please clarify: "+questions.join(" ")]:[])].join("\n")};
}
