/** Compatibility for old response fields. Allowances are reserved by the shared route wrapper. */
interface LegacyResult {success:boolean;creditsRemaining?:number;transactionId?:string;error?:string}
export async function deductCreditsForContentKit(..._args:unknown[]):Promise<LegacyResult>{void _args;return {success:true};}
export async function deductCreditsForVoice(..._args:unknown[]):Promise<LegacyResult>{void _args;return {success:true};}
export async function completeCreditTransaction(..._args:unknown[]){void _args;return;}
export async function refundCreditsForContentKit(..._args:unknown[]):Promise<LegacyResult>{void _args;return {success:true};}
export async function refundCreditsForVoice(..._args:unknown[]):Promise<LegacyResult>{void _args;return {success:true};}
