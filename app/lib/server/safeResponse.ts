import { NextRequest, NextResponse } from "next/server";

/** Keep unexpected database/provider internals out of API error responses. */
export function withSafeResponse<T extends unknown[]>(handler: (req: NextRequest, ...args: T) => Promise<Response>) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    try {
      const response = await handler(req, ...args);
      if (response.status !== 500) return response;
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
