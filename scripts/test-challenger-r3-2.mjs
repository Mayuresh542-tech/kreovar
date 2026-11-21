import assert from "node:assert/strict";
import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

function createModuleLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    Headers,
    Response,
    Request,
    NextRequest,
    NextResponse,
    Buffer,
    Blob,
    File,
    Error,
    TypeError,
    DOMException,
    AbortSignal,
    AbortController,
    ReadableStream,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        ...process.env,
      },
    },
    ...globals,
  });

  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) {
      if (fs.existsSync(filename + ".ts")) filename += ".ts";
      else if (fs.existsSync(filename + ".tsx")) filename += ".tsx";
      else if (fs.existsSync(path.join(filename, "index.ts"))) filename = path.join(filename, "index.ts");
    }
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename);

    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule.exports);

    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));

    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/")) return load(specifier.slice(2));
      if (specifier.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)));
      return require(specifier);
    };

    new vm.Script(`(function(require,module,exports,process){\n${source}\n})`, { filename }).runInContext(context)(
      localRequire,
      loadedModule,
      loadedModule.exports,
      context.process
    );

    cache.set(filename, loadedModule.exports);
    return loadedModule.exports;
  }
  return { load, context };
}

// ==============================================================================
// SUITE 1: B-roll Usage Accounting in planUsage.ts
// ==============================================================================
describe("Challenger Suite 1: B-roll Usage Accounting & Refund Rules (planUsage.ts)", () => {
  test("1.1 Successful B-roll choice with usageConsumed:true does NOT refund ai_edits allowance", async () => {
    const finishCalls = [];
    const db = {
      rpc: async (name, args) => {
        if (name === "kreovar_reserve_usage") {
          return { data: { allowed: true, reservationId: "res-broll-1", feature: "ai_edits" }, error: null };
        }
        if (name === "kreovar_finish_usage") {
          finishCalls.push(args);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    };

    const { load } = createModuleLoader({
      "app/lib/server/adminAuth.ts": {
        getAdminClient: () => db,
        getAuthenticatedUserId: async () => "user-broll-pro",
      },
    });

    const { withUsage } = load("app/lib/server/planUsage.ts");

    // Simulating broll-choice returning a chosen video with usageConsumed: true (and empty decisions/tools)
    const brollHandler = async () =>
      NextResponse.json({
        video: { id: "vid-stock-99", url: "https://stock.cdn/video.mp4" },
        reason: "Matched query: sunset over mountains",
        usageConsumed: true,
      });

    const req = new NextRequest("http://localhost:3000/api/editor/broll-choice", {
      method: "POST",
      body: JSON.stringify({ query: "sunset", speech: "look at this sunset" }),
    });

    const res = await withUsage(brollHandler, "ai")(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.usageConsumed, true);
    assert.equal(body.video.id, "vid-stock-99");

    // Check settlement: finishUsage MUST be called with p_success === true (NOT refunded)
    assert.equal(finishCalls.length, 1, "finishUsage must be called exactly once");
    assert.equal(finishCalls[0].p_user_id, "user-broll-pro");
    assert.equal(finishCalls[0].p_id, "res-broll-1");
    assert.equal(finishCalls[0].p_success, true, "Credits must be consumed (p_success: true), NOT refunded");
  });

  test("1.2 Failed B-roll choice (no video, no usageConsumed, empty decisions) REFUNDS ai_edits allowance", async () => {
    const finishCalls = [];
    const db = {
      rpc: async (name, args) => {
        if (name === "kreovar_reserve_usage") {
          return { data: { allowed: true, reservationId: "res-broll-failed", feature: "ai_edits" }, error: null };
        }
        if (name === "kreovar_finish_usage") {
          finishCalls.push(args);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    };

    const { load } = createModuleLoader({
      "app/lib/server/adminAuth.ts": {
        getAdminClient: () => db,
        getAuthenticatedUserId: async () => "user-broll-fail",
      },
    });

    const { withUsage } = load("app/lib/server/planUsage.ts");

    // Simulating failed broll search that found nothing (no usageConsumed flag)
    const failedHandler = async () =>
      NextResponse.json({
        video: null,
        reason: "No footage found for query",
      });

    const req = new NextRequest("http://localhost:3000/api/editor/broll-choice", {
      method: "POST",
      body: JSON.stringify({ query: "obscure-query" }),
    });

    const res = await withUsage(failedHandler, "ai")(req);
    assert.equal(res.status, 200);

    // Empty decisions and no usageConsumed flag triggers the refund branch
    assert.equal(finishCalls.length, 1);
    assert.equal(finishCalls[0].p_user_id, "user-broll-fail");
    assert.equal(finishCalls[0].p_id, "res-broll-failed");
    assert.equal(finishCalls[0].p_success, false, "Allowance must be refunded (p_success: false)");
  });

  test("1.3 Handler exception or HTTP 500 error triggers refund in finally block", async () => {
    const finishCalls = [];
    const db = {
      rpc: async (name, args) => {
        if (name === "kreovar_reserve_usage") {
          return { data: { allowed: true, reservationId: "res-error-case", feature: "ai_edits" }, error: null };
        }
        if (name === "kreovar_finish_usage") {
          finishCalls.push(args);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    };

    const { load } = createModuleLoader({
      "app/lib/server/adminAuth.ts": {
        getAdminClient: () => db,
        getAuthenticatedUserId: async () => "user-error",
      },
    });

    const { withUsage } = load("app/lib/server/planUsage.ts");

    // Case A: Handler throws error
    const throwingHandler = async () => {
      throw new Error("Pexels API timed out");
    };

    const reqA = new NextRequest("http://localhost:3000/api/editor/broll-choice", { method: "POST" });
    const resA = await withUsage(throwingHandler, "ai")(reqA);
    assert.equal(resA.status, 503);

    assert.equal(finishCalls.length, 1);
    assert.equal(finishCalls[0].p_success, false, "Thrown error must refund credit");

    // Case B: Handler returns non-OK status (e.g. 502)
    finishCalls.length = 0;
    const nonOkHandler = async () => NextResponse.json({ error: "Failed to choose footage" }, { status: 502 });
    const reqB = new NextRequest("http://localhost:3000/api/editor/broll-choice", { method: "POST" });
    const resB = await withUsage(nonOkHandler, "ai")(reqB);
    assert.equal(resB.status, 502);

    assert.equal(finishCalls.length, 1);
    assert.equal(finishCalls[0].p_success, false, "Non-OK response must refund credit");
  });

  test("1.4 Edge cases: usageConsumed:true with success:false or isDevelopmentMode triggers refund", async () => {
    const finishCalls = [];
    const db = {
      rpc: async (name, args) => {
        if (name === "kreovar_reserve_usage") {
          return { data: { allowed: true, reservationId: "res-edge", feature: "ai_edits" }, error: null };
        }
        if (name === "kreovar_finish_usage") {
          finishCalls.push(args);
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    };

    const { load } = createModuleLoader({
      "app/lib/server/adminAuth.ts": {
        getAdminClient: () => db,
        getAuthenticatedUserId: async () => "user-edge",
      },
    });

    const { withUsage } = load("app/lib/server/planUsage.ts");

    // result.success === false should not consume credit even if usageConsumed was set
    const devModeHandler = async () =>
      NextResponse.json({
        video: { id: "test" },
        usageConsumed: true,
        isDevelopmentMode: true,
      });

    const req = new NextRequest("http://localhost:3000/api/editor/broll-choice", { method: "POST" });
    const res = await withUsage(devModeHandler, "ai")(req);
    assert.equal(res.status, 502);

    assert.equal(finishCalls.length, 1);
    assert.equal(finishCalls[0].p_success, false, "Development mode must not consume real credits");
  });

  test("1.5 finishUsage retries on transient transport errors up to 3 times", async () => {
    let rpcAttempts = 0;
    const db = {
      rpc: async (name) => {
        if (name === "kreovar_finish_usage") {
          rpcAttempts++;
          if (rpcAttempts < 3) throw new Error("Transient network glitch");
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    };

    const { load } = createModuleLoader({
      "app/lib/server/adminAuth.ts": { getAdminClient: () => db },
    });

    const { finishUsage } = load("app/lib/server/planUsage.ts");
    await assert.doesNotReject(async () => {
      await finishUsage("user-retry", "res-retry-1", true);
    });
    assert.equal(rpcAttempts, 3, "finishUsage should retry up to 3 attempts and succeed on 3rd");
  });
});

// ==============================================================================
// SUITE 2: Image Generation Rate Limits & Feature Guard (generate-image/route.ts)
// ==============================================================================
describe("Challenger Suite 2: Image Generation Rate Limits & Availability (generate-image/route.ts)", () => {
  test("2.1 When IMAGE_GENERATION_ENABLED !== 'true', returns 503 and rate limit count does NOT increment", async () => {
    const { load, context } = createModuleLoader({
      "app/lib/server/adminAuth.ts": {
        getAdminClient: () => ({
          auth: {
            getUser: async (token) => {
              if (token === "valid-token") return { data: { user: { id: "user-disabled-check" } }, error: null };
              return { data: { user: null }, error: new Error("invalid token") };
            },
          },
        }),
      },
      "app/lib/server/geminiService.ts": {
        getGeminiApiKey: async () => "mock-gemini-key",
      },
    });

    const route = load("app/api/editor/generate-image/route.ts");

    // Test with "false", "", and undefined
    for (const disabledVal of ["false", "", undefined]) {
      context.process.env.IMAGE_GENERATION_ENABLED = disabledVal;
      process.env.IMAGE_GENERATION_ENABLED = disabledVal;

      // Hammer 10 consecutive requests for the same user
      for (let i = 0; i < 10; i++) {
        const req = new NextRequest("http://localhost:3000/api/editor/generate-image", {
          method: "POST",
          headers: {
            authorization: "Bearer valid-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ prompt: "A cinematic cybernetic cityscape", aspectRatio: "16:9" }),
        });

        const res = await route.POST(req);
        assert.equal(res.status, 503, `Call ${i + 1} with IMAGE_GENERATION_ENABLED=${disabledVal} must return 503, got ${res.status}`);
        const body = await res.json();
        assert.ok(body.error.includes("coming soon"), "Must indicate feature is coming soon");
      }
    }
  });

  test("2.2 When Gemini key is missing, returns 503 and rate limit count does NOT increment", async () => {
    process.env.IMAGE_GENERATION_ENABLED = "true";
    const { load, context } = createModuleLoader({
      "app/lib/server/adminAuth.ts": {
        getAdminClient: () => ({
          auth: {
            getUser: async () => ({ data: { user: { id: "user-no-key-check" } }, error: null }),
          },
        }),
      },
      "app/lib/server/geminiService.ts": {
        getGeminiApiKey: async () => null, // No key configured
      },
    });

    context.process.env.IMAGE_GENERATION_ENABLED = "true";
    process.env.IMAGE_GENERATION_ENABLED = "true";
    const route = load("app/api/editor/generate-image/route.ts");

    // Hammer 10 consecutive requests
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost:3000/api/editor/generate-image", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt: "A mountain sunset", aspectRatio: "9:16" }),
      });

      const res = await route.POST(req);
      assert.equal(res.status, 503, `Call ${i + 1} with missing Gemini key must return 503, got ${res.status}`);
      const body = await res.json();
      assert.ok(body.error, "Error message must be present");
      assert.notEqual(res.status, 429, "Must not be 429 rate limit");
    }
  });

  test("2.3 When enabled and configured, enforces 3-request rate limit and concurrency busy lock", async () => {
    // 1x1 transparent PNG base64
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    let fetchCount = 0;
    let fetchResolver = null;
    let delayFetch = false;

    const mockFetch = async (url, opts) => {
      fetchCount++;
      if (delayFetch) {
        await new Promise((r) => { fetchResolver = r; });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: pngBase64,
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { load, context } = createModuleLoader(
      {
        "app/lib/server/adminAuth.ts": {
          getAdminClient: () => ({
            auth: {
              getUser: async () => ({ data: { user: { id: "user-rate-limited" } }, error: null }),
            },
          }),
        },
        "app/lib/server/geminiService.ts": {
          getGeminiApiKey: async () => "valid-key-xyz",
        },
        "app/lib/server/assetStore.ts": {
          saveStudioAsset: async () => ({ id: "asset-img-1" }),
        },
      },
      { fetch: mockFetch }
    );

    context.process.env.IMAGE_GENERATION_ENABLED = "true";
    const route = load("app/api/editor/generate-image/route.ts");

    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/editor/generate-image", {
        method: "POST",
        headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
        body: JSON.stringify({ prompt: "An artistic painting", aspectRatio: "1:1" }),
      });

    // Request 1: succeeds
    const res1 = await route.POST(makeReq());
    assert.equal(res1.status, 200, "Request 1 should succeed");

    // Request 2: succeeds
    const res2 = await route.POST(makeReq());
    assert.equal(res2.status, 200, "Request 2 should succeed");

    // Request 3: succeeds
    const res3 = await route.POST(makeReq());
    assert.equal(res3.status, 200, "Request 3 should succeed");

    // Request 4: Rate limit hit! Should return 429
    const res4 = await route.POST(makeReq());
    assert.equal(res4.status, 429, "Request 4 within 1 minute must return 429 rate limit");
    const body4 = await res4.json();
    assert.ok(body4.error.includes("wait a minute"), "Error message must indicate wait");

    // Verify fetch was only called 3 times (the 4th was rejected before fetch)
    assert.equal(fetchCount, 3);
  });

  test("2.4 Concurrency guard: concurrent in-flight request for same user is rejected with 429", async () => {
    let unblockFetch = null;
    const slowFetch = async () => {
      await new Promise((r) => { unblockFetch = r; });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { load, context } = createModuleLoader(
      {
        "app/lib/server/adminAuth.ts": {
          getAdminClient: () => ({
            auth: { getUser: async () => ({ data: { user: { id: "user-concurrent-busy" } }, error: null }) },
          }),
        },
        "app/lib/server/geminiService.ts": { getGeminiApiKey: async () => "key-123" },
        "app/lib/server/assetStore.ts": { saveStudioAsset: async () => ({ id: "asset-1" }) },
      },
      { fetch: slowFetch }
    );

    context.process.env.IMAGE_GENERATION_ENABLED = "true";
    const route = load("app/api/editor/generate-image/route.ts");

    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/editor/generate-image", {
        method: "POST",
        headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
        body: JSON.stringify({ prompt: "A futuristic skyline", aspectRatio: "16:9" }),
      });

    // Start request 1 (in flight)
    const promise1 = route.POST(makeReq());

    // Immediately start request 2 while request 1 is busy
    const res2 = await route.POST(makeReq());
    assert.equal(res2.status, 429, "Concurrent request while busy must return 429");

    // Unblock request 1
    unblockFetch();
    const res1 = await promise1;
    assert.equal(res1.status, 200, "Original request finishes 200");
  });

  test("2.5 Rate limit window resets after 60 seconds of inactivity", async () => {
    let mockNow = 1000000;
    const { load, context } = createModuleLoader(
      {
        "app/lib/server/adminAuth.ts": {
          getAdminClient: () => ({
            auth: { getUser: async () => ({ data: { user: { id: "user-window-rollover" } }, error: null }) },
          }),
        },
        "app/lib/server/geminiService.ts": { getGeminiApiKey: async () => "key-window" },
        "app/lib/server/assetStore.ts": { saveStudioAsset: async () => ({ id: "asset-1" }) },
      },
      {
        Date: class extends Date {
          static now() { return mockNow; }
        },
        fetch: async () =>
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }] } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
      }
    );

    context.process.env.IMAGE_GENERATION_ENABLED = "true";
    process.env.IMAGE_GENERATION_ENABLED = "true";
    const route = load("app/api/editor/generate-image/route.ts");

    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/editor/generate-image", {
        method: "POST",
        headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Prompt 1", aspectRatio: "16:9" }),
      });

    // Make 3 requests at t=0
    assert.equal((await route.POST(makeReq())).status, 200);
    assert.equal((await route.POST(makeReq())).status, 200);
    assert.equal((await route.POST(makeReq())).status, 200);
    // 4th request at t=0 rejected with 429
    assert.equal((await route.POST(makeReq())).status, 429);

    // Fast forward 61 seconds
    mockNow += 61000;

    // After 61 seconds, count is reset and request succeeds!
    const resAfterReset = await route.POST(makeReq());
    assert.equal(resAfterReset.status, 200, "Request after 60s window rollover must succeed");
  });
});

// ==============================================================================
// SUITE 3: Groq Transport Try/Finally Token Lease Settlement (groqEditorTransport.ts)
// ==============================================================================
describe("Challenger Suite 3: Groq Transport Token Settlement under Network/Timeout Failures (groqEditorTransport.ts)", () => {
  test("3.1 Network failure (fetch throws TypeError) settles tokens to 0 in finally block", async () => {
    const settleCalls = [];
    const mockBudget = { jobId: "job-groq-1", budgetRemaining: 50000 };

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gsk_test_key_123",
          recordProviderUsage: async () => {},
        },
        "./editorTokenBudget": {
          reserveEditorTokens: async (uid, budget, estimate) => ({ leaseId: "lease-net-err", reserved: estimate }),
          settleEditorTokens: async (uid, budget, lease, total) => {
            settleCalls.push({ uid, lease, total });
          },
          worstCaseTokens: () => 4000,
        },
      },
      {
        fetch: async () => {
          throw new TypeError("fetch failed: connect ECONNREFUSED 104.18.2.1:443");
        },
      }
    );

    const { requestGroqEditorJson, GroqEditorError } = load("app/lib/server/groqEditorTransport.ts");

    await assert.rejects(
      async () => {
        await requestGroqEditorJson(
          { userId: "usr-groq-1", editingBudget: mockBudget },
          { messages: [{ role: "user", content: "edit request" }] },
          { model: "qwen-2.5-72b", maxOutput: 2048, timeoutMs: 5000 }
        );
      },
      (err) => {
        assert.ok(err instanceof GroqEditorError);
        assert.equal(err.code, "GROQ_UNAVAILABLE");
        return true;
      }
    );

    // Verify token lease was settled with 0
    assert.equal(settleCalls.length, 1, "settleEditorTokens must be called in finally");
    assert.equal(settleCalls[0].uid, "usr-groq-1");
    assert.equal(settleCalls[0].lease.leaseId, "lease-net-err");
    assert.equal(settleCalls[0].total, 0, "Tokens must be settled with 0 on network error");
  });

  test("3.2 DNS resolution failure settles tokens to 0 in finally block", async () => {
    const settleCalls = [];
    const mockBudget = { jobId: "job-groq-2", budgetRemaining: 50000 };

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gsk_test_key_123",
          recordProviderUsage: async () => {},
        },
        "./editorTokenBudget": {
          reserveEditorTokens: async (uid, budget, estimate) => ({ leaseId: "lease-dns-err", reserved: estimate }),
          settleEditorTokens: async (uid, budget, lease, total) => {
            settleCalls.push({ uid, lease, total });
          },
          worstCaseTokens: () => 4000,
        },
      },
      {
        fetch: async () => {
          const err = new Error("getaddrinfo ENOTFOUND api.groq.com");
          err.code = "ENOTFOUND";
          throw err;
        },
      }
    );

    const { requestGroqEditorJson, GroqEditorError } = load("app/lib/server/groqEditorTransport.ts");

    await assert.rejects(
      async () => {
        await requestGroqEditorJson(
          { userId: "usr-groq-2", editingBudget: mockBudget },
          { messages: [] },
          { model: "qwen-2.5-72b", maxOutput: 1024, timeoutMs: 5000 }
        );
      },
      (err) => err instanceof GroqEditorError && err.code === "GROQ_UNAVAILABLE"
    );

    assert.equal(settleCalls.length, 1);
    assert.equal(settleCalls[0].lease.leaseId, "lease-dns-err");
    assert.equal(settleCalls[0].total, 0, "Tokens must be settled with 0 on DNS failure");
  });

  test("3.3 Request timeout settles tokens to 0 in finally block", async () => {
    const settleCalls = [];
    const mockBudget = { jobId: "job-groq-3", budgetRemaining: 50000 };

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gsk_test_key_123",
          recordProviderUsage: async () => {},
        },
        "./editorTokenBudget": {
          reserveEditorTokens: async (uid, budget, estimate) => ({ leaseId: "lease-timeout", reserved: estimate }),
          settleEditorTokens: async (uid, budget, lease, total) => {
            settleCalls.push({ uid, lease, total });
          },
          worstCaseTokens: () => 4000,
        },
      },
      {
        fetch: async () => {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          throw err;
        },
      }
    );

    const { requestGroqEditorJson } = load("app/lib/server/groqEditorTransport.ts");

    await assert.rejects(async () => {
      await requestGroqEditorJson(
        { userId: "usr-groq-3", editingBudget: mockBudget },
        { messages: [] },
        { model: "qwen-2.5-72b", maxOutput: 1024, timeoutMs: 5000 }
      );
    });

    assert.equal(settleCalls.length, 1);
    assert.equal(settleCalls[0].lease.leaseId, "lease-timeout");
    assert.equal(settleCalls[0].total, 0, "Tokens must be settled with 0 on timeout");
  });

  test("3.4 Successful Groq response settles actual reported tokens and does not double-settle in finally", async () => {
    const settleCalls = [];
    const mockBudget = { jobId: "job-groq-4", budgetRemaining: 50000 };

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gsk_test_key_123",
          recordProviderUsage: async () => {},
        },
        "./editorTokenBudget": {
          reserveEditorTokens: async (uid, budget, estimate) => ({ leaseId: "lease-success", reserved: estimate }),
          settleEditorTokens: async (uid, budget, lease, total) => {
            settleCalls.push({ uid, lease, total });
          },
          worstCaseTokens: () => 4000,
        },
      },
      {
        fetch: async () =>
          new Response(
            JSON.stringify({
              model: "qwen-2.5-72b",
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: JSON.stringify({ decisions: [{ op: "addClip" }] }) },
                },
              ],
              usage: {
                prompt_tokens: 450,
                completion_tokens: 120,
                total_tokens: 570,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
      }
    );

    const { requestGroqEditorJson } = load("app/lib/server/groqEditorTransport.ts");

    const result = await requestGroqEditorJson(
      { userId: "usr-groq-4", editingBudget: mockBudget },
      { messages: [] },
      { model: "qwen-2.5-72b", maxOutput: 1024, timeoutMs: 5000 }
    );

    assert.ok(result.decisions);
    // Settle should happen once with 570 tokens, and finally block should NOT settle again
    assert.equal(settleCalls.length, 1, "Must settle exactly once");
    assert.equal(settleCalls[0].lease.leaseId, "lease-success");
    assert.equal(settleCalls[0].total, 570, "Actual tokens (570) settled");
  });

  test("3.5 User AbortSignal abort triggers token settlement to 0 in finally", async () => {
    const settleCalls = [];
    const mockBudget = { jobId: "job-groq-5", budgetRemaining: 50000 };
    const abortController = new AbortController();

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gsk_test_key_123",
          recordProviderUsage: async () => {},
        },
        "./editorTokenBudget": {
          reserveEditorTokens: async (uid, budget, estimate) => ({ leaseId: "lease-abort", reserved: estimate }),
          settleEditorTokens: async (uid, budget, lease, total) => {
            settleCalls.push({ uid, lease, total });
          },
          worstCaseTokens: () => 4000,
        },
      },
      {
        fetch: async (_url, opts) => {
          // Abort during fetch
          abortController.abort(new Error("User cancelled generation"));
          opts.signal.throwIfAborted();
        },
      }
    );

    const { requestGroqEditorJson } = load("app/lib/server/groqEditorTransport.ts");

    await assert.rejects(async () => {
      await requestGroqEditorJson(
        { userId: "usr-groq-5", editingBudget: mockBudget, signal: abortController.signal },
        { messages: [] },
        { model: "qwen-2.5-72b", maxOutput: 1024, timeoutMs: 5000 }
      );
    });

    assert.equal(settleCalls.length, 1, "Must settle lease on user abort");
    assert.equal(settleCalls[0].lease.leaseId, "lease-abort");
    assert.equal(settleCalls[0].total, 0, "Aborted request settles 0 tokens");
  });
});

