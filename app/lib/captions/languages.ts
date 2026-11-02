/** Unicode scripts determine font fallback and direction; ASR remains automatic and untranslated. */
const scripts:[RegExp,string][]=[[/\p{Script=Devanagari}/u,'Noto Sans Devanagari'],[/\p{Script=Bengali}/u,'Noto Sans Bengali'],[/\p{Script=Tamil}/u,'Noto Sans Tamil'],[/\p{Script=Telugu}/u,'Noto Sans Telugu'],[/\p{Script=Gujarati}/u,'Noto Sans Gujarati'],[/\p{Script=Gurmukhi}/u,'Noto Sans Gurmukhi'],[/\p{Script=Kannada}/u,'Noto Sans Kannada'],[/\p{Script=Malayalam}/u,'Noto Sans Malayalam'],[/\p{Script=Arabic}/u,'Noto Sans Arabic'],[/\p{Script=Hebrew}/u,'Noto Sans Hebrew'],[/\p{Script=Thai}/u,'Noto Sans Thai'],[/[\p{Script=Hiragana}\p{Script=Katakana}]/u,'Noto Sans JP'],[/\p{Script=Hangul}/u,'Noto Sans KR'],[/\p{Script=Han}/u,'Noto Sans SC']];
export function scriptFonts(text:string){const fonts=scripts.filter(([pattern])=>pattern.test(text)).map(([,font])=>font);return fonts.includes('Noto Sans JP')?fonts.filter(f=>f!=='Noto Sans SC'):fonts;}
export function textDirection(text:string):'rtl'|'ltr'{const first=text.match(/\p{L}/u)?.[0]||'';return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(first)?'rtl':'ltr';}
export function captionFontFamily(font:string,text=''){return [font,...scriptFonts(text).map(f=>'"'+f+'"'),'"Nirmala UI"','"Segoe UI"','sans-serif'].join(',');}
const loading=new Map<string,Promise<void>>();
export async function loadScriptFonts(text:string){
 if(typeof document==='undefined'||!document.head)return;
 await Promise.all(scriptFonts(text).map(font=>{if(!loading.has(font)){
  const promise=new Promise<void>((resolve,reject)=>{const link=document.createElement('link'),timer=setTimeout(()=>{link.remove();reject(Error('Caption font loading timed out. Check your connection and retry.'));},20000);link.rel='stylesheet';link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(font).replaceAll('%20','+')+':wght@400;500;600;700&display=swap';link.onload=()=>{clearTimeout(timer);resolve();};link.onerror=()=>{clearTimeout(timer);link.remove();reject(Error('Caption language font could not load. Check your connection and retry.'));};document.head.appendChild(link);});
  loading.set(font,promise);promise.catch(()=>loading.delete(font));
 }return loading.get(font)!;}));
}
