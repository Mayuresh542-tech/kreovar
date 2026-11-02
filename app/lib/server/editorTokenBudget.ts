import {getAdminClient} from './adminAuth';
import {randomUUID} from 'node:crypto';
export const EDIT_TOKEN_LIMIT=300000;
export interface EditingBudget {jobId:string;projectId:string}
export class EditTokenBudgetError extends Error {
 readonly code='EDIT_TOKEN_LIMIT';readonly status=429;
 constructor(message='This edit reached its 300,000-token budget. Completed edits are saved. Review them before starting another edit.'){super(message);this.name='EditTokenBudgetError';}
}
export function readEditingBudget(jobId:unknown,projectId:string):EditingBudget|undefined{
 if(jobId===undefined)return;
 if(typeof jobId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId))throw Error('Invalid editing job ID.');
 return {jobId,projectId};
}
/** UTF-8 bytes (including inline image data) plus output and protocol overhead.
 * This deliberately reserves more than a token estimate; no next call can spend past the cap.
 * Unconfirmed/crashed calls retain their full reservation until an operator reconciles usage.
 */
export function worstCaseTokens(body:unknown,maxOutputTokens:number){return Buffer.byteLength(JSON.stringify(body),'utf8')+maxOutputTokens+8192;}
export async function reserveEditorTokens(userId:string,budget:EditingBudget,amount:number){
 if(amount>EDIT_TOKEN_LIMIT)throw new EditTokenBudgetError('This stage is too large for the 300,000-token edit budget. Use fewer source clips.');
 const requestId=randomUUID(),{data,error}=await getAdminClient().rpc('reserve_editor_tokens',{p_user_id:userId,p_project_id:budget.projectId,p_job_id:budget.jobId,p_request_id:requestId,p_tokens:amount});
 if(error||!data)throw new EditTokenBudgetError('The edit token budget could not be verified. No AI request was sent. Retry later.');
 if(!data.allowed)throw new EditTokenBudgetError();
 return requestId;
}
export async function settleEditorTokens(userId:string,budget:EditingBudget,requestId:string,actual:number|null){
 const {data,error}=await getAdminClient().rpc('settle_editor_tokens',{p_user_id:userId,p_job_id:budget.jobId,p_request_id:requestId,p_actual_tokens:actual});
 if(error||data!==true)throw new EditTokenBudgetError('Token usage could not be confirmed. Its reservation is retained; no further stage was started.');
}
export async function editorTokenStatus(userId:string,budget:EditingBudget){
 const {data,error}=await getAdminClient().from('editor_token_jobs').select('used_tokens,reserved_tokens,limit_tokens').eq('job_id',budget.jobId).eq('project_id',budget.projectId).eq('user_id',userId).maybeSingle();
 if(error)throw new EditTokenBudgetError('Token usage could not be read. Retry later.');
 return {usedTokens:data?.used_tokens||0,reservedTokens:data?.reserved_tokens||0,limit:EDIT_TOKEN_LIMIT};
}
