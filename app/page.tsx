import {headers} from "next/headers";
import HomePage from "./HomePage";
import {publicMetadata} from "./lib/seo";
import {homeSchema,serializeSchema} from "./lib/publicSchema";
export const metadata=publicMetadata("/");
export default async function Page(){
 const nonce=(await headers()).get("x-nonce")||undefined;
 return <><script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:serializeSchema(homeSchema())}}/><HomePage/></>;
}
