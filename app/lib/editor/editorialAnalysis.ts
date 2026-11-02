import {ALL_CAPTION_TEMPLATES} from '../captions/referenceTemplates';
export interface EditorialAnalysis {summary:string;captionStyle:{templateId:string;reason:string};brollStrategy:string}
export function readEditorialAnalysis(value:unknown):EditorialAnalysis|undefined{
 if(value===undefined)return;if(!value||typeof value!=='object')throw Error('Return an editorial analysis object.');const a=value as Record<string,unknown>,style=a.captionStyle as Record<string,unknown>|undefined;
 const text=(v:unknown,max:number)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Keep the editorial explanation short and specific.');return v.trim();};
 if(!style||!ALL_CAPTION_TEMPLATES.some(t=>t.id===style.templateId))throw Error('Choose a real caption template for the editorial analysis.');
 return {summary:text(a.summary,700),captionStyle:{templateId:String(style.templateId),reason:text(style.reason,400)},brollStrategy:text(a.brollStrategy,600)};
}
