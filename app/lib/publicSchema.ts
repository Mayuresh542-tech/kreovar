import {BRAND_SCHEMA} from './brandSchema';
import {PUBLIC_PAGES,SITE_DESCRIPTION,SITE_URL} from './seo';
import {FEATURE_PAGES,type FeaturePage} from './featurePages';
import {COMMON_QUESTIONS,faqEntries,PRODUCT_ANSWERS} from './productAnswers';

const software={
 '@type':'WebApplication','@id':SITE_URL+'/#software',name:'Kreovar',url:SITE_URL+'/',
 description:SITE_DESCRIPTION,applicationCategory:'MultimediaApplication',operatingSystem:'Web',
 browserRequirements:'A modern browser. Media preview and export depend on browser capabilities.',
 publisher:{'@id':SITE_URL+'/#organization'},isAccessibleForFree:true,
 featureList:['Manual multi-track video editing','AI-assisted editing in saved stages','Timed video captions and subtitle downloads','Text-to-speech voiceovers','B-roll and sound effects','Video exports up to 60 seconds'],
};
function graph(nodes:Record<string,unknown>[]){return {'@context':'https://schema.org','@graph':[...BRAND_SCHEMA['@graph'],software,...nodes]};}
function webPage(path:string,name:string,description:string){return {'@type':'WebPage','@id':SITE_URL+path+'#webpage',url:SITE_URL+path,name,description,inLanguage:'en',isPartOf:{'@id':SITE_URL+'/#website'},about:{'@id':software['@id']},mainEntity:{'@id':software['@id']}};}
function breadcrumbs(path:string,name:string){return {'@type':'BreadcrumbList','@id':SITE_URL+path+'#breadcrumb',itemListElement:[{'@type':'ListItem',position:1,name:'Kreovar',item:SITE_URL+'/'},{'@type':'ListItem',position:2,name,item:SITE_URL+path}]};}
export function homeSchema(){return graph([webPage('/','Kreovar | AI Content Studio & Online Video Editor',SITE_DESCRIPTION)]);}
export function featureSchema(page:FeaturePage){return graph([{...webPage(page.path,page.title,page.description),description:PRODUCT_ANSWERS[page.path].answer,breadcrumb:{'@id':SITE_URL+page.path+'#breadcrumb'}},breadcrumbs(page.path,page.label)]);}
export function faqSchema(){return graph([{
 '@type':'FAQPage','@id':SITE_URL+'/faq#webpage',url:SITE_URL+'/faq',name:'Kreovar questions, answered',inLanguage:'en',
 isPartOf:{'@id':SITE_URL+'/#website'},about:{'@id':software['@id']},breadcrumb:{'@id':SITE_URL+'/faq#breadcrumb'},
 mainEntity:faqEntries().map(entry=>({'@type':'Question','@id':SITE_URL+'/faq#'+entry.id,name:entry.q,acceptedAnswer:{'@type':'Answer',text:entry.a}})),
},breadcrumbs('/faq','Questions and answers')]);}
/** JSON-LD remains inert data even when an answer contains HTML-like text. */
export function serializeSchema(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
/** Supplemental reading index, not an indexing protocol or ranking guarantee. */
export function llmsGuide(){return [
 '# Kreovar',
 '> '+SITE_DESCRIPTION,
 '',
 'Kreovar is a browser-based content studio and short-video editor. This guide contains public product information only.',
 'Start with the linked product pages and current pricing. Account tools require sign-in. Service availability and plan allowances apply.',
 '',
 '## Product questions',
 ...COMMON_QUESTIONS.map(entry=>'### '+entry.q+'\n'+entry.a+'\n'),
 '## Public product pages',
 ...PUBLIC_PAGES.filter(page=>page.path!=='/'&&!['/terms','/privacy','/cookies','/refund'].includes(page.path)).map(page=>'- ['+page.title+']('+SITE_URL+page.path+'): '+page.description),
 '',
 '## Policies',
 ...PUBLIC_PAGES.filter(page=>['/terms','/privacy','/cookies','/refund'].includes(page.path)).map(page=>'- ['+page.title+']('+SITE_URL+page.path+')'),
 '',
 '## Feature guides',
 ...FEATURE_PAGES.map(page=>'- ['+page.label+']('+SITE_URL+page.path+'): '+PRODUCT_ANSWERS[page.path].limits),
 '',
 ].join('\n');}
