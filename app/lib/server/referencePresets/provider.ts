import {randomUUID} from 'node:crypto';
import type {EditorJsonOptions} from '../radoxService';
import {generateEditPlanJson,type EditorProviderChoice} from '../editorProvider';
import {reserveUsage,finishUsage} from '../planUsage';
import {mutate,type ReferenceStore} from './store';
import type {Budget} from '../../referencePresets/model';
export interface ReasoningContext {store:ReferenceStore;owner:string;budgetKey:string;scope:'authoring'|'production';limit:number;signal:AbortSignal}
export function productionLimit(){const requested=Number(process.env.REFERENCE_PRESET_JOB_TOKEN_LIMIT||300000);return Number.isFinite(requested)?Math.max(1000,Math.min(300000,Math.floor(requested))):300000;}
export function emptyBudget(limit:number):Budget{return {limit,used:0,reserved:0,estimatedCost:null,pricingSource:null,requests:{}};}
export async function budgetStatus(c:ReasoningContext){return (await c.store.get<Budget>(c.owner,'budget',c.scope+':'+c.budgetKey))?.value||emptyBudget(c.limit);}
export async function referenceReasoning<T>(c:ReasoningContext,options:Omit<EditorJsonOptions,'userId'|'editingBudget'|'observer'|'signal'>,validate:(raw:unknown)=>T):Promise<T>{
 const quota=await reserveUsage(c.owner,{ai_edits:1});let valid=false;
 try{
  let feedback='';let provider:EditorProviderChoice|undefined;
  for(let attempt=0;attempt<2;attempt++){
   c.signal.throwIfAborted();let requestId='';const key=c.scope+':'+c.budgetKey;
   const observer:NonNullable<EditorJsonOptions['observer']>={
    before:async(body,maxOutput)=>{requestId=randomUUID();const reserve=Buffer.byteLength(JSON.stringify(body),'utf8')+maxOutput+8192;await mutate<Budget>(c.store,c.owner,'budget',key,old=>{const b=structuredClone(old||emptyBudget(c.limit));if(b.used+b.reserved+reserve>b.limit)throw Error('This reference job reached its token budget. Saved edits are preserved.');b.reserved+=reserve;b.requests[requestId]={reserved:reserve,actual:null,input:null,output:null,createdAt:new Date().toISOString()};return b;});},
    after:async(usage)=>{await mutate<Budget>(c.store,c.owner,'budget',key,old=>{if(!old?.requests[requestId])throw Error('Token reservation is unavailable.');const b=structuredClone(old),r=b.requests[requestId];if(r.actual!==null||usage.total===null)return b;r.actual=usage.total;r.input=usage.input;r.output=usage.output;b.reserved-=r.reserved;b.used+=usage.total;const inputPrice=Number(process.env.REFERENCE_PRESET_INPUT_USD_PER_MILLION),outputPrice=Number(process.env.REFERENCE_PRESET_OUTPUT_USD_PER_MILLION);if(process.env.REFERENCE_PRESET_INPUT_USD_PER_MILLION&&process.env.REFERENCE_PRESET_OUTPUT_USD_PER_MILLION&&Number.isFinite(inputPrice)&&Number.isFinite(outputPrice)&&inputPrice>=0&&outputPrice>=0&&usage.input!==null&&usage.output!==null){b.estimatedCost=(b.estimatedCost||0)+(usage.input*inputPrice+usage.output*outputPrice)/1e6;b.pricingSource='Configured provider rates; not independently verified';}return b;});}
   };
   const generated=await generateEditPlanJson<unknown>({...options,userId:c.owner,signal:c.signal,observer,prompt:options.prompt+feedback},provider);provider=generated;const raw=generated.value;
   try{const result=validate(raw);valid=true;return result;}catch(error){if(attempt===1)throw error;feedback='\nValidation feedback: '+(error instanceof Error?error.message.slice(0,400):'Invalid data')+'. Correct only this stage. Return a complete supported object. Never invent missing observations or asset identifiers.';}
  }
  throw Error('Reference reasoning failed validation.');
 }finally{await finishUsage(c.owner,quota.reservationId,valid);}
}
