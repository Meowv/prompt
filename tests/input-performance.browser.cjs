const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const fixture = `<!doctype html><html><head><style>
body{margin:0;background:#fff;font-family:system-ui}
.composer-surface-chrome{position:fixed;left:10%;bottom:30px;width:80%;height:180px;overflow:hidden;background:#eee;display:flex;flex-direction:column}
.ProseMirror,textarea{display:block;width:100%;min-height:0;flex:1;overflow:auto;box-sizing:border-box;padding:12px}
.ProseMirror:not(:empty),textarea.filled{height:160px}
.composer-footer{height:36px;flex:0 0 36px;display:flex;align-items:center}
</style></head><body><div class="composer-surface-chrome">
<div class="ProseMirror" contenteditable="true" aria-label="Message"></div>
<div class="composer-footer"><button aria-label="Stop">停止</button></div>
</div></body></html>`;

test("完整脚本输入性能回归（仅合成草稿，不访问模型 API）", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(fixture);
    await page.addScriptTag({
      path: path.join(__dirname, "..", "prompt-enhancement.js"),
    });
    await t.test("首字输入和删除最后一字不改变邻近控件位置", async () => {
      const result = await page.evaluate(() => {
        const editor = document.querySelector(".ProseMirror");
        const bar = document.querySelector(".axpe-bar");
        const marker = document.createElement("button");
        marker.textContent = "fixture";
        bar.after(marker);
        const xs = [];
        for (let i = 0; i < 20; i++) {
          editor.textContent = i % 2 ? "" : "字";
          editor.dispatchEvent(
            new InputEvent("input", { bubbles: true, inputType: "insertText" }),
          );
          window.__axPromptEnhancerV1.ensure();
          xs.push(marker.getBoundingClientRect().left);
        }
        return {
          shift: Math.max(...xs) - Math.min(...xs),
          inert: bar.inert,
          aria: bar.getAttribute("aria-hidden"),
          visibility: getComputedStyle(bar).visibility,
        };
      });
      assert.equal(result.shift, 0);
      assert.equal(result.inert, true);
      assert.equal(result.aria, "true");
      assert.equal(result.visibility, "hidden");
    });
    await t.test("稳定草稿与悬浮提示连续检查 20 次不改写 DOM", async () => {
      await page.locator(".ProseMirror").fill("fixture draft");
      await page.locator('.axpe-bar button[aria-label="增强提示词"]').hover();
      const count = await page.evaluate(() => {
        const observer = new MutationObserver(() => {});
        for (const node of document.querySelectorAll(".axpe-bar,.axpe-tooltip"))
          observer.observe(node, {
            subtree: true,
            attributes: true,
            childList: true,
            characterData: true,
          });
        for (let i = 0; i < 20; i++) window.__axPromptEnhancerV1.ensure();
        const count = observer.takeRecords().length;
        observer.disconnect();
        return count;
      });
      assert.equal(count, 0);
    });
    await t.test(
      "组合输入期间 input 与 ensure 不读取 innerText，结束后恢复",
      async () => {
        const result = await page.evaluate(() => {
          const editor = document.querySelector(".ProseMirror");
          const descriptor = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            "innerText",
          );
          let reads = 0;
          Object.defineProperty(editor, "innerText", {
            configurable: true,
            get() {
              reads++;
              return descriptor.get.call(this);
            },
            set(value) {
              descriptor.set.call(this, value);
            },
          });
          editor.dispatchEvent(
            new CompositionEvent("compositionstart", { bubbles: true }),
          );
          reads = 0;
          editor.textContent = "组合";
          editor.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              isComposing: true,
              inputType: "insertCompositionText",
            }),
          );
          window.__axPromptEnhancerV1.ensure();
          const during = reads;
          editor.dispatchEvent(
            new CompositionEvent("compositionend", {
              bubbles: true,
              data: "组合",
            }),
          );
          const after = reads;
          delete editor.innerText;
          return { during, after };
        });
        assert.equal(result.during, 0);
        assert.ok(result.after > 0);
      },
    );
    await t.test("组合输入期间替换编辑器不会永久阻止重新绑定", async () => {
      const result = await page.evaluate(() => {
        const editor = document.querySelector(".ProseMirror");
        editor.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true }),
        );
        const next = editor.cloneNode(false);
        next.textContent = "replacement draft";
        editor.replaceWith(next);
        window.__axPromptEnhancerV1.ensure();
        const state = JSON.parse(window.__axPromptEnhancerV1.inspect());
        return {
          composing: state.composing,
          hidden: state.hidden,
          connected: state.editor.connected,
        };
      });
      assert.deepEqual(result, {
        composing: false,
        hidden: false,
        connected: true,
      });
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
