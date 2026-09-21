import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSidecarResponse,
  resolveSidecarBase,
  sidecarCall,
  tokenFromMetaJson,
  TOKEN_HEADER,
} from "../src/sidecar";

describe("resolveSidecarBase", () => {
  it("defaults and strips a trailing slash", () => {
    assert.equal(resolveSidecarBase(""), "http://127.0.0.1:9080");
    assert.equal(resolveSidecarBase("http://127.0.0.1:9080/"), "http://127.0.0.1:9080");
    assert.equal(resolveSidecarBase("http://localhost:9099"), "http://localhost:9099");
  });

  it("refuses non-loopback hosts", () => {
    assert.equal(resolveSidecarBase("http://example.com:9080"), "http://127.0.0.1:9080");
    assert.equal(resolveSidecarBase("ftp://127.0.0.1:9080"), "http://127.0.0.1:9080");
    assert.equal(resolveSidecarBase("not a url"), "http://127.0.0.1:9080");
  });
});

describe("parseSidecarResponse", () => {
  it("unwraps ok data", () => {
    assert.deepEqual(parseSidecarResponse('{"ok":true,"data":{"enabled":true}}'), {
      enabled: true,
    });
  });

  it("throws on empty, invalid, or error bodies", () => {
    assert.throws(() => parseSidecarResponse(""), /empty body/);
    assert.throws(() => parseSidecarResponse("nope"), /parse sidecar JSON/);
    assert.throws(
      () => parseSidecarResponse('{"ok":false,"error":"boom"}'),
      /boom/,
    );
  });
});

describe("tokenFromMetaJson", () => {
  it("requires a long enough http_token", () => {
    assert.equal(
      tokenFromMetaJson({ http_token: "1234567890123456" }),
      "1234567890123456",
    );
    assert.throws(() => tokenFromMetaJson({ http_token: "short" }), /http_token/);
    assert.throws(() => tokenFromMetaJson(null), /JSON/);
  });
});

describe("sidecarCall", () => {
  it("POSTs with the token and unwraps data", async () => {
    const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
    const data = await sidecarCall(
      "Notifications.GetDnd",
      undefined,
      {
        token: "tokentokentoken1",
        deps: {
          fetch: async (url, init) => {
            calls.push({ url, init });
            return {
              ok: true,
              status: 200,
              async text() {
                return JSON.stringify({ ok: true, data: { enabled: false } });
              },
            };
          },
        },
      },
    );
    assert.deepEqual(data, { enabled: false });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "http://127.0.0.1:9080/api/Notifications.GetDnd");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.headers?.[TOKEN_HEADER], "tokentokentoken1");
  });

  it("reads the runtime token file before /api/meta", async () => {
    const calls: string[] = [];
    await sidecarCall("Notifications.GetDnd", undefined, {
      deps: {
        env: { XDG_RUNTIME_DIR: "/run/user/1000" },
        readTokenFile: async (path) => {
          assert.equal(path, "/run/user/1000/aura-http-token");
          return "filetokenfiletok";
        },
        fetch: async (url, init) => {
          calls.push(url);
          assert.equal(init?.headers?.[TOKEN_HEADER], "filetokenfiletok");
          return {
            ok: true,
            status: 200,
            async text() {
              return '{"ok":true,"data":{}}';
            },
          };
        },
      },
    });
    assert.deepEqual(calls, ["http://127.0.0.1:9080/api/Notifications.GetDnd"]);
  });
});
