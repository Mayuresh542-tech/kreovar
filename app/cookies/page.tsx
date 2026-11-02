import {publicMetadata} from "../lib/seo";
import PolicyPage from "../components/PolicyPage";
export const metadata=publicMetadata("/cookies");
export default function Page(){return <PolicyPage slug="cookies"/>;}
