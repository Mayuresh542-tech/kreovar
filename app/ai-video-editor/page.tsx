import FeatureLanding from "../components/marketing/FeatureLanding";
import {FEATURE_PAGES} from "../lib/featurePages";
import {publicMetadata} from "../lib/seo";
export const metadata=publicMetadata("/ai-video-editor");
export default function Page(){return <FeatureLanding page={FEATURE_PAGES[0]}/>;}
