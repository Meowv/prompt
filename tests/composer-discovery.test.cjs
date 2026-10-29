const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 模拟宿主切换控件和丢失绑定，直接执行脚本中的识别函数与输入监听器。
const script = fs.readFileSync(
  path.join(__dirname, "..", "prompt-enhancement.js"),
  "utf8",
);
const discovery = script.slice(
  script.indexOf("  const EDITORS ="),
  script.indexOf("  function locate()"),
);
const inputStart = script.indexOf('  listen(\n    document,\n    "input",');
assert.ok(inputStart > 0);
const inputListener = script.slice(
  inputStart,
  script.indexOf('  listen(\n    document,\n    "compositionstart",', inputStart),
);

function setup({ knownComposer = true, control = null, excluded = false, proseMirror = true } = {}) {
  let scheduled = 0;
  const container = {
    getBoundingClientRect: () => ({ height: 200 }),
    querySelector: (selector) =>
      control && selector.includes(control) ? {} : null,
    closest: () => (knownComposer ? container : null),
  };
  const node = {
    disabled: false,
    readOnly: false,
    parentElement: container,
    closest(selector) {
      if (selector.includes("aside")) return excluded ? {} : null;
      if (selector.includes("composer-surface-chrome"))
        return knownComposer ? container : null;
      return this;
    },
    getBoundingClientRect: () => ({ width: 600, height: 100, bottom: 800 }),
    getAttribute: () => "",
    classList: { contains: () => proseMirror },
    matches: () => false,
    contains(target) {
      return target === this;
    },
  };
  const document = { body: {}, activeElement: node };
  container.parentElement = document.body;
  const context = vm.createContext({
    document,
    innerHeight: 1000,
    own: () => false,
    activeLock: null,
    getComputedStyle: () => ({ visibility: "visible" }),
    editor: null,
    host: { isConnected: false },
    writing: false,
    discoveryNeeded: false,
    schedule: () => scheduled++,
    listen: (_target, name, handler) => {
      if (name === "input") context.onInput = handler;
    },
  });
  vm.runInContext(discovery + "\nglobalThis.candidate = candidate;", context);
  vm.runInContext(inputListener, context);
  return { context, node, container, scheduled: () => scheduled };
}

test("明确的 Composer 在停止状态及控件临时缺失时仍可识别", () => {
  for (const control of ["Send", "Stop", "停止", null]) {
    const { context, node, container } = setup({ control });
    assert.equal(context.candidate(node)?.container, container);
  }
});

test("已知输入区中的编辑器不依赖类名或占位提示，区外仍需语义证据", () => {
  const inside = setup({ proseMirror: false });
  assert.equal(inside.context.candidate(inside.node)?.container, inside.container);
  const outside = setup({ proseMirror: false, knownComposer: false });
  assert.equal(outside.context.candidate(outside.node), null);
});

test("无 Composer 标记时，支持通过发送或停止控件定位祖先", () => {
  for (const control of ["Send", "发送", "Stop", "停止", "stop"]) {
    const { context, node, container } = setup({
      knownComposer: false,
      control,
    });
    assert.equal(context.candidate(node)?.container, container);
  }
  const { context, node } = setup({ knownComposer: false });
  assert.equal(context.candidate(node), null);
});

test("不可编辑输入框和对话框内输入仍被排除", () => {
  for (const property of ["disabled", "readOnly"]) {
    const { context, node } = setup();
    node[property] = true;
    assert.equal(context.candidate(node), null);
  }
  const { context, node } = setup({ excluded: true });
  assert.equal(context.candidate(node), null);
});

test("失去绑定后重新输入会触发发现", () => {
  const { context, node, scheduled } = setup();
  context.onInput({ target: node });
  assert.equal(context.discoveryNeeded, true);
  assert.equal(scheduled(), 1);
});

test("非编辑器输入与脚本回填不触发发现", () => {
  const { context, node, scheduled } = setup();
  context.onInput({ target: { closest: () => null } });
  context.writing = true;
  context.onInput({ target: node });
  assert.equal(scheduled(), 0);
});

test("已绑定编辑器输入后仍重新检查按钮挂载", () => {
  const { context, node, scheduled } = setup();
  Object.assign(context, {
    editor: node,
    host: { isConnected: true },
    pendingWrite: false,
    hideTooltip() {},
    version: 0,
    drafts: new Map(),
    session: () => "thread",
    text: () => "草稿",
    update() {},
  });
  context.onInput({ target: node });
  assert.equal(scheduled(), 1);
});

test("输入区内部显隐样式变化会触发检查，外部流式内容样式不触发", () => {
  const inside = {};
  const context = vm.createContext({
    own: () => false,
    shell: { contains: (node) => node === inside },
  });
  vm.runInContext(
    script.slice(script.indexOf("  function affectsComposer("), script.indexOf("  const observer =")) +
      "\nglobalThis.checkMutation = affectsComposer;",
    context,
  );
  for (const attributeName of ["style", "class"]) {
    assert.equal(context.checkMutation({ type: "attributes", target: inside, attributeName }), true);
    assert.equal(context.checkMutation({ type: "attributes", target: {}, attributeName }), false);
  }
});
