import { NextResponse } from "next/server";
export function GET() { return NextResponse.json({error:"This feature is no longer available."}, {status:410}); }
