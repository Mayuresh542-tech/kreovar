import type {MetadataRoute} from "next";
import {PUBLIC_PAGES,SITE_URL} from "./lib/seo";
export default function sitemap():MetadataRoute.Sitemap{
 // Do not invent modification dates on each request or enumerate private project IDs.
 return PUBLIC_PAGES.map(page=>({url:new URL(page.path,SITE_URL).href}));
}
