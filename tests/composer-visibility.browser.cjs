const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

// 使用已有 Playwright 运行完整脚本，不访问真实会话、配置或模型 API。
// 可通过 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指定已有 Chromium 浏览器。
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

test("完整脚本：草稿控制显隐，运行状态和布局裁剪不影响按钮", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(fixture);
    await page.addScriptTag({ path: path.join(__dirname, "..", "prompt-enhancement.js") });
    const bar = page.locator(".axpe-bar");
    const main = bar.getByRole("button", { name: "增强提示词", exact: true });
    let editor = page.locator(".ProseMirror");
    async function visibleAndClickable() {
      // isVisible 不检测 overflow 裁剪，因此还要验证按钮中心的实际命中元素。
      await page.waitForFunction(() => {
        const button = document.querySelector('.axpe-bar button[aria-label="增强提示词"]');
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0 &&
          button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      });
      assert.equal(await main.getAttribute("aria-disabled"), "false");
      await main.click({ trial: true });
    }
    await t.test("运行中空白隐藏，输入文字后显示且可点击", async () => {
      assert.equal(await bar.count(), 1);
      assert.equal(await bar.isVisible(), false);
      await editor.fill("请继续处理下一项");
      await visibleAndClickable();
      assert.equal(await bar.evaluate((el) => el.parentElement.className), "composer-footer");
      const buttonBox = await main.boundingBox();
      const composerBox = await page.locator(".composer-surface-chrome").boundingBox();
      assert.ok(buttonBox.y >= composerBox.y);
      assert.ok(buttonBox.y + buttonBox.height <= composerBox.y + composerBox.height);
    });
    await t.test("与 1.0.0 实际挂载节点和坐标一致", async (t) => {
      const reference = execFileSync("git", ["show", "118efa6:prompt-enhancement.js"], {
        cwd: path.join(__dirname, ".."), encoding: "utf8",
      });
      assert.match(reference, /@version\s+1\.0\.0/);
      for (const mode of ["footer", "no-footer", "overflow"]) {
        await t.test(mode, async () => {
          async function snapshot(original) {
            const comparisonPage = await browser.newPage({ viewport: { width: 1000, height: 700 } });
            try {
              await comparisonPage.setContent(fixture);
              await comparisonPage.evaluate((mode) => {
                const footer = document.querySelector(".composer-footer");
                if (mode === "no-footer") {
                  const send = footer.querySelector("button");
                  send.setAttribute("aria-label", "Send");
                  footer.parentElement.append(send);
                  footer.remove();
                } else if (mode === "overflow") {
                  footer.style.cssText = "width:70px;overflow:hidden";
                }
              }, mode);
              await comparisonPage.addScriptTag(original
                ? { content: reference }
                : { path: path.join(__dirname, "..", "prompt-enhancement.js") });
              await comparisonPage.locator(".ProseMirror").fill("同一份草稿的位置对照");
              await comparisonPage.waitForTimeout(300);
              return await comparisonPage.locator(".axpe-bar").evaluate((bar) => {
                const rect = bar.getBoundingClientRect();
                return {
                  parent: bar.parentElement.className,
                  position: getComputedStyle(bar).position,
                  x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                };
              });
            } finally {
              await comparisonPage.close();
            }
          }
          assert.deepEqual(await snapshot(false), await snapshot(true));
        });
      }
    });
    await t.test("恢复底栏原位，底栏重建后仍返回原位，版本为 1.0.1", async () => {
      const inlinePage = await browser.newPage();
      try {
        await inlinePage.setContent(fixture);
        await inlinePage.evaluate(() => {
          document.querySelector(".composer-footer").style.cssText =
            "position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center";
        });
        await inlinePage.addScriptTag({ path: path.join(__dirname, "..", "prompt-enhancement.js") });
        await inlinePage.locator("[contenteditable]").fill("检查底栏位置");
        await inlinePage.waitForTimeout(250);
        const button = inlinePage.getByRole("button", { name: "增强提示词", exact: true });
        assert.equal(await button.evaluate((el) => el.closest(".axpe-bar").parentElement.className), "composer-footer");
        assert.equal(await button.evaluate((el) => getComputedStyle(el.closest(".axpe-bar")).position), "static");
        assert.equal(await inlinePage.evaluate(() => window.__axPromptEnhancerV1.version), "1.0.1");
        await button.click({ trial: true });
        await inlinePage.locator(".composer-footer").evaluate((el) => { el.hidden = true; });
        await inlinePage.waitForTimeout(250);
        assert.equal(await button.isVisible(), true);
        const buttonBox = await button.boundingBox();
        const composerBox = await inlinePage.locator(".composer-surface-chrome").boundingBox();
        assert.ok(buttonBox.y >= composerBox.y);
        assert.ok(buttonBox.y + buttonBox.height <= composerBox.y + composerBox.height);
        await inlinePage.locator(".composer-footer").evaluate((el) => { el.hidden = false; });
        await inlinePage.waitForTimeout(250);
        assert.equal(await button.evaluate((el) => el.closest(".axpe-bar").parentElement.className), "composer-footer");
        assert.equal(await button.evaluate((el) => getComputedStyle(el.closest(".axpe-bar")).position), "static");
        await button.click({ trial: true });
      } finally {
        await inlinePage.close();
      }
    });
    await t.test("底栏隐藏和发送、停止、排队控件切换不影响显示", async () => {
      for (const label of ["Send", "Stop", "Queue", null]) {
        await page.evaluate((label) => {
          const footer = document.querySelector(".composer-footer");
          footer.hidden = !label;
          footer.querySelector(":scope > button").setAttribute("aria-label", label || "");
        }, label);
        await editor.fill(`状态：${label || "无控件"}`);
        await visibleAndClickable();
      }
    });
    await t.test("清空和纯空白隐藏，再输入后恢复", async () => {
      for (const value of ["", "   \n "]) {
        await editor.fill(value);
        assert.equal(await bar.isVisible(), false);
        await editor.fill("新的提示词");
        await visibleAndClickable();
      }
    });
    await t.test("宿主替换编辑器后仍按新草稿显示", async () => {
      await page.evaluate(() => {
        const old = document.querySelector(".ProseMirror");
        const replacement = old.cloneNode(false);
        replacement.textContent = "重新挂载的草稿";
        old.replaceWith(replacement);
      });
      editor = page.locator(".ProseMirror");
      await editor.focus();
      await visibleAndClickable();
    });
    await t.test("点击能打开配置，窄窗口也可命中按钮", async () => {
      await main.click();
      assert.equal(await page.getByRole("dialog", { name: "增强提示词" }).isVisible(), true);
      await page.getByRole("button", { name: "关闭", exact: true }).click();
      await page.setViewportSize({ width: 480, height: 700 });
      await visibleAndClickable();
    });
    await t.test("textarea 原生输入和清空同样更新显隐", async () => {
      await page.evaluate(() => {
        const textarea = document.createElement("textarea");
        textarea.placeholder = "Message";
        textarea.className = "filled";
        document.querySelector(".ProseMirror").replaceWith(textarea);
      });
      editor = page.locator("textarea");
      await editor.fill("textarea 草稿");
      await visibleAndClickable();
      await editor.fill("");
      await bar.waitFor({ state: "hidden" });
      assert.equal(await bar.isVisible(), false);
    });
    await t.test("已配置 API 时运行中仍可增强，增强期间保留取消入口", async () => {
      const configuredPage = await browser.newPage();
      try {
        await configuredPage.route("**/*", (route) =>
          route.fulfill({ contentType: "text/html", body: fixture }),
        );
        await configuredPage.goto("https://prompt-enhancer.test/");
        await configuredPage.evaluate(() => {
          localStorage.setItem("ax.promptEnhancer.config.v1", JSON.stringify({
            protocol: "openai",
            baseUrl: "https://example.test/v1",
            apiKey: "YOUR_API_KEY",
            model: "test-model",
          }));
          window.__codexSessionDeleteBridge = (route) =>
            route === "/user-scripts/list"
              ? { status: "ok", scripts: [] }
              : new Promise(() => {});
        });
        await configuredPage.addScriptTag({ path: path.join(__dirname, "..", "prompt-enhancement.js") });
        await configuredPage.locator(".ProseMirror").fill("请帮我检查这段代码");
        const button = configuredPage.getByRole("button", { name: "增强提示词", exact: true });
        await button.click();
        await configuredPage.waitForFunction(() =>
          document.querySelector('.axpe-bar button').getAttribute("aria-busy") === "true",
        );
        assert.equal(await button.isVisible(), true);
        assert.match(await button.innerText(), /取消增强/);
        await button.click();
        await configuredPage.waitForFunction(() =>
          document.querySelector('.axpe-bar button').getAttribute("aria-busy") === "false",
        );
        assert.equal(await button.getAttribute("aria-disabled"), "false");
      } finally {
        await configuredPage.close();
      }
    });
    await t.test("输入后移除占位提示或 aria-label 仍保留按钮", async (t) => {
      for (const kind of ["contenteditable", "textarea"]) {
        await t.test(kind, async () => {
          const dynamicPage = await browser.newPage();
          try {
            const dynamicFixture = kind === "textarea"
              ? fixture.replace('<div class="ProseMirror" contenteditable="true" aria-label="Message"></div>', '<textarea placeholder="Message"></textarea>')
              : fixture.replaceAll("ProseMirror", "draft-editor");
            await dynamicPage.setContent(dynamicFixture);
            await dynamicPage.evaluate(() => {
              const input = document.querySelector("textarea, [contenteditable]");
              input.addEventListener("input", () => {
                input.removeAttribute("placeholder");
                input.removeAttribute("aria-label");
              });
            });
            await dynamicPage.addScriptTag({ path: path.join(__dirname, "..", "prompt-enhancement.js") });
            await dynamicPage.locator("textarea, [contenteditable]").fill("回答期间继续输入");
            // 等待发现任务完成，避免仅验证 input 事件后尚未重新识别的短暂状态。
            await dynamicPage.waitForTimeout(250);
            const button = dynamicPage.getByRole("button", { name: "增强提示词", exact: true });
            assert.equal(await button.isVisible(), true);
            await button.click({ trial: true });
          } finally {
            await dynamicPage.close();
          }
        });
      }
    });
    await t.test("plaintext-only 编辑器可输入时同样显示按钮", async () => {
      const plainPage = await browser.newPage();
      try {
        await plainPage.setContent(fixture.replace('contenteditable="true"', 'contenteditable="plaintext-only"'));
        await plainPage.addScriptTag({ path: path.join(__dirname, "..", "prompt-enhancement.js") });
        await plainPage.locator("[contenteditable]").fill("纯文本草稿");
        await plainPage.waitForTimeout(250);
        assert.equal(await plainPage.getByRole("button", { name: "增强提示词", exact: true }).isVisible(), true);
      } finally {
        await plainPage.close();
      }
    });
    await t.test("输入事件显示后，延迟重新识别不会因属性或布局变化移除按钮", async (t) => {
      for (const mode of ["remove-hints", "expand", "temporary-readonly"]) {
        await t.test(mode, async () => {
          const transitionPage = await browser.newPage();
          try {
            await transitionPage.setContent(fixture);
            await transitionPage.evaluate((mode) => {
              const input = document.querySelector(".ProseMirror");
              const surface = document.querySelector(".composer-surface-chrome");
              // 保留几何布局，只切换脚本依赖的识别信息。
              surface.style.cssText = "position:fixed;left:10%;bottom:30px;width:80%;height:180px;overflow:hidden";
              input.addEventListener("input", () => {
                if (mode === "remove-hints") {
                  input.className = "draft-editor";
                  input.removeAttribute("aria-label");
                  surface.className = "draft-surface";
                  surface.querySelector(".composer-footer > button").setAttribute("aria-label", "Queue");
                } else if (mode === "expand") {
                  surface.style.height = "80vh";
                } else {
                  input.setAttribute("contenteditable", "false");
                }
              });
            }, mode);
            await transitionPage.addScriptTag({ path: path.join(__dirname, "..", "prompt-enhancement.js") });
            await transitionPage.locator("[contenteditable]").fill("一闪后仍应保留的草稿");
            // 先通过 input 更新，再检查多次延迟重扫后的最终可见性。
            await transitionPage.waitForTimeout(350);
            const button = transitionPage.getByRole("button", { name: "增强提示词", exact: true });
            assert.equal(await button.isVisible(), true);
            if (mode === "temporary-readonly") {
              assert.equal(await button.getAttribute("aria-disabled"), "true");
              await transitionPage.locator("[contenteditable]").evaluate((input) => input.setAttribute("contenteditable", "true"));
              await transitionPage.waitForTimeout(250);
              assert.equal(await button.getAttribute("aria-disabled"), "false");
            } else if (mode === "remove-hints") {
              // 会话变化后不能继续依赖上一会话的识别结果。
              await transitionPage.evaluate(() => { location.hash = "another-thread"; });
              await transitionPage.waitForTimeout(250);
              assert.equal(await button.isVisible(), false);
            } else {
              // 实际不可见的旧节点不能因复用绑定而残留浮动按钮。
              await transitionPage.locator("[contenteditable]").evaluate((input) => { input.style.display = "none"; });
              await transitionPage.waitForTimeout(250);
              assert.equal(await button.isVisible(), false);
            }
          } finally {
            await transitionPage.close();
          }
        });
      }
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
