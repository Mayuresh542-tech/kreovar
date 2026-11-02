import type {Metadata} from "next";
import {FEATURE_PAGES} from "./featurePages";
/** A fixed trusted origin: request hosts and tracking parameters never become canonicals. */
export const SITE_URL="https://kreovar.online";
export const SITE_DESCRIPTION="Create content and edit short videos with Kreovar. Discover ideas, write scripts, generate voiceovers, add captions and edit video in one studio.";
export const PRIVATE_ROBOTS={index:false,follow:false} as const;
export const PUBLIC_ROBOTS={index:true,follow:true} as const;
export const PUBLIC_PAGES=[
 {path:"/faq",title:"FAQ: Video Editing, Captions, Voiceovers & Plans",description:"Answers to common Kreovar questions about AI and manual video editing, caption downloads, voiceovers, Free and Pro pricing, and video export limits."},
 ...FEATURE_PAGES,
 {path:"/about",title:"About Kreovar",description:"Learn what Kreovar provides, how its short-video editing tools work and what to review before using AI-generated content."},
 {path:"/contact",title:"Contact Kreovar",description:"Contact Kreovar support for account, project, subscription and privacy questions. Find the official support email and helpful information."},
 {path:"/trust",title:"Service Information",description:"Understand Kreovar plans, payment processing, cancellation, refunds, media handling and current video editing limits before you sign up."},
 {path:"/",title:"Kreovar | AI Content Studio & Online Video Editor",description:SITE_DESCRIPTION},
 {path:"/pricing",title:"Pricing",description:"Compare Kreovar Free and Pro plans for AI content tools, captions, voiceovers and video editing. See monthly allowances and export limits."},
 {path:"/how-to-use",title:"How to Use Kreovar",description:"Learn the Kreovar workflow: create a project, add footage, use content tools, style captions and export your short video."},
 {path:"/terms",title:"Terms of Service",description:"Read the terms for using Kreovar and its content creation tools."},
 {path:"/privacy",title:"Privacy Policy",description:"Learn how Kreovar handles account information, uploaded content, generated assets and service data."},
 {path:"/cookies",title:"Cookie Policy",description:"Learn how Kreovar uses sign-in cookies and browser storage, how long data can remain on your device, and how to manage cookies, preferences and local drafts."},
 {path:"/refund",title:"Refund & Return Policy",description:"Read Kreovar's three-day first-payment refund window, renewal policy and cancellation information."},
] as const;
export const PRIVATE_PAGES:Record<string,string>={
 "/admin":"Admin", "/admin-unlock":"Admin Verification", "/affiliates":"Unavailable",
 "/alerts":"Alerts", "/analytics":"Analytics", "/assets":"Asset Library", "/auth":"Authentication",
 "/broll":"B-roll Library", "/caption-templates":"Caption Templates", "/captions":"Caption Studio",
 "/checkout":"Checkout", "/competitors":"Competitor Analysis", "/create":"Create", "/dashboard":"Dashboard",
 "/editor":"Video Editor", "/ideas":"Content Ideas", "/images":"AI Images", "/login":"Sign In",
 "/motion-graphics":"Motion Graphics", "/planner":"Planner", "/projects":"Projects", "/raw-footage":"Raw Footage",
 "/saved":"Saved Content", "/script":"Script Writer", "/settings":"Settings", "/sfx":"Sound Effects",
 "/signup":"Create Account", "/suggestions":"Suggestions", "/templates":"Templates", "/thumbnails":"Thumbnails",
 "/trends":"Content Workflow", "/typography":"Unavailable", "/upgrade":"Upgrade",
 "/voice":"Voice Studio", "/confirm-email":"Confirm Email", "/forgot-password":"Forgot Password", "/reset-password":"Reset Password",
};
export function isPrivateRoute(path:string){return ["/api",...Object.keys(PRIVATE_PAGES)].some(prefix=>path===prefix||path.startsWith(prefix+"/"));}
export function publicMetadata(path:string):Metadata{
 const page=PUBLIC_PAGES.find(page=>page.path===path);if(!page)throw new Error("Only public pages may request indexable metadata.");
 const title=path==="/"?{absolute:page.title}:page.title,shareTitle=path==="/"?page.title:page.title+" | Kreovar";
 return {title,description:page.description,alternates:{canonical:new URL(path,SITE_URL).href},robots:PUBLIC_ROBOTS,
 openGraph:{type:"website",siteName:"Kreovar",locale:"en_US",title:shareTitle,description:page.description,url:new URL(path,SITE_URL).href,images:[{url:SITE_URL+"/opengraph-image",width:1200,height:630,alt:"Kreovar content creation and video editing studio"}]},
 twitter:{card:"summary_large_image",title:shareTitle,description:page.description,images:[SITE_URL+"/opengraph-image"]}};
}
export function privateMetadata(title:string):Metadata{return {title,robots:PRIVATE_ROBOTS};}
