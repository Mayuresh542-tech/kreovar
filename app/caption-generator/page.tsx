import CaptionFonts from "../components/captions/CaptionFonts";
import FeatureLanding from "../components/marketing/FeatureLanding";
import {FEATURE_PAGES} from "../lib/featurePages";
import {publicMetadata} from "../lib/seo";
export const metadata=publicMetadata("/caption-generator");
export default function Page(){return <><CaptionFonts sample/><FeatureLanding page={FEATURE_PAGES[1]}/></>;}
