const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 仅运行请求模块；不加载实际页面或读取真实配置，所有服务响应均为模拟。
const script = fs.readFileSync(
  path.join(__dirname, "..", "prompt-enhancement.js"),
  "utf8",
);
const boundary = script.indexOf("  let discoveryNeeded");
assert.ok(boundary > 0, "请求模块边界应存在");
const requestModule =
  script.slice(0, boundary) +
  "globalThis.api = { request, startJob, errorText, endpoint };})();";
const settings = {
  protocol: "openai",
  baseUrl: "https://example.test/v1",
  apiKey: "YOUR_API_KEY",
  model: "test-model",
};
const ok = { choices: [{ finish_reason: "stop", message: { content: "OK" } }] };
const healthy = { status: "ok", scripts: [] };
const pending = () => new Promise(() => {});

function setup({
  probe = () => healthy,
  proxy = () => ({ status: "ok", http_status: 200, body_json: ok }),
  bridge = true,
  electron = true,
  electronBody = ok,
  electronStatus = 200,
  electronRespond = true,
} = {}) {
  const listeners = new Set(),
    routes = [],
    messages = [];
  const window = {
    addEventListener(name, fn) {
      if (name === "message") listeners.add(fn);
    },
    removeEventListener(name, fn) {
      if (name === "message") listeners.delete(fn);
    },
  };
  if (bridge)
    window.__codexSessionDeleteBridge = (route, payload) => {
      routes.push({ route, payload });
      return route === "/user-scripts/list" ? probe() : proxy(payload);
    };
  if (electron)
    window.electronBridge = {
      sendMessageFromView(message) {
        messages.push(message);
        if (message.type === "fetch" && electronRespond)
          queueMicrotask(() => {
            const event = {
              source: null,
              data: {
                type: "fetch-response",
                requestId: message.requestId,
                status: electronStatus,
                bodyJsonString: JSON.stringify(electronBody),
              },
            };
            for (const fn of [...listeners]) fn(event);
          });
      },
    };
  const context = vm.createContext({
    window,
    URL,
    DOMException,
    AbortController,
    localStorage: { getItem: () => "{}" },
    // 保留 3s 探测 < 60s 总超时的相对关系，加快超时测试。
    setTimeout: (fn, ms) =>
      setTimeout(fn, ms === 3000 ? 10 : ms === 60000 ? 100 : ms),
    clearTimeout,
  });
  vm.runInContext(requestModule, context);
  const current = context.api.startJob();
  return {
    ...context,
    current,
    routes,
    messages,
    listeners,
    run: (c) =>
      context.api.request(c || settings, "OK", current.controller.signal, true),
    close() {
      current.controller.abort();
      clearTimeout(current.timer);
    },
    fetches: () => messages.filter((m) => m.type === "fetch"),
  };
}

async function withEnvironment(options, fn) {
  const env = setup(options);
  try {
    await fn(env);
  } finally {
    env.close();
  }
}

test("先检查本地 Bridge，探测不包含密钥、地址、模型或提示词", async () => {
  await withEnvironment({}, async (e) => {
    assert.equal(await e.run(), "OK");
    assert.deepEqual(
      e.routes.map((r) => r.route),
      ["/user-scripts/list", "/llm-proxy"],
    );
    assert.equal(JSON.stringify(e.routes[0].payload), "{}");
    assert.equal(e.fetches().length, 0);
  });
});

test("Bridge 检查超时后，在模型请求发送前选择 Electron", async () => {
  await withEnvironment({ probe: pending }, async (e) => {
    assert.equal(await e.run(), "OK");
    assert.deepEqual(
      e.routes.map((r) => r.route),
      ["/user-scripts/list"],
    );
    assert.equal(e.fetches().length, 1);
    assert.equal(e.listeners.size, 0);
  });
});

for (const [name, probe] of [
  [
    "异常",
    () => {
      throw new Error("local failure");
    },
  ],
  ["空返回", () => null],
  ["无效结构", () => ({})],
  [
    "不支持检查路由",
    () => ({ status: "failed", error: { message: "unknown bridge path" } }),
  ],
])
  test(`Bridge 检查${name}时只经 Electron 发送一次`, async () => {
    await withEnvironment({ probe }, async (e) => {
      assert.equal(await e.run(), "OK");
      assert.equal(e.routes.filter((r) => r.route === "/llm-proxy").length, 0);
      assert.equal(e.fetches().length, 1);
    });
  });

test("Bridge 检查超时且无 Electron：明确说明未发送模型请求", async () => {
  await withEnvironment({ probe: pending, electron: false }, async (e) => {
    await assert.rejects(e.run(), /检查超时.*尚未发送模型请求/);
    assert.equal(e.routes.length, 1);
    assert.equal(e.fetches().length, 0);
  });
});

test("Bridge 健康但模型请求无回包：报超时，不切换重发", async () => {
  await withEnvironment({ proxy: pending }, async (e) => {
    await assert.rejects(e.run(), { name: "AbortError" });
    assert.match(
      e.api.errorText(new Error(), e.current),
      /请求超时.*未自动重发/,
    );
    assert.equal(e.routes.filter((r) => r.route === "/llm-proxy").length, 1);
    assert.equal(e.fetches().length, 0);
  });
});

