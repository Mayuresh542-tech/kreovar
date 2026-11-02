import Link from 'next/link';
import {COMMON_QUESTIONS,type PublicAnswer} from '../../lib/productAnswers';

export function QuestionList({items}:{items:readonly PublicAnswer[]}){
 return <div className="divide-y divide-slate-200">{items.map(item=><details key={item.id} id={item.id} className="scroll-mt-24 py-5"><summary className="min-h-11 cursor-pointer rounded-lg py-2 pr-4 text-base font-semibold leading-7 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 sm:text-lg">{item.q}</summary><p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{item.a}</p></details>)}</div>;
}
export default function PublicAnswers(){
 const [definition,...questions]=COMMON_QUESTIONS;
 return <section aria-labelledby="kreovar-answers" className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="vx-landing-card rounded-3xl border border-slate-200 bg-white p-6 sm:p-10"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Know your studio</p><h2 id="kreovar-answers" className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{definition.q}</h2><p className="mt-4 text-base leading-7 text-slate-600">{definition.a}</p><div className="mt-6"><QuestionList items={questions.slice(0,3)}/></div><Link href="/faq" className="mt-6 inline-flex min-h-11 items-center font-semibold text-blue-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">All questions and answers <span aria-hidden="true" className="ml-2">→</span></Link></div></div></section>;
}
