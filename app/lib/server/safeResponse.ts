import {publicErrorMessage,publicErrorCode} from '../serviceMessages';
import { NextRequest, NextResponse } from "next/server";

/** Keep unexpected database/provider internals out of API error responses. */
export function withSafeResponse<T extends unknown[]>(handler: (req: NextRequest, ...args: T) => Promise<Response>) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    try {
      const response = await handler(req, ...args);
      if (response.status !== 500) {
        if(response.status<400||!response.headers.get('content-type')?.includes('application/json'))return response;
        const data=await response.clone().json().catch(()=>null);
        if(!data||typeof data!=='object'||Array.isArray(data))return response;
        let changed=false;const body={...data};
        for(const key of ['error','message','details'])if(typeof body[key]==='string'){const clean=publicErrorMessage(body[key]);if(clean!==body[key]){body[key]=clean;changed=true;}}
        if(typeof body.code==='string'){const clean=publicErrorCode(body.code);if(clean!==body.code){body.code=clean;changed=true;}}
        if(!changed)return response;
        const headers=new Headers(response.headers);headers.delete('Content-Length');return NextResponse.json(body,{status:response.status,headers});
      }
      const data = await response.clone().json().catch(() => ({}));
      const body: Record<string, string | boolean> = { error: "Request could not be completed. Please retry." };
      if (typeof data.refunded === "boolean") {
        body.refunded = data.refunded;
        if (data.refunded) body.error = "Generation failed. Your reserved allowance was restored.";
      }
      const headers = new Headers(response.headers);
      headers.delete("Content-Length");
      return NextResponse.json(body, { status: 500, headers });
    } catch { return NextResponse.json({ error: "Request could not be completed. Please retry." }, { status: 500 }); }
  };
}
