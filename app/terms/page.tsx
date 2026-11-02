import {publicMetadata} from "../lib/seo";
import PolicyPage from "../components/PolicyPage";
export const metadata=publicMetadata("/terms");
export default function Page(){return <PolicyPage slug="terms"/>;}
