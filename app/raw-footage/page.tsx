import {redirect} from 'next/navigation';
/** Legacy links return to the existing project upload hub. */
export default async function LegacyRawFootage({searchParams}:{searchParams:Promise<{projectId?:string|string[]}>}){
 const {projectId}=await searchParams;
 redirect(typeof projectId==='string'&&/^[0-9a-f-]{36}$/i.test(projectId)?'/projects/'+encodeURIComponent(projectId):'/projects');
}
