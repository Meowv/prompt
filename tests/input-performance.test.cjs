const test = require("node:test");
test("空白切换保留占位且更新可访问状态", () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    assert = require("node:assert/strict");
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "..", "prompt-enhancement.js"),
    "utf8",
  );
  const a = source.indexOf("  function update()"),
    b = source.indexOf("  function lockEditor(", a);
  let draft = "";
  const attributes = new Map();
  const host = {
    dataset: { axpeEmpty: "true" },
    inert: true,
    setAttribute: (k, v) => attributes.set(k, v),
  };
  Object.defineProperty(host, "hidden", {
    get() {
      return false;
    },
    set() {
      throw Error("不得通过 hidden 让底栏按钮进出布局");
    },
  });
  const attrs = new Map(),
    ctx = vm.createContext({
      composing: false,
      job: null,
      editor: {},
      pendingWrite: false,
      version: 1,
      host,
      restore: { hidden: true, disabled: false },
      caption: { textContent: "增强提示词" },
      main: {
        classList: { contains: () => false, toggle() {} },
        getAttribute: (k) => attrs.get(k),
        setAttribute: (k, v) => attrs.set(k, v),
      },
      drafts: new Map(),
      session: () => "fixture",
      text: () => draft,
      writable: () => true,
      configured: () => true,
      triggerVisible: () => true,
      hideTooltip() {},
      schedulePosition() {},
    });
  vm.runInContext(source.slice(a, b) + "\nglobalThis.update=update;", ctx);
  draft = "字";
  ctx.update();
  assert.equal(host.dataset.axpeEmpty, "false");
  assert.equal(host.inert, false);
  assert.equal(attributes.get("aria-hidden"), "false");
  draft = "";
  ctx.update();
  assert.equal(host.dataset.axpeEmpty, "true");
  assert.equal(host.inert, true);
  assert.equal(attributes.get("aria-hidden"), "true");
});

test("组合输入不读取文本且保留取消和还原", () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    assert = require("node:assert/strict");
  const s = fs.readFileSync(
    require("node:path").join(__dirname, "..", "prompt-enhancement.js"),
    "utf8",
  );
  const start = s.indexOf("  function update()"),
    end = s.indexOf("  function lockEditor(", start);
  assert.ok(start >= 0 && end > start);
  function fixture(composing, job = null, record = null) {
    let reads = 0,
      positions = 0;
    const attrs = new Map(),
      ctx = vm.createContext({
        composing,
        job,
        editor: {},
        pendingWrite: false,
        version: 2,
        host: {
          hidden: false,
          dataset: { axpeEmpty: "false" },
          setAttribute() {},
          inert: false,
        },
        main: {
          classList: { contains: () => false, toggle() {} },
          getAttribute: (k) => attrs.get(k),
          setAttribute: (k, v) => attrs.set(k, v),
        },
        restore: {},
        caption: {},
        drafts: new Map(record ? [["test", record]] : []),
        session: () => "test",
        text: () => {
          reads++;
          return "用户输入";
        },
        writable: () => true,
        configured: () => true,
        triggerVisible: () => true,
        hideTooltip() {},
        schedulePosition() {
          positions++;
        },
        position() {
          positions++;
        },
      });
    vm.runInContext(s.slice(start, end) + "\nupdate();", ctx);
    return { ctx, attrs, reads, positions };
  }
  const composing = fixture(true);
  assert.equal(composing.reads, 0, "IME 输入期间不得读取 innerText");
  assert.equal(composing.positions, 0);
  assert.equal(composing.attrs.get("aria-disabled"), "true");
  const idle = fixture(false);
  assert.equal(idle.reads, 1, "每次更新只读取一次编辑器文本");
  assert.equal(idle.ctx.host.hidden, false);
  const busy = fixture(false, {});
  assert.equal(busy.attrs.get("aria-busy"), "true");
  assert.equal(busy.attrs.get("aria-disabled"), "false", "保留取消增强入口");
  const restore = fixture(false, null, { result: "用户输入", revision: 2 });
  assert.equal(restore.ctx.restore.hidden, false);
});