test("Electron 无回包：发送取消并清理监听", async () => {
  await withEnvironment(
    { bridge: false, electronRespond: false },
    async (e) => {
      await assert.rejects(e.run(), { name: "AbortError" });
      assert.match(
        e.api.errorText(new Error(), e.current),
        /请求超时.*未自动重发/,
      );
      assert.equal(e.fetches().length, 1);
      assert.equal(
        e.messages.filter((m) => m.type === "cancel-fetch").length,
        1,
      );
      assert.equal(e.listeners.size, 0);
    },
  );
});

for (const [name, proxy] of [
  [
    "普通错误",
    () => ({ status: "failed", message: "Unknown bridge path: /llm-proxy" }),
  ],
  [
    "嵌套错误",
    () => ({
      status: "failed",
      error: { message: "Unknown bridge path: /llm-proxy" },
    }),
  ],
  [
    "JSON 错误",
    () => ({
      status: "failed",
      error: JSON.stringify({ error: { message: "Unknown bridge path" } }),
    }),
  ],
  [
    "抛出的错误",
    () => {
      throw { error: { message: "Unknown bridge path" } };
    },
  ],
])
  test(`明确不支持模型路由（${name}）才允许回退`, async () => {
    await withEnvironment({ proxy }, async (e) => {
      assert.equal(await e.run(), "OK");
      assert.equal(e.routes.filter((r) => r.route === "/llm-proxy").length, 1);
      assert.equal(e.fetches().length, 1);
    });
  });

for (const status of [400, 401, 403, 404, 429, 500])
  test(`HTTP ${status} 不触发回退或重发`, async () => {
    await withEnvironment(
      {
        proxy: () => ({
          status: "ok",
          http_status: status,
          body_json: { error: { message: "Unknown bridge path" } },
        }),
      },
      async (e) => {
        await assert.rejects(e.run());
        assert.equal(e.fetches().length, 0);
        assert.equal(
          e.routes.filter((r) => r.route === "/llm-proxy").length,
          1,
        );
      },
    );
  });

test("带 HTTP 状态的失败即使含路由错误文字也不重发", async () => {
  await withEnvironment(
    {
      proxy: () => ({
        status: "failed",
        http_status: 502,
        error: "Unknown bridge path",
      }),
    },
    async (e) => {
      await assert.rejects(e.run(), /502/);
      assert.equal(e.fetches().length, 0);
    },
  );
});

for (const [name, proxy] of [
  ["空响应", () => null],
  [
    "网络异常",
    () => {
      throw new Error("network failure");
    },
  ],
  [
    "无法解析 JSON",
    () => ({ status: "ok", http_status: 200, body_text: "invalid json" }),
  ],
])
  test(`模型请求${name}不重发`, async () => {
    await withEnvironment({ proxy }, async (e) => {
      await assert.rejects(e.run());
      assert.equal(e.fetches().length, 0);
    });
  });

test("取消 Bridge 检查不提交模型请求", async () => {
  await withEnvironment({ probe: pending }, async (e) => {
    const run = e.run();
    e.current.cancel();
    await assert.rejects(run, { name: "AbortError" });
    assert.equal(e.current.timeout, false);
    assert.equal(e.api.errorText(new Error("cancel"), e.current), "cancel");
    assert.equal(e.routes.filter((r) => r.route === "/llm-proxy").length, 0);
    assert.equal(e.fetches().length, 0);
  });
});

test("预先取消时不调用任何通道", async () => {
  await withEnvironment({}, async (e) => {
    e.current.cancel();
    await assert.rejects(e.run(), { name: "AbortError" });
    assert.equal(e.routes.length, 0);
    assert.equal(e.fetches().length, 0);
  });
});

test("Electron source 为 null 的回包仍然能解析（保留现有兼容修改）", async () => {
  await withEnvironment({ bridge: false }, async (e) => {
    assert.equal(await e.run(), "OK");
    assert.equal(e.listeners.size, 0);
  });
});

test("HTTP 200 但响应结构无效时显示解析错误，不报网络超时", async () => {
  await withEnvironment({ electronBody: {}, bridge: false }, async (e) => {
    await assert.rejects(e.run(), /文本结构无效/);
    assert.equal(e.current.timeout, false);
  });
});

test("Anthropic 请求格式保持不变", async () => {
  await withEnvironment(
    {
      bridge: false,
      electronBody: {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "OK" }],
      },
    },
    async (e) => {
      assert.equal(
        await e.run({
          ...settings,
          protocol: "anthropic",
          baseUrl: "https://example.test/v1/messages",
        }),
        "OK",
      );
      const envelope = e.fetches()[0],
        body = JSON.parse(envelope.body);
      assert.equal(envelope.url, "https://example.test/v1/messages");
      assert.equal(body.max_tokens, 4096);
      assert.equal(envelope.headers["x-api-key"], settings.apiKey);
    },
  );
});

test("Bridge 检查通过不代表 /llm-proxy 可用，未知错误不被误当成支持", async () => {
  await withEnvironment(
    {
      proxy: () => ({
        status: "failed",
        error: { message: "other local failure" },
      }),
    },
    async (e) => {
      await assert.rejects(e.run(), /未自动重发/);
      assert.equal(e.fetches().length, 0);
    },
  );
});
