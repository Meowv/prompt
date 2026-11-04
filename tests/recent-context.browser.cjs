const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const source = fs.readFileSync(
  path.join(__dirname, "..", "prompt-enhancement.js"),
  "utf8",
);
const actions =
  '<div class="actions"><button aria-label="复制">copy</button><button aria-label="喜欢">like</button></div>';
function turn(id, user, answer, extra = "") {
  return `<div class="contents" data-content-search-turn-key="${id}" ${extra}><section><h4 class="sr-only" data-conversation-role="user">User</h4><p>${user}</p></section><section><h4 class="sr-only" data-conversation-role="assistant">Assistant</h4><p>${answer}</p>${actions}</section></div>`;
}
function fixture(
  history = turn("turn-index-23", "first question", "first answer"),
  extra = "",
) {
  return `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui}.sr-only{display:none}.composer-surface-chrome{position:fixed;bottom:40px;left:10%;width:80%;height:160px;display:flex;flex-direction:column;background:#eee}.ProseMirror{flex:1;padding:12px}.composer-footer{display:flex;height:36px}</style><main data-app-shell-tab-panel-controller="pane-a" data-thread-id="thread-a"><div class="thread-scroll-container">${history}</div><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true" aria-label="Message"></div><div class="composer-footer"><button aria-label="Stop">stop</button></div></div></main>${extra}`;
}
test("对话上下文：完整脚本配置、采集与请求保护", async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  const errors = [];
  async function pageFor(enabled = true, html = fixture(), count = null) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://context.test/**", (r) =>
      r.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto("https://context.test/");
    await page.evaluate(
      ({ enabled, count }) => {
        localStorage.setItem(
          "ax.promptEnhancer.config.v1",
          JSON.stringify({
            protocol: "openai",
            baseUrl: "https://example.test/v1",
            apiKey: "YOUR_API_KEY",
            model: "test-model",
            ...(enabled === null ? {} : { includeRecentContext: enabled }),
            ...(count === null ? {} : { recentContextCount: count }),
          }),
        );
        window.__sent = [];
        window.__codexSessionDeleteBridge = (route, payload) => {
          if (route === "/user-scripts/list")
            return { status: "ok", scripts: [] };
          window.__sent.push(JSON.parse(payload.body));
          return new Promise((resolve) => {
            window.__respond = () =>
              resolve({
                status: "ok",
                http_status: 200,
                body_json: {
                  choices: [
                    {
                      finish_reason: "stop",
                      message: {
                        content: "请按已确认的方案继续实施，并验证修改结果。",
                      },
                    },
                  ],
                },
              });
          });
        };
      },
      { enabled, count },
    );
    await page.addScriptTag({
      content: source.replace(
        "  async function enhance() {",
        "  window.__contextTest = {collectRecentContext, recentContextOrigin, recentContextUnchanged};\n  async function enhance() {",
      ),
    });
    await page.locator(".ProseMirror").fill("按刚才方案继续");
    return page;
  }
  async function collect(page, count = 1) {
    return page.evaluate((count) => {
      const snapshot = window.__contextTest.collectRecentContext(
        document.querySelector(".ProseMirror"),
        document.querySelector(".composer-surface-chrome"),
        count,
      );
      return snapshot?.history || null;
    }, count);
  }
  try {
    await t.test(
      "旧配置默认关闭，未保存不生效，保存和重载保留开关",
      async () => {
        const page = await pageFor(null);
        try {
          const button = page.getByRole("button", {
            name: "增强提示词",
            exact: true,
          });
          await button.click({ button: "right" });
          const toggle = page.getByRole("switch", {
            name: "附带对话上下文",
          });
          const count = page.getByRole("combobox", { name: "携带数量" });
          assert.equal(await count.inputValue(), "1");
          assert.equal(await count.isDisabled(), true);
          assert.equal(await toggle.isChecked(), false);
          await toggle.click();
          assert.equal(await count.isDisabled(), false);
          await count.selectOption("4");
          await page.getByRole("button", { name: "关闭", exact: true }).click();
          assert.equal(
            await page.evaluate(
              () =>
                JSON.parse(localStorage.getItem("ax.promptEnhancer.config.v1"))
                  .includeRecentContext,
            ),
            undefined,
          );
          await button.click({ button: "right" });
          assert.equal(await toggle.isChecked(), false);
          assert.equal(await count.inputValue(), "1");
          await toggle.focus();
          await page.keyboard.press("Space");
          assert.equal(await toggle.isChecked(), true);
          await page.keyboard.press("Enter");
          assert.equal(await toggle.isChecked(), false);
          await toggle.click();
          await count.selectOption("3");
          await page.getByLabel("上文发送说明").focus();
          await page.keyboard.press("Enter");
          assert.equal(
            await page
              .getByText(
                "帮助增强模型理解“继续”“按刚才方案”等依赖上文的表达，提高结果相关性。1 条是一轮问答，最多 4 条。所选上文会随草稿发送至配置的模型服务；仅使用当前页面已加载的内容，总计超出 6000 字符时本次不附带上文。",
              )
              .isVisible(),
            true,
          );
          await page
            .getByRole("button", { name: "保存配置", exact: true })
            .click();
          await page.reload();
          await page.addScriptTag({ content: source });
          await page.locator(".ProseMirror").fill("fixture");
          await page
            .getByRole("button", { name: "增强提示词", exact: true })
            .click({ button: "right" });
          assert.equal(await toggle.isChecked(), true);
          assert.equal(await count.inputValue(), "3");
          await toggle.click();
          assert.equal(await count.isDisabled(), true);
          assert.equal(await count.inputValue(), "3");
          await page
            .getByRole("button", { name: "保存配置", exact: true })
            .click();
          assert.equal(
            await page.evaluate(
              () =>
                JSON.parse(localStorage.getItem("ax.promptEnhancer.config.v1"))
                  .recentContextCount,
            ),
            3,
          );
        } finally {
          await page.close();
        }
      },
    );
    await t.test("滑动开关可见，窄窗口与两侧锚点的提示不越界", async (t) => {
      for (const width of [320, 420, 1280]) {
        for (const edge of ["left", "right"]) {
          await t.test(`${width}px ${edge}`, async () => {
            const page = await pageFor(false);
            try {
              await page.setViewportSize({
                width,
                height: width === 320 ? 400 : 700,
              });
              await page.emulateMedia({
                colorScheme: edge === "right" ? "dark" : "light",
              });
              await page.addStyleTag({
                content: 'input[type="checkbox"]{display:none!important}',
              });
              await page
                .locator(".composer-surface-chrome")
                .evaluate((el, edge) => {
                  el.style.width = "240px";
                  el.style.left = edge === "left" ? "0" : "auto";
                  el.style.right = edge === "right" ? "0" : "auto";
                }, edge);
              await page
                .getByRole("button", { name: "增强提示词", exact: true })
                .click({ button: "right" });
              const toggle = page.getByRole("switch", {
                name: "附带对话上下文",
              });
              await toggle.scrollIntoViewIfNeeded();
              const track = await toggle.boundingBox();
              const before = await toggle.locator("span").boundingBox();
              assert.equal(track.width, 36);
              assert.equal(track.height, 22);
              assert.equal(before.width, 16);
              assert.equal(before.height, 16);
              assert.equal(before.x, track.x + 3);
              await toggle.click();
              const after = await toggle.locator("span").boundingBox();
              assert.equal(after.x - before.x, 14);
              assert.ok(after.x + after.width <= track.x + track.width - 3);
              assert.equal(await toggle.isChecked(), true);
              const help = page.getByLabel("上文发送说明");
              const description = page.locator("#axpe-context-description");
              assert.equal(await description.isVisible(), false);
              await help.hover();
              assert.equal(await description.isVisible(), true);
              await help.click();
              await toggle.hover();
              assert.equal(await description.isVisible(), false);
              await help.hover();
              const bounds = await page
                .locator("#axpe-context-description")
                .boundingBox();
              const panel = await page.locator(".axpe-panel").boundingBox();
              assert.ok(
                bounds &&
                  bounds.x >= panel.x &&
                  bounds.x + bounds.width <= panel.x + panel.width + 1,
              );
              assert.ok(
                bounds.y >= panel.y &&
                  bounds.y + bounds.height <= panel.y + panel.height + 1,
              );
              assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
              assert.equal(
                await page.evaluate(
                  () => document.documentElement.scrollWidth <= innerWidth,
                ),
                true,
              );
            } finally {
              await page.close();
            }
          });
        }
      }
    });
    await t.test("1/2/3/4 条按最近完整轮次采集并按时间顺序发送", async () => {
      const pairs = Array.from({ length: 5 }, (_, i) => ({
        user: `question ${i}`,
        answer: `answer ${i}`,
      }));
      const html = fixture(
        pairs
          .map((p, i) =>
            turn(
              ["zz", "turn-index-2", "uuid-1", "01", "aa"][i],
              p.user,
              p.answer,
            ),
          )
          .join("") +
          turn("stream", "pending", "partial", 'data-streaming="true"'),
      );
      const page = await pageFor(true, html, 4);
      try {
        for (const count of [1, 2, 3, 4]) {
          const expected = pairs.slice(-count).flatMap((p) => [
            { role: "user", text: p.user },
            { role: "assistant", text: p.answer },
          ]);
          assert.deepEqual(await collect(page, count), expected);
        }
        await page
          .getByRole("button", { name: "增强提示词", exact: true })
          .click();
        await page.waitForFunction(() => window.__sent.length === 1);
        const sent = await page.evaluate(
          () => JSON.parse(window.__sent[0].messages.at(-1).content).history,
        );
        assert.equal(sent.length, 8);
        assert.equal(sent[0].text, "question 1");
        assert.equal(sent.at(-1).text, "answer 4");
      } finally {
        await page.close();
      }
    });
    await t.test(
      "不足四轮仅使用已加载轮次，6000 字符限制按全部选中内容计算",
      async () => {
        const page = await pageFor(
          true,
          fixture(turn("1", "q1", "a1") + turn("2", "q2", "a2")),
        );
        try {
          assert.equal((await collect(page, 4)).length, 4);
        } finally {
          await page.close();
        }
        const large = await pageFor(
          true,
          fixture(
            turn("1", "q1", "字".repeat(3000)) +
              turn("2", "q2", "字".repeat(3000)),
          ),
        );
        try {
          assert.equal((await collect(large, 1)).length, 2);
          assert.equal(await collect(large, 2), null);
        } finally {
          await large.close();
        }
      },
    );
    await t.test("同轮多段助手消息只取最终回答，兼容评价回复入口", async () => {
      const html = fixture(
        turn("1", "question", "final answer")
          .replace(
            '<section><h4 class="sr-only" data-conversation-role="assistant">',
            '<section><h4 class="sr-only" data-conversation-role="assistant">Assistant</h4><p>interim commentary</p></section><section><h4 class="sr-only" data-conversation-role="assistant">',
          )
          .replace('aria-label="喜欢"', 'aria-label="评价回复"'),
      );
      const page = await pageFor(true, html);
      try {
        assert.deepEqual(await collect(page), [
          { role: "user", text: "question" },
          { role: "assistant", text: "final answer" },
        ]);
      } finally {
        await page.close();
      }
    });
    await t.test(
      "DOM 顺序优先于混合轮次 ID，流式轮次跳过，Goal 不阻塞",
      async () => {
        const page = await pageFor(
          true,
          fixture(
            turn("turn-index-23", "old", "old answer") +
              turn("2f58-uuid", "latest question", "latest answer") +
              turn(
                "zzz",
                "streaming question",
                "partial",
                'data-streaming="true"',
              ),
          ),
        );
        try {
          assert.deepEqual(await collect(page), [
            { role: "user", text: "latest question" },
            { role: "assistant", text: "latest answer" },
          ]);
        } finally {
          await page.close();
        }
      },
    );
    await t.test(
      "排除思考、工具、附件和插件界面，引用正文仍作为数据",
      async () => {
        const hidden =
          '<span data-message-type="reasoning">REASONING</span><span data-testid="tool-result">TOOL</span><span data-type="attachment">ATTACHMENT</span><span data-codex-plus-ext="fixture">PLUGIN</span>';
        const page = await pageFor(
          true,
          fixture(
            turn(
              "1",
              "question",
              "answer" +
                hidden +
                "<blockquote>quoted instructions</blockquote>",
            ),
          ),
        );
        try {
          const history = await collect(page);
          assert.equal(history[1].text, "answer\nquoted instructions");
          assert.doesNotMatch(
            JSON.stringify(history),
            /REASONING|TOOL|ATTACHMENT|PLUGIN/,
          );
        } finally {
          await page.close();
        }
      },
    );
    for (const [name, html] of [
      [
        "当前窗格无历史时不借用另一窗格",
        fixture(
          "",
          '<aside><div class="thread-scroll-container">OTHER_THREAD_CANARY</div></aside>',
        ),
      ],
      [
        "助手进行中不使用",
        fixture(turn("1", "question", "answer", 'aria-busy="true"')),
      ],
      [
        "无操作区",
        fixture(turn("1", "question", "answer").replace(actions, "")),
      ],
      ...["hidden", "inert"].map((attribute) => [
        `${attribute} 操作区不作为已完成证据`,
        fixture(turn("1", "question", "answer").replace(
          actions, `<div ${attribute}>${actions}</div>`,
        )),
      ]),
      [
        "只有代码块复制",
        fixture(
          turn("1", "question", "answer").replace(
            actions,
            '<pre><button aria-label="复制">copy</button><button aria-label="喜欢">like</button></pre>',
          ),
        ),
      ],
      ["超长整轮省略", fixture(turn("1", "question", "字".repeat(6000)))],
      [
        "虚拟化缺少提问",
        fixture(
          turn("1", "question", "answer").replace(
            '<section><h4 class="sr-only" data-conversation-role="user">User</h4><p>question</p></section>',
            "",
          ),
        ),
      ],
      [
        "无法确认窗格归属",
        fixture().replace(
          '</div><div class="composer-surface-chrome">',
          '</div><div class="thread-scroll-container">other</div><div class="composer-surface-chrome">',
        ),
      ],
    ])
      await t.test(name, async () => {
        const page = await pageFor(true, html);
        try {
          assert.equal(await collect(page), null);
        } finally {
          await page.close();
        }
      });
    await t.test("Unicode 按字符计数，不把代理对算成两字", async () => {
      const page = await pageFor(
        true,
        fixture(turn("1", "问", "😀".repeat(5999))),
      );
      try {
        assert.equal([...(await collect(page))[1].text].length, 5999);
      } finally {
        await page.close();
      }
    });
    await t.test("只取编辑器所在窗格，不混入另一个聊天", async () => {
      const extra =
        '<aside data-thread-id="other-thread"><div class="thread-scroll-container">OTHER_THREAD_CANARY</div></aside>';
      const page = await pageFor(
        true,
        fixture(turn("1", "question", "answer"), extra),
      );
      try {
        const history = await collect(page);
        assert.equal(history[0].text, "question");
        assert.doesNotMatch(JSON.stringify(history), /OTHER_THREAD_CANARY/);
      } finally {
        await page.close();
      }
    });
    for (const enabled of [false, true])
      await t.test(
        `开关 ${enabled}：只在点击时采集一次、关闭时请求不变`,
        async () => {
          const page = await pageFor(enabled);
          try {
            await page.evaluate(() => {
              window.__reads = 0;
              const root = document.querySelector(".thread-scroll-container"),
                query = root.querySelectorAll.bind(root);
              root.querySelectorAll = (s) => {
                if (s === "[data-content-search-turn-key]") window.__reads++;
                return query(s);
              };
              const editor = document.querySelector(".ProseMirror");
              editor.dispatchEvent(
                new CompositionEvent("compositionstart", { bubbles: true }),
              );
              editor.dispatchEvent(
                new InputEvent("input", { bubbles: true, isComposing: true }),
              );
              window.__axPromptEnhancerV1.ensure();
              editor.dispatchEvent(
                new CompositionEvent("compositionend", { bubbles: true }),
              );
            });
            assert.equal(await page.evaluate(() => window.__reads), 0);
            await page
              .getByRole("button", { name: "增强提示词", exact: true })
              .click();
            await page.waitForFunction(() => window.__sent.length === 1);
            const data = await page.evaluate(() => ({
              reads: window.__reads,
              body: window.__sent[0],
              stored: localStorage.getItem("ax.promptEnhancer.config.v1"),
            }));
            assert.equal(data.reads, enabled ? 1 : 0);
            const payload = data.body.messages.at(-1).content;
            if (enabled) {
              assert.equal(JSON.parse(payload).history[1].text, "first answer");
              assert.doesNotMatch(
                data.body.messages[0].content,
                /first answer/,
              );
            } else assert.equal(payload, "按刚才方案继续");
            assert.doesNotMatch(data.stored, /first answer|first question/);
            await page.evaluate(() => window.__respond());
            await page.waitForFunction(
              () =>
                document
                  .querySelector(".ProseMirror")
                  .getAttribute("contenteditable") === "true",
            );
          } finally {
            await page.close();
          }
        },
      );
    await t.test("采集失败继续增强并说明未附带上文", async () => {
      const page = await pageFor(true, fixture(""));
      try {
        await page
          .getByRole("button", { name: "增强提示词", exact: true })
          .click();
        await page.waitForFunction(() => window.__sent.length === 1);
        assert.equal(
          await page.evaluate(() => window.__sent[0].messages.at(-1).content),
          "按刚才方案继续",
        );
        assert.match(
          await page.locator(".axpe-notice").innerText(),
          /未附带上文/,
        );
      } finally {
        await page.close();
      }
    });
    for (const change of ["pane", "draft"])
      await t.test(`请求期间 ${change} 改变不覆盖原稿`, async () => {
        const page = await pageFor();
        try {
          await page
            .getByRole("button", { name: "增强提示词", exact: true })
            .click();
          await page.waitForFunction(() => window.__sent.length === 1);
          await page.evaluate((change) => {
            if (change === "pane")
              document
                .querySelector("main")
                .setAttribute("data-thread-id", "thread-b");
            else {
              const e = document.querySelector(".ProseMirror");
              e.textContent = "new draft";
              e.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
            window.__respond();
          }, change);
          await page
            .getByText("草稿、会话或编辑器已变化，未自动覆盖。请检查后复制。", {
              exact: true,
            })
            .waitFor();
          assert.equal(
            await page.locator(".ProseMirror").innerText(),
            change === "pane" ? "按刚才方案继续" : "new draft",
          );
        } finally {
          await page.close();
        }
      });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
