/** Deliberately fixed: no model/provider rotation or client-supplied endpoints. */
export const RADOX_API_BASE = 'https://radoxai.com/v1';
export const EDITOR_AI_MODEL = 'claude-opus-5.5';
export const EDITOR_AI_MAX_TOKENS = 8192;
export type EditorReferenceImage = {styleId:string;timeSecondsApprox:number;mediaType:'image/jpeg';data:string};