// ==============================================================================
// SUITE 4: Gemini Token Telemetry & Vision Frames on Attempt 1 (geminiService & editorProvider)
// ==============================================================================
describe("Challenger Suite 4: Gemini Token Telemetry & Vision Frame Forwarding", () => {
  test("4.1 geminiService captures usageMetadata (prompt, candidates, total tokens) and passes to onMetadata", async () => {
    let capturedTelemetry = null;
    let recordedUsage = null;

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ plan: "valid" }) }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 1650,
            candidatesTokenCount: 420,
            totalTokenCount: 2070,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gemini-api-key-test",
          recordProviderUsage: async (usage) => {
            recordedUsage = usage;
          },
        },
      },
      { fetch: mockFetch }
    );

    const { generateGeminiContent } = load("app/lib/server/geminiService.ts");

    const text = await generateGeminiContent({
      prompt: "Generate an edit",
      userId: "user-telemetry",
      onMetadata: (meta) => {
        capturedTelemetry = meta;
      },
    });

    assert.ok(text.includes("valid"));
    assert.ok(capturedTelemetry, "onMetadata must be invoked");
    assert.equal(capturedTelemetry.model, "gemini-3.8-flash");
    assert.equal(capturedTelemetry.totalTokens, 2070);
    assert.equal(capturedTelemetry.promptTokens, 1650);
    assert.equal(capturedTelemetry.completionTokens, 420);

    // Verify recordProviderUsage also logged exact units
    assert.equal(recordedUsage?.units, 2070);
    assert.equal(recordedUsage?.providerKey, "gemini");
  });

  test("4.2 editorProvider uses actual geminiMeta token counts in settleEditorTokens and observer", async () => {
    let settledAmount = null;
    let observerAfter = null;

    class MockGroqEditorError extends Error {
      constructor(msg, code = "GROQ_RATE_LIMIT", status = 429) {
        super(msg);
        this.name = "GroqEditorError";
        this.code = code;
        this.status = status;
      }
    }

    const { load } = createModuleLoader({
      "./radoxService": {
        generateEditorJson: async () => { throw new Error("radox disabled"); },
        RadoxEditorError: class extends Error {},
      },
      "./groqEditorFallback": {
        generateGroqEditorJson: async () => {
          // Force fallback to Gemini by throwing rate limit
          throw new MockGroqEditorError("rate limit", "GROQ_RATE_LIMIT", 429);
        },
        GroqEditorError: MockGroqEditorError,
      },
      "./geminiService": {
        GEMINI_EDITOR_MODEL: "gemini-3.8-flash",
        generateGeminiJson: async (opts) => {
          opts.onMetadata?.({
            model: "gemini-3.8-flash",
            totalTokens: 3150,
            promptTokens: 2500,
            completionTokens: 650,
          });
          return { editPlan: "cut silences" };
        },
      },
      "./editorTokenBudget": {
        reserveEditorTokens: async () => ({ leaseId: "lease-gemini-telemetry" }),
        settleEditorTokens: async (uid, budget, lease, total) => {
          settledAmount = total;
        },
        worstCaseTokens: () => 5000,
      },
      "./editorFallbackPrompt": {
        compactEditorFallback: () => ({ prompt: "{\"type\":\"test\"}", systemInstruction: "instruction" }),
      },
      "../serviceMessages": {
        publicServiceText: (s) => s,
      },
      "./radoxConfig": {
        EDITOR_AI_MODEL: "radox-v1",
      },
    });

    const { generateEditPlanJson } = load("app/lib/server/editorProvider.ts");

    const result = await generateEditPlanJson({
      userId: "user-telemetry-gemini",
      editingBudget: { jobId: "job-1" },
      prompt: "test",
      observer: {
        before: async () => {},
        after: async (data) => { observerAfter = data; },
      },
    });

    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3.8-flash");

    // Settle amount MUST match 3150, NOT the legacy hardcoded 500!
    assert.equal(settledAmount, 3150, "settleEditorTokens must receive actual tokens (3150), not hardcoded 500");
    assert.equal(observerAfter.total, 3150);
    assert.equal(observerAfter.input, 2500);
    assert.equal(observerAfter.output, 650);
  });

  test("4.3 geminiService attaches candidateImages, footageFrames, and referenceImages as inline_data parts", async () => {
    let sentBody = null;

    const mockFetch = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{\"analysis\": \"frames reviewed\"}" }] } }],
          usageMetadata: { totalTokenCount: 1200 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { load } = createModuleLoader(
      {
        "./providerRegistry": {
          getProviderCredential: async () => "gemini-api-key-test",
          recordProviderUsage: async () => {},
        },
      },
      { fetch: mockFetch }
    );

    const { generateGeminiContent } = load("app/lib/server/geminiService.ts");

    await generateGeminiContent({
      prompt: "Analyze visuals",
      referenceImages: [
        { styleId: "ref-style-A", timeSecondsApprox: 1.5, mediaType: "image/png", data: "BASE64_REF_DATA" },
      ],
      footageFrames: [
        { clipId: "clip-123", timelineTime: 4.0, sourceTime: 2.0, data: "BASE64_FRAME_DATA" },
      ],
      candidateImages: [
        { candidateId: "cand-999", data: "BASE64_CAND_DATA" },
      ],
    });

    assert.ok(sentBody);
    const parts = sentBody.contents[0].parts;

    // Check Reference Image Part
    const refTextPart = parts.find((p) => p.text?.includes("PRIVATE STYLE REFERENCE ref-style-A"));
    assert.ok(refTextPart, "Reference image descriptor must be present");
    const refDataPart = parts.find((p) => p.inline_data?.data === "BASE64_REF_DATA");
    assert.ok(refDataPart, "Reference image inline_data must be attached");
    assert.equal(refDataPart.inline_data.mime_type, "image/png");

    // Check Footage Frame Part
    const frameTextPart = parts.find((p) => p.text?.includes("CURRENT FOOTAGE FRAME"));
    assert.ok(frameTextPart, "Footage frame descriptor must be present");
    const frameDataPart = parts.find((p) => p.inline_data?.data === "BASE64_FRAME_DATA");
    assert.ok(frameDataPart, "Footage frame inline_data must be attached");
    assert.equal(frameDataPart.inline_data.mime_type, "image/jpeg");

    // Check Candidate Image Part
    const candTextPart = parts.find((p) => p.text?.includes("B-ROLL CANDIDATE cand-999"));
    assert.ok(candTextPart, "Candidate image descriptor must be present");
    const candDataPart = parts.find((p) => p.inline_data?.data === "BASE64_CAND_DATA");
    assert.ok(candDataPart, "Candidate image inline_data must be attached");
  });

  test("4.4 editorProvider forwards visual images on attempt 1 (priorAttempts === 0) and omits on subsequent attempts", async () => {
    let capturedOptionsAttempt1 = null;
    let capturedOptionsAttempt2 = null;
    let callIndex = 0;

    class MockGroqEditorError extends Error {
      constructor(m, code = "GROQ_UNAVAILABLE", status = 503) {
        super(m);
        this.name = "GroqEditorError";
        this.code = code;
        this.status = status;
      }
    }

    const { load } = createModuleLoader({
      "./radoxService": { generateEditorJson: async () => {}, RadoxEditorError: class extends Error {} },
      "./groqEditorFallback": {
        generateGroqEditorJson: async () => {
          throw new MockGroqEditorError("Groq failed", "GROQ_UNAVAILABLE", 503);
        },
        GroqEditorError: MockGroqEditorError,
      },
      "./geminiService": {
        GEMINI_EDITOR_MODEL: "gemini-3.8-flash",
        generateGeminiJson: async (opts) => {
          callIndex++;
          if (callIndex === 1) {
            capturedOptionsAttempt1 = opts;
            return { plan: "done" };
          } else {
            capturedOptionsAttempt2 = opts;
            return { plan: "retry" };
          }
        },
      },
      "./editorTokenBudget": {
        reserveEditorTokens: async () => ({ leaseId: "lease" }),
        settleEditorTokens: async () => {},
        worstCaseTokens: () => 5000,
      },
      "./editorFallbackPrompt": {
        compactEditorFallback: () => ({ prompt: "{\"prompt\":\"test\"}", systemInstruction: "instruction" }),
      },
      "../serviceMessages": { publicServiceText: (s) => s },
      "./radoxConfig": { EDITOR_AI_MODEL: "radox" },
    });

    const { generateEditPlanJson } = load("app/lib/server/editorProvider.ts");

    // Direct Gemini choice with priorAttempts = 0
    await generateEditPlanJson(
      {
        prompt: "test",
        candidateImages: [{ candidateId: "c1", data: "D1" }],
        footageFrames: [{ clipId: "f1", data: "D2" }],
        referenceImages: [{ styleId: "s1", data: "D3" }],
      },
      { provider: "gemini" }
    );

    assert.ok(capturedOptionsAttempt1.candidateImages, "Attempt 1 (priorAttempts=0) must attach candidateImages");
    assert.ok(capturedOptionsAttempt1.footageFrames, "Attempt 1 (priorAttempts=0) must attach footageFrames");
    assert.ok(capturedOptionsAttempt1.referenceImages, "Attempt 1 (priorAttempts=0) must attach referenceImages");

    // Fallback from Groq error (which sets priorAttempts = attempts + 1 = 1)
    await generateEditPlanJson({
      prompt: "test",
      candidateImages: [{ candidateId: "c1", data: "D1" }],
      footageFrames: [{ clipId: "f1", data: "D2" }],
      referenceImages: [{ styleId: "s1", data: "D3" }],
    });

    assert.equal(capturedOptionsAttempt2.candidateImages, undefined, "Retry attempt must omit candidateImages to prevent payload bloat");
    assert.equal(capturedOptionsAttempt2.footageFrames, undefined, "Retry attempt must omit footageFrames");
    assert.equal(capturedOptionsAttempt2.referenceImages, undefined, "Retry attempt must omit referenceImages");
  });
});