test("稳定更新零写入、定位合并且过滤无关属性", () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    assert = require("node:assert/strict");
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "..", "prompt-enhancement.js"),
    "utf8",
  );
  function code(start, end) {
    const a = source.indexOf("  function " + start + "("),
      b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a);
    return source.slice(a, b);
  }
  let writes = 0;
  const tracked = (o) =>
    new Proxy(o, {
      set(target, key, value) {
        writes++;
        target[key] = value;
        return true;
      },
    });
  const attrs = new Map([
    ["aria-busy", "false"],
    ["aria-disabled", "false"],
  ]);
  const ctx = vm.createContext({
    composing: false,
    job: null,
    editor: {},
    pendingWrite: false,
    version: 1,
    host: tracked({
      hidden: false,
      dataset: tracked({ axpeEmpty: "false" }),
      inert: false,
      setAttribute() {
        writes++;
      },
    }),
    restore: tracked({ hidden: true, disabled: false }),
    caption: tracked({ textContent: "增强提示词" }),
    main: {
      classList: {
        contains: () => false,
        toggle() {
          writes++;
        },
      },
      getAttribute: (k) => attrs.get(k),
      setAttribute(k, v) {
        writes++;
        attrs.set(k, v);
      },
    },
    drafts: new Map(),
    session: () => "fixture",
    text: () => "测试草稿",
    writable: () => true,
    configured: () => true,
    triggerVisible: () => true,
    hideTooltip() {},
    position() {},
    schedulePosition() {},
  });
  vm.runInContext(
    code("update", "  function lockEditor(") + "\nupdate();update();",
    ctx,
  );
  assert.equal(writes, 0, "稳定草稿反复检查不得改写按钮 DOM");

  writes = 0;
  const tooltip = {
    hidden: false,
    style: tracked({ left: "35px", top: "48px" }),
    getBoundingClientRect: () => ({ width: 50, height: 20 }),
  };
  const tt = vm.createContext({
    tooltip,
    triggerVisible: () => true,
    hideTooltip() {},
    main: {
      getBoundingClientRect: () => ({
        left: 10,
        width: 100,
        top: 10,
        bottom: 40,
      }),
    },
    innerHeight: 600,
    innerWidth: 800,
  });
  vm.runInContext(
    code("positionTooltip", '  main.addEventListener("pointerenter"') +
      "\npositionTooltip();positionTooltip();",
    tt,
  );
  assert.equal(writes, 0, "相同悬浮提示位置不得反复改写 style");

  const frames = [];
  let positions = 0;
  const sc = vm.createContext({
    disposed: false,
    composing: false,
    tooltip: { hidden: false },
    panel: null,
    requestAnimationFrame(fn) {
      frames.push(fn);
      return frames.length;
    },
    position() {
      positions++;
    },
  });
  const a = source.indexOf("  let positionFrame = 0;"),
    b = source.indexOf("  function openSettings(", a);
  assert.ok(a >= 0 && b > a, "必须提供合并后的定位调度");
  vm.runInContext(
    source.slice(a, b) +
      "\nschedulePosition();schedulePosition();schedulePosition();",
    sc,
  );
  assert.equal(frames.length, 1);
  frames[0]();
  assert.equal(positions, 1);

  const editor = { isConnected: true },
    shell = { contains: () => false };
  const ac = vm.createContext({
    editor,
    shell,
    discoveryNeeded: false,
    own: () => false,
  });
  vm.runInContext(
    code("affectsComposer", "  const observer =") +
      "\nglobalThis.check=affectsComposer;",
    ac,
  );
  assert.equal(
    ac.check({
      type: "attributes",
      attributeName: "hidden",
      target: { contains: () => false },
    }),
    false,
    "其他浮窗显隐不得触发编辑器检查",
  );
  assert.equal(
    ac.check({ type: "attributes", attributeName: "class", target: editor }),
    true,
  );
  assert.equal(
    ac.check({
      type: "attributes",
      attributeName: "aria-selected",
      target: {},
    }),
    true,
    "保留聊天切换发现",
  );
});
