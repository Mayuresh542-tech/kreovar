/** Local emphasis rules, not semantic AI analysis. Custom words work in any script. */
const important=new Set(('stop secret never always money grow insane viral hack mistake truth crazy result huge worst best free million billion real power ai kill build scale win lose rich poor key simple hard now fast danger warning watch proof easy step game important amazing remarkable success urgent ' +
'zaroori zaruri paisa paise muft galti sach khatra kamyabi safalta बेहतरीन जरूरी ज़रूरी ज़रुरी महत्वपूर्ण पैसा पैसे मुफ्त मुफ़्त गलती सच खतरा सफलता शानदार कभी हमेशा ' +
'importante gratis secreto mejor éxito atención importante gratuit secret meilleur succès important kostenlos geheim beste erfolg attenzione gratis segreto migliore successo importante grátis segredo melhor sucesso ' +
'مهم مجاني سر أفضل نجاح خطر חשוב חינם סוד הצלחה ' +
'গুরুত্বপূর্ণ বিনামূল্যে সেরা வெற்றி முக்கியம் இலவசம் ముఖ్యమైన ఉచితం విజయం പ്രധാന സൗജന്യം വിജയം ಮುಖ್ಯ ಉಚಿತ ಯಶಸ್ಸು મહત્વપૂર્ણ મફત સફળਤਾ ਮਹੱਤਵਪੂਰਨ ਮੁਫ਼ਤ ਸਫਲਤਾ ' +
'重要 免费 成功 秘密 危険 無料 成功 중요 무료 성공 สำคัญ ฟรี สำเร็จ').split(/\s+/));
export function normalizeKeyword(word:string){return word.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');}
export function isImportantWord(raw:string,custom=''){
 const word=normalizeKeyword(raw);if(!word)return false;
 if(/\p{N}|[$€£₹%]/u.test(raw)||important.has(word))return true;
 const selected=custom.slice(0,1000).split(/[,،，\n]/).map(normalizeKeyword).filter(Boolean);
 if(selected.some(value=>value===word||(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)&&word.includes(value))))return true;
 // CJK ASR often emits a complete phrase as one token.
 return /\p{Script=Han}/u.test(word)&&['重要','免费','成功','秘密','危険','無料'].some(value=>word.includes(value));
}
export function distinctHighlight(textColor:string,highlightColor:string){
 const rgb=(v:string)=>{let hex=v.trim().toLowerCase();if(/^#[0-9a-f]{3}$/i.test(hex))hex='#'+[...hex.slice(1)].map(c=>c+c).join('');return hex;};
 if(rgb(textColor)!==rgb(highlightColor))return highlightColor;
 return ['#facc15','#ffe600','#ffd27d','#d9ff43'].includes(rgb(textColor))?'#22D3EE':'#FACC15';
}
export function wordHighlight(mode:string,word:string,index:number,current:boolean,custom=''){
 return mode==='full-line'||(mode==='keyword'?isImportantWord(word,custom):mode==='alternating'?index%2===1:current);
}