// ==============================================================================
// SUITE 5: Locked Track Resilience in aiValidation.ts
// ==============================================================================
describe("Challenger Suite 5: Locked Track Snapshot Validation Resilience (aiValidation.ts)", () => {
  test("5.1 aiProjectSnapshot does not crash when locked track has visualTreatment", () => {
    const { load } = createModuleLoader();
    const { aiProjectSnapshot } = load("app/lib/editor/aiValidation.ts");

    const projectWithLockedTrack = {
      schemaVersion: 1,
      id: "proj-locked-resilience",
      title: "Resilience Project",
      revision: 4,
      trackOrder: ["track-locked-vid", "track-unlocked-overlay"],
      tracks: {
        "track-locked-vid": {
          id: "track-locked-vid",
          name: "B-Roll Locked",
          kind: "video",
          clipIds: ["clip-locked-1"],
          hidden: false,
          muted: false,
          locked: true, // LOCKED TRACK
        },
        "track-unlocked-overlay": {
          id: "track-unlocked-overlay",
          name: "Overlay",
          kind: "overlay",
          clipIds: ["clip-unlocked-1"],
          hidden: false,
          muted: false,
          locked: false,
        },
      },
      clips: {
        "clip-locked-1": {
          id: "clip-locked-1",
          assetId: "asset-vid-1",
          trackId: "track-locked-vid",
          name: "Locked Video Clip",
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceEnd: 5,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
          volume: 1,
          speed: 1,
          fadeIn: 0,
          fadeOut: 0,
          // visualTreatment on locked track!
          visualTreatment: {
            entrance: { sourceDuration: 0.8, sourceTime: 0, opacity: 0 },
            exit: { sourceDuration: 0.5, sourceTime: 4.5, opacity: 0 },
            effects: [{ sourceStart: 1, sourceEnd: 3, blur: 4 }],
          },
        },
        "clip-unlocked-1": {
          id: "clip-unlocked-1",
          assetId: "asset-img-1",
          trackId: "track-unlocked-overlay",
          name: "Unlocked Overlay Clip",
          startTime: 1,
          duration: 3,
          sourceStart: 0,
          sourceEnd: 3,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.9 },
          effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
          volume: 0,
          speed: 1,
          fadeIn: 0,
          fadeOut: 0,
        },
      },
      assets: {
        "asset-vid-1": { id: "asset-vid-1", name: "nature.mp4", kind: "video", duration: 15, width: 1920, height: 1080 },
        "asset-img-1": { id: "asset-img-1", name: "badge.png", kind: "image", duration: 0, width: 500, height: 500 },
      },
      textLayers: {},
      captions: {},
      transitions: {},
      settings: { aspectRatio: "16:9", fps: 30, background: "#000000" },
    };

    // If locked tracks were not skipped in aiValidation.ts line 83,
    // setVisualTreatment would throw: "Select an unlocked video or image clip."
    assert.doesNotThrow(() => {
      const sanitized = aiProjectSnapshot(projectWithLockedTrack);
      assert.equal(sanitized.id, "proj-locked-resilience");
      assert.equal(sanitized.clips["clip-locked-1"].visualTreatment.entrance.sourceDuration, 0.8);
    }, "aiProjectSnapshot must accept locked tracks with visualTreatment without throwing");
  });

  test("5.2 Unlocked tracks with invalid visualTreatment exceeding media duration are still properly rejected", () => {
    const { load } = createModuleLoader();
    const { aiProjectSnapshot } = load("app/lib/editor/aiValidation.ts");

    const projectWithExceedingEffect = {
      schemaVersion: 1,
      id: "proj-invalid-effect",
      title: "Invalid",
      revision: 1,
      trackOrder: ["track-unlocked"],
      tracks: {
        "track-unlocked": {
          id: "track-unlocked",
          name: "Video",
          kind: "video",
          clipIds: ["clip-invalid"],
          hidden: false,
          muted: false,
          locked: false, // UNLOCKED track: validation runs!
        },
      },
      clips: {
        "clip-invalid": {
          id: "clip-invalid",
          assetId: "asset-short",
          trackId: "track-unlocked",
          name: "Clip",
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceEnd: 5,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
          volume: 1,
          speed: 1,
          fadeIn: 0,
          fadeOut: 0,
          // Effect sourceEnd is 15s on an 8s asset!
          visualTreatment: {
            effects: [{ sourceStart: 0, sourceEnd: 15, blur: 5 }],
          },
        },
      },
      assets: {
        "asset-short": { id: "asset-short", name: "short.mp4", kind: "video", duration: 8, width: 1920, height: 1080 },
      },
      textLayers: {},
      captions: {},
      transitions: {},
      settings: { aspectRatio: "16:9", fps: 30, background: "#000000" },
    };

    assert.throws(
      () => aiProjectSnapshot(projectWithExceedingEffect),
      (err) => err.message.includes("Visual effects must fit inside the original media source interval")
    );
  });
});

