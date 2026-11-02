import ServiceInfoPage from '../components/ServiceInfoPage';
import {publicMetadata} from '../lib/seo';
export const metadata=publicMetadata('/contact');
export default function Page(){return <ServiceInfoPage kind="contact"/>;}
