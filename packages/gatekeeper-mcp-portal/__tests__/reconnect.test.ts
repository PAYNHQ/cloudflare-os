import { afterEach, describe, expect, it, vi } from "vitest";

import { GatekeeperUserImpl } from "../src/portal.js";

// Enough of `McpAccount` for `withClient` to run a `tools/call`, plus the base reconnect account
// methods so a fallback to the inherited flow would be observable.
function accountStub() {
  return {
    async getServer() {
      return {
        endpoint: "https://gw.example.com/mcp",
        serverId: "gw-example",
        serverName: "Portal",
        provenance: "deployment" as const,
        auth: "oauth" as const,
      };
    },
    async getConnection() {
      // A session id already on file skips `initialize`, so the stubbed `fetch` below only has to
      // answer the one `tools/call` request this test cares about.
      return { authorization: "token", sessionId: "session", generation: 1 };
    },
    async assertConnectionCurrent() {},
    async setMcpSessionId() { return true; },
    async noteCredentialsExpired() {},
    prepareReconnect: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
  };
}

function user(account: ReturnType<typeof accountStub>) {
  const ctx = {
    props: { accountObjectId: "account-1" },
    exports: {
      McpAccount: {
        idFromString: (id: string) => id,
        get: () => account,
      },
    },
  };
  return new GatekeeperUserImpl(ctx as never, {} as never);
}

function jsonRpcResult(id: unknown, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("reconnect", () => {
  it("calls portal_toggle_servers with no arguments and returns the URL it finds", async () => {
    let toolCallParams: unknown;
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      toolCallParams = request.params;
      return jsonRpcResult(request.id, {
        content: [{ type: "text", text: "Re-authenticate: https://gw.example.com/reauth?x=1" }],
      });
    });

    const { url } = await user(accountStub()).reconnect();

    expect(url).toBe("https://gw.example.com/reauth?x=1");
    expect(toolCallParams).toEqual({ name: "portal_toggle_servers", arguments: {} });
  });

  it("throws instead of falling back to the inherited own-OAuth reconnect when no URL is found", async () => {
    // The base `McpGatekeeperUserBase.reconnect()` this overrides calls `account.prepareReconnect`.
    // If this override ever fell back to it on failure, the bug it fixes would return: the user
    // reconnects, the upstream authorization is untouched, and the error comes right back.
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      return jsonRpcResult(request.id, {
        content: [{ type: "text", text: "Nothing usable here." }],
      });
    });

    const account = accountStub();
    await expect(user(account).reconnect()).rejects.toThrow(
      "Could not get a re-authentication URL from the portal.");
    expect(account.prepareReconnect).not.toHaveBeenCalled();
  });

  it("throws on a tool-level error without leaking the response into the user-facing message", async () => {
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      return jsonRpcResult(request.id, {
        isError: true,
        content: [{ type: "text", text: "internal detail https://leak.example.com/should-not-surface" }],
      });
    });

    const error: Error = await user(accountStub()).reconnect().catch(err => err);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain("leak.example.com");
  });
});