// ==============================================================================
// SUITE 6: Alpha & Filter Composition in studioCanvas & canvasCaptions
// ==============================================================================
describe("Challenger Suite 6: Alpha & Filter Composition (studioCanvas.ts & canvasCaptions.ts)", () => {
  function createMockCanvasContext(initialAlpha = 1.0, initialFilter = "none") {
    const stateStack = [];
    let currentAlpha = initialAlpha;
    let currentFilter = initialFilter;
    const alphaHistory = [];
    const filterHistory = [];

    const ctx = {
      get globalAlpha() {
        return currentAlpha;
      },
      set globalAlpha(v) {
        currentAlpha = v;
        alphaHistory.push(v);
      },
      get filter() {
        return currentFilter;
      },
      set filter(v) {
        currentFilter = v;
        filterHistory.push(v);
      },
      font: "32px sans-serif",
      textAlign: "center",
      textBaseline: "middle",
      direction: "ltr",
      letterSpacing: "0px",
      fillStyle: "#ffffff",
      strokeStyle: "#000000",
      lineWidth: 1,
      shadowColor: "transparent",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      save() {
        stateStack.push({ alpha: currentAlpha, filter: currentFilter });
      },
      restore() {
        const popped = stateStack.pop();
        if (popped) {
          currentAlpha = popped.alpha;
          currentFilter = popped.filter;
        }
      },
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      roundRect: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeText: () => {},
      fillText: () => {},
      measureText: (text) => ({ width: text.length * 15 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      _alphaHistory: alphaHistory,
      _filterHistory: filterHistory,
    };
    return ctx;
  }

  test("6.1 studioCanvas preserves parent clip alpha by multiplying rather than overwriting", () => {
    const { load } = createModuleLoader();
    const { drawStudioCaption } = load("app/lib/captions/studioCanvas.ts");

    const segment = {
      id: "seg-alpha-test",
      start: 0,
      end: 4,
      text: "hello world captions",
      words: [
        { word: "hello", start: 0, end: 1 },
        { word: "world", start: 1, end: 2 },
        { word: "captions", start: 2, end: 3 },
      ],
      templateId: "clean-sub",
    };

    const style = {
      fontFamily: "Inter",
      fontSize: 36,
      fontWeight: 700,
      textColor: "#ffffff",
      highlightColor: "#ffcc00",
      animationSpeed: 0.3,
      lineSpacing: 1.2,
      maxWordsPerLine: 4,
      position: "bottom",
      studio: {
        entrance: "fade",
        exit: "fade",
      },
    };

    // Parent clip has opacity = 0.5 (e.g. cross-fading or semi-transparent track)
    const ctx = createMockCanvasContext(0.5, "none");

    drawStudioCaption(ctx, segment, style, 1.5, 720, 1280);

    // Verify all alpha assignments were multiplied with baseAlpha = 0.5
    assert.ok(ctx._alphaHistory.length > 0, "Global alpha must be assigned during drawing");
    for (const alpha of ctx._alphaHistory) {
      assert.ok(alpha <= 0.50001, `Alpha assignment (${alpha}) must not exceed parent alpha (0.5)`);
      assert.ok(alpha >= 0, `Alpha assignment (${alpha}) must be non-negative`);
    }
  });

  test("6.2 studioCanvas cascades base ctx.filter without resetting to 'none'", () => {
    const { load } = createModuleLoader();
    const { drawStudioCaption } = load("app/lib/captions/studioCanvas.ts");

    const segment = {
      id: "seg-filter-test",
      start: 0,
      end: 4,
      text: "blurred motion words",
      words: [
        { word: "blurred", start: 0, end: 1 },
        { word: "motion", start: 1, end: 2 },
        { word: "words", start: 2, end: 3 },
      ],
      templateId: "clean-sub",
    };

    const style = {
      fontFamily: "Inter",
      fontSize: 36,
      fontWeight: 700,
      textColor: "#ffffff",
      highlightColor: "#ffcc00",
      animationSpeed: 0.3,
      lineSpacing: 1.2,
      maxWordsPerLine: 4,
      position: "bottom",
      studio: {
        entrance: "blur",
        exit: "blur",
      },
    };

    // Parent canvas context has brightness adjustment filter
    const ctx = createMockCanvasContext(1.0, "brightness(1.2)");

    drawStudioCaption(ctx, segment, style, 0.1, 720, 1280);

    // If filters were assigned, they MUST preserve 'brightness(1.2)' rather than wiping to 'none'
    for (const f of ctx._filterHistory) {
      assert.ok(f.includes("brightness(1.2)"), `Filter (${f}) must preserve parent filter 'brightness(1.2)'`);
      assert.notEqual(f, "none", "Filter must not be wiped to 'none'");
    }
  });

  test("6.3 canvasCaptions fade animation multiplies ctx.globalAlpha instead of hardcoding", () => {
    const { load } = createModuleLoader();
    const { drawCaptions } = load("app/lib/captions/canvasCaptions.ts");

    const segments = [
      {
        id: "seg-simple-fade",
        start: 0,
        end: 3,
        text: "simple fade text",
        words: [
          { word: "simple", start: 0, end: 1 },
          { word: "fade", start: 1, end: 2 },
          { word: "text", start: 2, end: 3 },
        ],
      },
    ];

    const style = {
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 600,
      textColor: "#ffffff",
      highlightColor: "#00ffff",
      animation: "fade", // fade animation triggers line 84
      animationSpeed: 0.25,
      lineSpacing: 1.2,
      maxWordsPerLine: 4,
      position: "bottom",
    };

    // Parent clip has opacity = 0.6
    const ctx = createMockCanvasContext(0.6, "none");

    drawCaptions(ctx, segments, style, 0.5, 720, 1280);

    // In line 84: ctx.globalAlpha = ctx.globalAlpha * (current ? 1 : .85)
    // For base 0.6, alpha values should be 0.6 or 0.51 (0.6 * 0.85)
    assert.ok(ctx._alphaHistory.length > 0, "Fade animation should adjust globalAlpha");
    for (const a of ctx._alphaHistory) {
      assert.ok(a <= 0.60001, `Alpha (${a}) must not exceed parent alpha 0.6`);
      assert.ok(Math.abs(a - 0.6) < 1e-4 || Math.abs(a - 0.51) < 1e-4, `Alpha (${a}) must be derived from parent alpha (0.6 or 0.51)`);
    }
  });

  test("6.4 studioCanvas spotlight alpha attenuates non-current words proportionally to parent alpha (0.4 * 0.3 = 0.12)", () => {
    const { load } = createModuleLoader();
    const { drawStudioCaption } = load("app/lib/captions/studioCanvas.ts");

    const segment = {
      id: "seg-spotlight",
      start: 0,
      end: 4,
      text: "wordA wordB wordC",
      words: [
        { word: "wordA", start: 0, end: 1 },
        { word: "wordB", start: 1, end: 2 },
        { word: "wordC", start: 2, end: 3 },
      ],
      templateId: "clean-sub",
    };

    const style = {
      fontFamily: "Inter",
      fontSize: 36,
      fontWeight: 700,
      textColor: "#ffffff",
      highlightColor: "#ffcc00",
      animationSpeed: 0.3,
      lineSpacing: 1.2,
      maxWordsPerLine: 4,
      position: "bottom",
      studio: {
        spotlight: true, // Enables spotlight mode
      },
    };

    // Parent alpha is 0.4
    const ctx = createMockCanvasContext(0.4, "none");

    // At time 1.5, current word is wordB (n=1). wordA and wordC should get baseAlpha * 0.3 = 0.4 * 0.3 = 0.12
    drawStudioCaption(ctx, segment, style, 1.5, 720, 1280);

    assert.ok(ctx._alphaHistory.length > 0);
    // Values should include ~0.4 (for wordB) and ~0.12 (for wordA and wordC)
    const hasSpotlightDim = ctx._alphaHistory.some((a) => Math.abs(a - 0.12) < 0.02);
    assert.ok(hasSpotlightDim, "Spotlight must attenuate non-highlighted words to baseAlpha * 0.3 (0.12)");
  });

  test("6.5 studioCanvas multi-filter parent composition preserves complex filters", () => {
    const { load } = createModuleLoader();
    const { drawStudioCaption } = load("app/lib/captions/studioCanvas.ts");

    const segment = {
      id: "seg-multifilter",
      start: 0,
      end: 3,
      text: "multi filter check",
      words: [
        { word: "multi", start: 0, end: 1 },
        { word: "filter", start: 1, end: 2 },
        { word: "check", start: 2, end: 3 },
      ],
      templateId: "clean-sub",
    };

    const style = {
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 600,
      textColor: "#ffffff",
      highlightColor: "#ff0000",
      animationSpeed: 0.2,
      lineSpacing: 1.2,
      maxWordsPerLine: 4,
      position: "bottom",
      studio: {
        entrance: "blur",
      },
    };

    const complexParentFilter = "brightness(1.1) contrast(1.2) saturate(0.9)";
    const ctx = createMockCanvasContext(1.0, complexParentFilter);

    drawStudioCaption(ctx, segment, style, 0.05, 720, 1280);

    for (const f of ctx._filterHistory) {
      assert.ok(f.startsWith(complexParentFilter), `Composed filter (${f}) must preserve initial filter chain`);
    }
  });
});
