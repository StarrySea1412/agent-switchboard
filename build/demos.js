/* 四枚确定性小样 + 阅读进度条（VOL.10 · 零依赖，全部原生 DOM，种子化随机）。 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cls = (k) => "ec-kind-" + k;

  /* 固定种子随机（与标本的 Seed.rand() 同义：可复现） */
  let seed = 20261102;
  const srand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const prog = $("#progress");
  if (prog) {
    const paint = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      prog.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
    };
    addEventListener("scroll", paint, { passive: true });
    addEventListener("resize", paint, { passive: true });
    paint();
  }

  /* ══ 共用：错误分类器（照抄 classifyError + 可选读 body code）══ */
  const KIND_ZH = { rate_limit: "限流", transient: "抖动", auth: "鉴权", not_found: "不存在", bad_request: "不合法", server: "服务端", unknown: "未知" };
  const RETRYABLE = new Set(["rate_limit", "transient"]);

  function classify(msg, readBody) {
    const s = String(msg || "");
    // 修盲区：若允许读 body，优先语义 code
    if (readBody) {
      if (/"code"\s*:\s*"(model_not_found|no_such_model)"/i.test(s)) return "not_found";
      if (/"code"\s*:\s*"(convert_request_failed|not_implemented)"/i.test(s)) return "unsupported";
      if (/bulk_probe_detected|批量探测/i.test(s)) return "abuse";
    }
    if (/429|rate.?limit|too many requests|quota|throttl/i.test(s)) return "rate_limit";
    if (/abort|timeout|超时|ETIMEDOUT|ECONN|ENOTFOUND|network|fetch failed|failed to fetch|socket/i.test(s)) return "transient";
    if (/\b5\d{2}\b|internal server|bad gateway|service unavailable|overload/i.test(s)) return "server";
    if (/401|403|unauthor|forbidden|invalid.*api.?key|api.?key.*invalid|认证|鉴权|封禁/i.test(s)) return "auth";
    if (/404|not found|no such model|model.*not.*exist|模型不存在/i.test(s)) return "not_found";
    if (/400|422|invalid.*request|context.*length|too long|max_tokens/i.test(s)) return "bad_request";
    return "unknown";
  }
  const isRetry = (k) => RETRYABLE.has(k) || k === "unknown";

  /* ══ DEMO 01 · 错误分类台 ══ */
  (() => {
    const feed = $("#d1-feed");
    if (!feed) return;
    const CASES = [
      { id: "①", name: "503 的壳", ch: "ch47 · gemini-3.6-flash", raw: 'HTTP 503: {"error":{"code":"model_not_found","message":"model_not_found","param":"","type":"invalid_request_error"}}', truth: "模型根本不存在——装错信封的 404" },
      { id: "②", name: "500 的墙", ch: "ch71 · claude-sonnet-4-6", raw: 'HTTP 500: {"error":{"message":"not implemented (request id: 202609101533374342685038268d9d6Dl64tiTy)","type":"new_api_error","code":"convert_request_failed"}}', truth: "中转站不支持协议转换。两次试都死在 511ms，同一行代码" },
      { id: "③", name: "403 的判词", ch: "ch47 · gpt-oss-20b", raw: "HTTP 403: 该ip已被封禁，原因：bulk probe guard: ip 212.107.30.202 requested 5 distinct models in 60s (last_user 829, offense 3)", truth: "探测太密触发反滥用封禁——不是密钥问题；归因错但放弃的处置对" },
      { id: "④", name: "真限流", ch: "ch12 · gpt-5.6-sol", raw: "HTTP 429: Rate limit reached for gpt-5.6-sol. Please try again in 1.2s. (code=rate_limit_exceeded)", truth: "经典限流：对面活着，只是这会儿人多" },
      { id: "⑤", name: "真抖动", ch: "ch03 · qwen3.8-max", raw: "TypeError: fetch failed · ECONNRESET socket hang up", truth: "网络层抖动，典型自愈型" },
      { id: "⑥", name: "密钥过期", ch: "ch28 · claude-opus-4-6", raw: 'HTTP 401: {"error":{"message":"Incorrect API key provided: sk-proj-***. You can find your API key at ...","type":"invalid_request_error"}}', truth: "密钥失效。重试一百次也是空号" },
      { id: "⑦", name: "上下文超长", ch: "ch55 · kimi-k3", raw: 'HTTP 400: {"error":{"message":"This model\'s maximum context length is 131072 tokens. However, you requested 140213 tokens.","code":"context_length_exceeded"}}', truth: "请求不合法，但换个长上下文模型可能就接得下" },
      { id: "⑧", name: "空号", ch: "ch47 · gemma-4-31b-it", raw: 'HTTP 404: {"error":{"code":"bad_response_status_code","message":"bad_response_status_code"}}', truth: "模型不存在（404，最诚实的一种报错）" },
      { id: "⑨", name: "看不懂的", ch: "ch09 · unknown", raw: 'HTTP 200: {"error":{"message":"upstream returned an unparsable body","type":"proxy_error"}}', truth: "200 里包错误——状态码和语义完全脱节" },
    ];
    const R = { raw: $("#d1-raw"), kind: $("#d1-kind"), verdict: $("#d1-verdict"), why: $("#d1-why"),
      action: $("#d1-action"), actionWhy: $("#d1-action-why"), cost: $("#d1-cost"),
      retryable: $("#d1-retryable"), total: $("#d1-total"), blind: $("#d1-blind"), blindnote: $("#d1-blindnote"),
      readbody: $("#d1-readbody") };
    let cur = 0;

    function render() {
      const c = CASES[cur];
      const readBody = R.readbody.checked;
      const k = classify(c.raw, readBody);
      R.raw.innerHTML = esc(c.raw).replace(/(HTTP \d{3}|"code":"[^"]*"|offense \d)/g, "<b>$1</b>");
      R.kind.textContent = k;
      R.verdict.innerHTML = '<span class="ec-verdict ' + cls(k) + '">' + k + '<small> · ' + (KIND_ZH[k] || k) + "</small></span>";
      R.why.textContent = "正则命中的是错误原文里的关键字；" + (readBody ? "已开启 body 语义优先。" : "未读 body，只看状态码与文本。");
      const retry = isRetry(k);
      R.action.innerHTML = retry ? '<span class="yes">↻ 同模型退避重试</span>' : '<span class="no">→ 立刻换下一个模型</span>';
      R.actionWhy.innerHTML = retry
        ? "在 <code>RETRYABLE</code> 白名单里：等 <code>400ms</code>（带 ±20% 抖动）再打一次，最多 2 次。"
        : "不在白名单：重试是白打。直接 <code>break</code> 出内层循环，外层换人。";
      R.cost.innerHTML = "<b>真相：</b>" + esc(c.truth);
      // 统计
      let blind = 0;
      CASES.forEach((x) => {
        const a = classify(x.raw, false), b = classify(x.raw, true);
        if (a !== b) blind++;
      });
      R.retryable.textContent = 2;
      R.total.textContent = CASES.length;
      R.blind.textContent = blind;
      R.blindnote.innerHTML = blind > 0
        ? "<b>盲区 " + blind + " 例：</b>关闭/打开「读响应体」时的判定不一致——这正是现场①②③踩过的坑。分类器只认状态码与文本，就会把 <code>model_not_found</code> 当成 503 抖动白等，把反滥用封禁当成密钥问题。"
        : "<b>全部一致：</b>body 里的 <code>error.code</code> 与状态码语义吻合。";
      $$(".ec-case", feed).forEach((b, i) => b.setAttribute("aria-pressed", String(i === cur)));
    }

    CASES.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "ec-case";
      b.innerHTML = "<i>" + c.id + "</i><b>" + esc(c.name) + "</b><small>" + esc(c.ch) + "</small>";
      b.onclick = () => { cur = i; render(); };
      feed.appendChild(b);
    });
    R.readbody.onchange = render;
    const first = feed.firstElementChild;
    if (first) first.setAttribute("aria-pressed", "true");
    render();
  })();

  /* ══ DEMO 02 · 回退链推演器 ══ */
  (() => {
    const chainEl = $("#d2-chain");
    if (!chainEl) return;
    const tl = $("#d2-tl");
    const R = { used: $("#d2-used"), fb: $("#d2-fb"), retries: $("#d2-retries"), ms: $("#d2-ms") };
    const MODES = [
      { v: "ok", label: "正常" },
      { v: "flaky", label: "抖动自愈（第1次失败）" },
      { v: "dead", label: "持续抖动（3次全失败）" },
      { v: "auth", label: "鉴权失败（立即换人）" },
      { v: "cool", label: "冷却中（直接跳过）" },
    ];
    const NODES = [
      { name: "GPT-4o", sub: "openai · $2.5/$10 · vision", mode: "dead" },
      { name: "GPT-4o mini", sub: "openai · $0.15/$0.6 · vision", mode: "flaky" },
      { name: "内置模拟引擎", sub: "builtin-mock · 永不失败", mode: "ok", builtin: true },
    ];
    const RES = { allowedFails: 3, cooldownMs: 60000, maxRetries: 2, backoffBaseMs: 400, backoffMaxMs: 4000 };

    function build() {
      chainEl.innerHTML = "";
      NODES.forEach((n, i) => {
        const d = document.createElement("div");
        d.className = "fb-node";
        d.dataset.i = i;
        d.innerHTML =
          '<span class="fb-jack" aria-hidden="true"></span>' +
          '<h5>' + esc(n.name) + ' <span class="pos">POS ' + (i + 1) + "</span></h5>" +
          '<div class="sub">' + esc(n.sub) + "</div>" +
          '<select data-i="' + i + '">' + MODES.map((m) => '<option value="' + m.v + '"' + (m.v === n.mode ? " selected" : "") + ">" + m.label + "</option>").join("") + "</select>";
        chainEl.appendChild(d);
        if (i < NODES.length - 1) {
          const l = document.createElement("div");
          l.className = "fb-link"; l.innerHTML = '<div class="fb-cable-lbl">失败则下坠 ↓</div>';
          chainEl.appendChild(l);
        }
      });
      $$("select", chainEl).forEach((s) => {
        s.onchange = () => { NODES[+s.dataset.i].mode = s.value; };
      });
    }

    function backoff(attempt) {
      const base = Math.min(RES.backoffBaseMs * 2 ** attempt, RES.backoffMaxMs);
      return Math.round(base * (0.8 + srand() * 0.4));
    }

    function run() {
      seed = 20261102;
      tl.innerHTML = "";
      const chain = NODES.map((n, i) => ({ ...n, i }));
      let t = 0, skipped = [], failures = [], lastErr = "", used = null, fb = false, retries = 0;
      const steps = [];
      const add = (kind, msg) => steps.push({ kind, msg });

      for (let i = 0; i < chain.length; i++) {
        const n = chain[i];
        if (!n.builtin && n.mode === "cool") {
          skipped.push(n.name);
          add("skip", "跳过 " + n.name + "（冷却中，剩余 41s）");
          t += 0; // 跳过不耗时
          continue;
        }
        let attempt = 0, done = false;
        for (; attempt <= RES.maxRetries; attempt++) {
          const wait = attempt === 0 ? 0 : 0; // 本次尝试前的等待在下方补记
          let kind, ok = false;
          if (n.mode === "ok" || n.builtin) { ok = true; }
          else if (n.mode === "flaky") { ok = attempt > 0; kind = "transient"; }
          else if (n.mode === "dead") { ok = false; kind = "transient"; }
          else if (n.mode === "auth") { ok = false; kind = "auth"; }

          const cost = 180 + Math.round(srand() * 420);
          t += cost;
          if (ok) {
            add("ok", "✓ " + n.name + " 第 " + (attempt + 1) + " 次尝试成功（+" + cost + "ms）");
            used = n.name; retries = attempt; fb = i > 0; done = true;
            if (attempt > 0) { /* 重试成功不记失败 */ }
            break;
          }
          lastErr = n.name + "：" + kind;
          add("fail", "✗ " + n.name + " 第 " + (attempt + 1) + " 次失败 → classifyError = " + kind);
          if (isRetry(kind) && attempt < RES.maxRetries) {
            const b = backoff(attempt);
            add("backoff", "退避 " + b + "ms（400×2^" + attempt + " ×抖动）");
            t += b;
            continue;
          }
          add("fail", "放弃 " + n.name + "（" + kind + " 不重试" + (attempt >= RES.maxRetries ? " / 重试用尽" : "") + "）");
          failures.push(n.name);
          break;
        }
        if (done) break;
        if (i < chain.length - 1) add("switch", "换下一个模型 ↓");
      }
      if (!used) { used = "无（全链失败）"; fb = true; }
      add("ok", "总耗时 " + (t / 1000).toFixed(2) + "s · 台账写入 CallLog");

      tl.innerHTML = steps.map((s) => '<div class="fb-step ' + s.kind + '"><span class="t">' + "" + '</span><span class="m">' + esc(s.msg) + "</span></div>").join("");

      R.used.textContent = used;
      R.fb.textContent = fb ? "是 · fellBack" : "否 · 首选";
      R.fb.className = fb ? "fb-fb" : "fb-ok";
      R.retries.textContent = retries + " 次";
      R.ms.textContent = (t / 1000).toFixed(2) + "s";

      // 链上节点状态着色
      $$(".fb-node", chainEl).forEach((el, i) => {
        const n = NODES[i];
        el.classList.remove("active", "cooling", "dead");
        if (used && n.name === used) el.classList.add("active");
        else if (n.mode === "cool") el.classList.add("cooling");
        else if (failures.includes(n.name)) el.classList.add("dead");
      });
    }

    build();
    $("#d2-run").onclick = run;
    $("#d2-reset").onclick = () => {
      NODES[0].mode = "dead"; NODES[1].mode = "flaky"; NODES[2].mode = "ok";
      build();
      tl.innerHTML = '<div class="fb-idle">—— 按「推演一次」看这通电话怎么走 ——</div>';
      R.used.textContent = "—"; R.fb.textContent = "—"; R.retries.textContent = "—"; R.ms.textContent = "—";
      R.fb.className = "";
    };
  })();

  /* ══ DEMO 03 · 熔断状态机 ══ */
  (() => {
    const box = $("#d3-statebox");
    if (!box) return;
    const R = { state: box, counter: $("#d3-counter"), lbl: $("#d3-counterlbl"), bar: $("#d3-bar"),
      left: $("#d3-left"), semi: $("#d3-semi"), log: $("#d3-log") };
    const RES = { allowedFails: 3, cooldownMs: 60000 };
    const S = { fails: 0, failCount: 0, okCount: 0, cooldownUntil: 0, now: 0, lastKind: "" };

    const STATE_ZH = { closed: "正常放行", open: "熔断冷却", probe: "到期试探" };
    function stateName() {
      if (S.cooldownUntil > 0) return S.now >= S.cooldownUntil ? "probe" : "open";
      return "closed";
    }
    function log(txt, kind) {
      const d = document.createElement("div");
      if (kind) d.className = kind;
      d.textContent = txt;
      R.log.appendChild(d);
      R.log.scrollTop = R.log.scrollHeight;
    }
    function render() {
      const st = stateName();
      const leftMs = Math.max(0, S.cooldownUntil - S.now);
      R.state.innerHTML = '<span class="cb-state ' + st + '">' + st.toUpperCase() + ' <span class="zh">' + STATE_ZH[st] + "</span></span>";
      // 连败计数格
      R.counter.innerHTML = "";
      for (let i = 0; i < RES.allowedFails; i++) {
        const c = document.createElement("div");
        c.className = "cb-cell" + (i < S.fails ? " lit" : "");
        c.textContent = i < S.fails ? "✗" : "·";
        R.counter.appendChild(c);
      }
      R.lbl.innerHTML = "连续失败 <b>" + S.fails + "</b> / " + RES.allowedFails +
        " &nbsp;·&nbsp; 累计失败 " + S.failCount + " · 成功 " + S.okCount +
        (S.lastKind ? " · 末次 " + S.lastKind : "");
      R.bar.style.width = (leftMs / RES.cooldownMs * 100) + "%";
      R.left.textContent = S.cooldownUntil > 0 ? (leftMs / 1000).toFixed(0) + "s" : "—";
      R.semi.innerHTML = st === "open"
        ? "<b>冷却中：</b>invoke() 的 <code>Health.isCooling()</code> 返回 true，该模型被跳过并记入 <code>skipped</code>——链上仍在，界面可见。"
        : st === "probe"
        ? "<b>到期放行：</b>冷却时间已过，模型重新参与竞争。成功即清零；再失败则 <code>fails</code> 继续累加，一次就够重新撞线。"
        : "<b>正常：</b>模型可接单。连续失败到 " + RES.allowedFails + " 次才会写入 <code>cooldownUntil</code>。";
    }
    function fail() {
      const st = stateName();
      if (st === "open") {
        log("[跳过] 冷却中，本次请求根本不发给它（记入 skipped）", "cool");
        render();
        return;
      }
      S.fails++; S.failCount++; S.lastKind = "transient"; S.now += 300;
      log("[失败] transient · 连败 " + S.fails + " 次", "bad");
      if (S.fails >= RES.allowedFails) {
        S.cooldownUntil = S.now + RES.cooldownMs;
        log("[熔断] 撞线 → cooldownUntil = now + 60s", "cool");
      }
      render();
    }
    function ok() {
      const st = stateName();
      if (st === "open") { log("[跳过] 冷却中，成功的请求也轮不到它", "cool"); render(); return; }
      S.fails = 0; S.cooldownUntil = 0; S.okCount++; S.now += 220;
      log("[成功] 连败清零、冷却解除", "good");
      render();
    }
    function tick() {
      S.now += 15000;
      if (S.cooldownUntil > 0 && S.now >= S.cooldownUntil) {
        log("[到期] 冷却结束，模型回到链上（半开探测位）", "cool");
      }
      render();
    }
    function reset() {
      S.fails = 0; S.failCount = 0; S.okCount = 0; S.cooldownUntil = 0; S.now = 0; S.lastKind = "";
      R.log.innerHTML = "";
      log("[初始] 正常放行");
      render();
    }
    $("#d3-fail").onclick = fail;
    $("#d3-ok").onclick = ok;
    $("#d3-tick").onclick = tick;
    $("#d3-reset").onclick = reset;
    reset();
  })();

  /* ══ DEMO 04 · 探针账本（23 条真实记录）══ */
  (() => {
    const ledger = $("#d4-ledger");
    if (!ledger) return;
    const R = { filters: $("#d4-filters"), ledger, detail: $("#d4-detail") };
    /* type: c=chat p=pelican; kind: ok auth not_found server rate_limit timeout bad_request */
    const DATA = [
      { id: 1, ch: 47, chn: "ark", model: "gemini-3.6-flash", type: "c", kind: "server", http: 503, ms: 1031, note: "503 壳里包 model_not_found" },
      { id: 2, ch: 47, chn: "ark", model: "gemini-3.7-flash", type: "c", kind: "server", http: 503, ms: 357, note: "同上，装错信封的 404" },
      { id: 3, ch: 47, chn: "ark", model: "gemma-4-31b-it", type: "c", kind: "not_found", http: 404, ms: 13335, note: "13.3s 才回 404，慢得离谱" },
      { id: 4, ch: 47, chn: "ark", model: "gpt-5.1", type: "c", kind: "auth", http: 403, ms: 315, note: "bulk_probe_detected" },
      { id: 5, ch: 47, chn: "ark", model: "gpt-5.5", type: "c", kind: "auth", http: 403, ms: 258, note: "IP 因 60s 内探 5 模型被封" },
      { id: 6, ch: 71, chn: "huan", model: "claude-sonnet-4-6", type: "c", kind: "server", http: 500, ms: 511, note: "convert_request_failed · 白重试两次" },
      { id: 7, ch: 71, chn: "huan", model: "deepseek-v4-flash", type: "c", kind: "not_found", http: 404, ms: 698, note: "bad_response_status_code" },
      { id: 8, ch: 25, chn: "DGB", model: "grok-4.7", type: "p", kind: "ok", http: 200, ms: 35307, note: "唯一成功：鹈鹕 SVG · ttfb 14985 · tps 85.08 · $0.026", verified: 1 },
      { id: 9, ch: 12, chn: "薄荷", model: "gpt-5.6-sol", type: "p", kind: "bad_request", http: 400, ms: 890, note: "载荷不合法（鹈鹕）" },
      { id: 10, ch: 55, chn: "lucky", model: "gpt-5.5", type: "p", kind: "bad_request", http: 422, ms: 1204, note: "参数被拒（鹈鹕）" },
      { id: 11, ch: 33, chn: "meng", model: "deepseek-v4.1-flash", type: "p", kind: "timeout", http: null, ms: 60000, note: "60s 超时（鹈鹕）" },
      { id: 12, ch: 28, chn: "anyrouter", model: "claude-opus-4-6", type: "c", kind: "auth", http: 401, ms: 210 },
      { id: 13, ch: 31, chn: "sun", model: "deepseek-v4-pro", type: "c", kind: "auth", http: 401, ms: 198 },
      { id: 14, ch: 40, chn: "alpha", model: "gpt-5.5", type: "c", kind: "auth", http: 403, ms: 302 },
      { id: 15, ch: 44, chn: "君", model: "glm-5.2", type: "c", kind: "auth", http: 401, ms: 240 },
      { id: 16, ch: 52, chn: "42", model: "grok-4.5", type: "c", kind: "auth", http: 403, ms: 275 },
      { id: 17, ch: 60, chn: "cat", model: "kimi-k3-free", type: "c", kind: "auth", http: 401, ms: 190 },
      { id: 18, ch: 64, chn: "feng", model: "gpt-5.6-sol", type: "c", kind: "auth", http: 401, ms: 233 },
      { id: 19, ch: 70, chn: "pm", model: "deepseek-v4-flash", type: "c", kind: "auth", http: 403, ms: 318 },
      { id: 20, ch: 78, chn: "ikun", model: "deepseek-v4-flash", type: "c", kind: "auth", http: 401, ms: 205 },
      { id: 21, ch: 82, chn: "work", model: "gpt-5.6-sol", type: "c", kind: "auth", http: 401, ms: 221 },
      { id: 22, ch: 18, chn: "smallpepper", model: "gemini-3-flash", type: "c", kind: "rate_limit", http: 429, ms: 412, note: "经典限流" },
      { id: 23, ch: 36, chn: "cooree", model: "gpt-5.5", type: "c", kind: "not_found", http: 404, ms: 1203 },
    ];
    const KIND_ZH = { ok: "成功", auth: "鉴权", not_found: "不存在", server: "服务端", rate_limit: "限流", timeout: "超时", bad_request: "不合法" };
    let fType = "all", fKind = "all", sel = null;

    function renderFilters() {
      const counts = {};
      DATA.forEach((d) => { counts[d.kind] = (counts[d.kind] || 0) + 1; });
      R.filters.innerHTML = "";
      const mk = (label, val, cur, key) => {
        const b = document.createElement("button");
        b.className = "pl-chip";
        b.setAttribute("aria-pressed", String(cur === val));
        b.innerHTML = label;
        b.onclick = () => { if (key === "t") fType = val; else fKind = val; renderFilters(); renderLedger(); };
        R.filters.appendChild(b);
      };
      mk("全部 <b>" + DATA.length + "</b>", "all", fType, "t");
      mk("chat <b>" + DATA.filter((d) => d.type === "c").length + "</b>", "c", fType, "t");
      mk("pelican <b>" + DATA.filter((d) => d.type === "p").length + "</b>", "p", fType, "t");
      R.filters.appendChild(Object.assign(document.createElement("span"), { className: "hintline", style: "width:100%;margin-top:2px", textContent: "结论：" }));
      mk("全部", "all", fKind, "k");
      Object.keys(KIND_ZH).forEach((k) => {
        if (!counts[k]) return;
        mk(KIND_ZH[k] + " <b>" + counts[k] + "</b>", k, fKind, "k");
      });
    }
    function renderLedger() {
      const rows = DATA.filter((d) => (fType === "all" || d.type === fType) && (fKind === "all" || d.kind === fKind));
      ledger.innerHTML = '<table><thead><tr><th>#</th><th>渠道</th><th>模型</th><th>类型</th><th>结论</th><th>HTTP</th><th>耗时</th></tr></thead><tbody>' +
        rows.map((d) => '<tr data-id="' + d.id + '"' + (sel === d.id ? ' class="sel"' : "") + '><td class="num">' + d.id + "</td><td>" + esc(d.chn) + "</td><td><code>" + esc(d.model) + "</code></td><td>" + (d.type === "p" ? "pelican" : "chat") +
          '</td><td><span class="pl-kind ' + d.kind + '">' + (KIND_ZH[d.kind] || d.kind) + "</span></td><td class=\"num\">" + (d.http || "—") + '</td><td class="num">' + (d.ms >= 1000 ? (d.ms / 1000).toFixed(1) + "s" : d.ms + "ms") + "</td></tr>").join("") +
        "</tbody></table>";
      $$("tbody tr", ledger).forEach((tr) => {
        tr.onclick = () => { sel = +tr.dataset.id; renderLedger(); renderDetail(); };
      });
      if (!rows.length) ledger.innerHTML = '<div class="fb-idle">没有符合条件的记录</div>';
    }
    function renderDetail() {
      const d = DATA.find((x) => x.id === sel);
      if (!d) { R.detail.innerHTML = '<h5>点任意一行看该条记录</h5><p class="ec-note">共 ' + DATA.length + " 条真实探测结果；筛选可叠加类型与结论。</p>"; return; }
      const kv = [
        ["渠道", d.chn + " · ch" + d.ch],
        ["模型", d.model],
        ["结论", (KIND_ZH[d.kind] || d.kind) + (d.http ? " · HTTP " + d.http : "")],
        ["耗时", d.ms >= 1000 ? (d.ms / 1000).toFixed(1) + "s" : d.ms + "ms"],
      ];
      let tl = "";
      if (d.kind === "ok") {
        tl = "[       0ms] 探测 DGB · grok-4.7 · pelican\n[       0ms] -> POST (protocol=openai/chat)\n[   14985ms] <- HTTP 200 (首字节)\n[   35307ms] 完成 · 85.08 tok/s · cost $0.026115\n[   35307ms] <parsed> SVG 可解析，元素结构完整 → verified=1\n[   35307ms] 最终结果: 成功 (ok) · 鹈鹕骑自行车属实";
      } else if (d.id === 6) {
        tl = "=== 第 1 次尝试 ===\n[       0ms] 探测 huan · claude-sonnet-4-6 · chat\n[       0ms] -> POST https://ai.huan666.de/v1/responses\n[     469ms] <- HTTP 500 {\"code\":\"convert_request_failed\"}\n[     470ms] 失败(server)\n[重试] 第 1 次失败(server)，自动重试一次\n=== 第 2 次尝试 ===\n[       0ms] -> POST (同上)\n[     511ms] <- HTTP 500 {\"code\":\"convert_request_failed\"}\n[     512ms] 最终结果: 失败 (server)";
      } else if (d.id === 5) {
        tl = "[       0ms] 探测 ark · gpt-5.5 · chat\n[       0ms] 头: Authorization: Bearer sk-pkh***\n[     258ms] <- HTTP 403 (text/plain)\n[     258ms] 错误体: 该ip已被封禁，原因：bulk probe guard:\n           ip 212.107.30.202 requested 5 distinct models in 60s (offense 3)\n[     258ms] 失败(auth) → 不重试（黑名单命中）";
      } else if (d.type === "p") {
        tl = "[       0ms] 探测 " + d.chn + " · " + d.model + " · pelican\n[       0ms] -> POST (SVG 生成请求)\n[" + String(d.ms).padStart(8) + "ms] " + (d.kind === "timeout" ? "客户端超时，无响应" : "HTTP " + d.http + " 请求被拒") + "\n[" + String(d.ms).padStart(8) + "ms] 最终结果: 失败 (" + d.kind + ")";
      } else {
        tl = "[       0ms] 探测 " + d.chn + " · " + d.model + " · chat\n[       0ms] -> POST\n[" + String(d.ms).padStart(8) + "ms] <- HTTP " + d.http + "\n[" + String(d.ms).padStart(8) + "ms] 失败(" + d.kind + ") · 不重试";
      }
            R.detail.innerHTML = "<h5>#" + d.id + " · <b>" + esc(d.note || (KIND_ZH[d.kind] + "（无补充说明）")) + "</b>" +
        '<div class="pl-kv">' + kv.map((p) => "<div>" + p[0] + "<b>" + esc(p[1]) + "</b></div>").join("") + "</div>" +
        '<div class="pl-timeline">' + esc(tl) + "</div>";
    }
    renderFilters();
    renderLedger();
    renderDetail();
  })();
})();
