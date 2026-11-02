import { NextResponse } from "next/server";
export function POST() { return NextResponse.json({error:"This feature is no longer available."}, {status:410}); }
