import {notFound} from 'next/navigation';
import DodoSandboxCheckout from '@/app/components/billing/DodoSandboxCheckout';
export default function DodoTestBillingPage(){if(process.env.DODO_SANDBOX_ENABLED!=='true'||process.env.DODO_PAYMENTS_ENVIRONMENT!=='test_mode')notFound();return <DodoSandboxCheckout/>;}
