const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const source = fs.readFileSync(
  path.join(__dirname, "..", "prompt-enhancement.js"), "utf8",
).replace("  async function enhance() {",
  "  window.__safetyTest = { write, contextText };\n  async function enhance() {");

test("回填前重入与上下文正文回归（合成页面，无模型请求）", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  const errors = [];
  async function pageFor(tag = "div") {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://safety.test/**", (route) => route.fulfill({
      contentType: "text/html",
      body: `<style>.composer-surface-chrome{height:180px;width:600px} .ProseMirror,textarea{height:100px;width:500px}</style>
        <main><div class="composer-surface-chrome">
        <${tag} class="ProseMirror" contenteditable="true" aria-label="Message">original draft</${tag}>
        <div class="composer-footer"><button aria-label="Send">send</button></div>
        </div></main>`,
    }));
    await page.goto("https://safety.test/");
    await page.addScriptTag({ content: source });
    return page;
  }
  try {
    for (const tag of ["div", "textarea"]) {
      for (const mutation of ["draft", "session", "attachment", "structure"]) {
        if (tag === "textarea" && mutation === "structure") continue;
        await t.test(`${tag} focus 同步改变 ${mutation} 时不覆盖`, async () => {
          const page = await pageFor(tag);
          try {
            const result = await page.evaluate(async (mutation) => {
              const node = document.querySelector(".ProseMirror");
              let commands = 0;
              document.execCommand = () => { commands++; return true; };
              node.addEventListener("focus", () => {
                if (mutation === "draft") {
                  if (node.tagName === "TEXTAREA") node.value = "new draft";
                  else node.textContent = "new draft";
                } else if (mutation === "session") history.pushState({}, "", "/other");
                else if (mutation === "attachment") {
                  const item = document.createElement("span");
                  item.dataset.attachmentId = "new";
                  node.after(item);
                } else node.innerHTML = "<strong>original draft</strong>";
              }, { once: true });
              const status = (await window.__safetyTest.write(node, "enhanced draft")).status;
              return { status, commands, text: node.tagName === "TEXTAREA" ? node.value : node.innerText };
            }, mutation);
            assert.equal(result.status, "blocked");
            assert.equal(result.commands, 0);
            assert.equal(result.text, mutation === "draft" ? "new draft" : "original draft");
          } finally { await page.close(); }
        });
      }
      await t.test(`${tag} 正常写入仍能确认成功`, async () => {
        const page = await pageFor(tag);
        try {
          const result = await page.evaluate(async () => {
            const node = document.querySelector(".ProseMirror");
            return window.__safetyTest.write(node, "enhanced draft");
          });
          assert.equal(result.status, "applied");
          assert.equal(result.actual, "enhanced draft");
        } finally { await page.close(); }
      });
    }
    await t.test("上下文保留段落、代码行、列表和表格边界，排除隐藏正文", async () => {
      const page = await pageFor();
      try {
        const result = await page.evaluate(() => {
          const message = document.createElement("section");
          message.innerHTML = '<p>请检查 <strong>foo</strong>：</p><pre><code>first();\nsecond();</code></pre><p>要求<br>如下</p><ul><li>保持接口</li><li>验证结果</li></ul><table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table><p hidden>HIDDEN</p><div inert>INERT</div><script>SECRET</script><button>copy</button>';
          return window.__safetyTest.contextText(message);
        });
        assert.equal(result, "请检查 foo：\nfirst();\nsecond();\n要求\n如下\n保持接口\n验证结果\nA\tB\nC\tD");
      } finally { await page.close(); }
    });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
