import {notFound} from 'next/navigation';
import ReferencePresetWorkspace from '../components/referencePresets/ReferencePresetWorkspace';
import {privateMetadata} from '../lib/seo';
export const metadata=privateMetadata('Reference Preset Editor');
export const dynamic='force-dynamic';
export default function ReferencePresetPage(){if(process.env.REFERENCE_PRESETS_ENABLED!=='true')notFound();return <ReferencePresetWorkspace/>;}
