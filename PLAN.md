# 造物手记 VOL.10《给 Agent 配一台总机》—— 模型路由与降级 · 准备文档

> 2026-11-02 备料。标本引文已核对到真实函数/行号，真实数据来自 cc-probe probe.db。
> 仓库名拟 `StarrySea1412/agent-switchboard`（备选 agent-router / model-routing-story）。

## 一、标本与素材清单（全部已核实）

**标本 A：fuel-agent**（`D:\project\fuel-agent`，本机自研原型）
- `assets/js/models.js`（813 行）核心事实：
  - 统一消息格式 `{role, parts:[{type:'text'|'image'}]}`；`Adapters` 四适配器 openai/anthropic/gemini/mock，各实现 `test()/listModels()/chat()`
  - `classifyError(msg)`（L331）：六类正则 rate_limit/transient/auth/not_found/bad_request/unknown
  - `RETRYABLE = new Set(["rate_limit","transient"])`（store.js L783）——只有这两类值得同模型重试
  - `RESILIENCE`（store.js L764）：`allowedFails:3, cooldownMs:60000, maxRetries:2, backoffBaseMs:400, backoffMaxMs:4000`
  - `Health` 熔断表（L348）：连败 3 次→冷却 60s，localStorage 持久化防刷新失忆；口径注明参考 LiteLLM Router
  - `backoffMs(attempt)`（L442）：`400·2^n` 封顶 4s，×(0.8+rand·0.4) 抖动防重试尖峰
  - `ModelRegistry.invoke(role,req)`（L713）：双层包装，注释明说参考 LiteLLM Router「function_with_fallbacks 包 function_with_retries」——先同模型退避重试，不行再换下一个
  - `resolveChain(role)`（L657）：路由链→过滤 disabled/无 vision 能力→尾部 push mock 兜底「永不失败」
  - 冷却中的模型**留在链里被跳过并如实记录**（`skipped` 数组），不静默消失
  - `tokensOf`（L414）：三家字段名收敛 prompt_tokens/input_tokens/promptTokenCount
  - `CallLog.stats()`（L462）：按角色算 fallbackRate
  - `remove()`（L591）：删模型后从所有回退链摘除防死链，空链回落默认
- `store.js` 诚实文化金句（L811）：「一个没人用的数字不是预留，是自欺」
- `PROVIDERS` 9 家（含 ollama 本地）+ `MODEL_PRESETS` 8 个含百万单价

**标本 B：cc-probe**（`D:\project\cc-probe`，渠道探针，88 渠道/198 模型/23 条真实探测结果）
- engine.py：`ProbeError(kind,message,http_status)`、`Timeline`（逐毫秒 add/render）、`_mask` 脱敏、`HostPacer.wait_turn`（按主机排队防限流）、`cooldown_for`、`probe_with_retry`（L393 只豁免 auth/quota/forbidden）、`discover()`
- scoring.py：`score_model` / `channel_predictions` / `build_report`
- **真实错误账本**（23 条）：
  - chat：auth 12 / not_found 3 / server 3 / rate_limit 1
  - pelican（鹈鹕骑自行车 SVG）：ok 1 / bad_request 2 / timeout 1
  - 唯一成功：DGB grok-4.7 pelican，ttfb 14985ms / total 35307ms / tps 85.08 / cost $0.026115 / verified=1
- **三条黄金走查案例**（log 列逐毫秒时间线齐全）：
  1. HTTP 503 壳里包 `model_not_found`——被归为 server（可重试），实际该换模型：**分类器盲区实锤**
  2. huan 渠道 claude-sonnet-4-6：HTTP 500 `convert_request_failed`（协议转换不实现），被当 server **重试一次**、同样死法——白重试的活例
  3. 403 `bulk_probe_detected`：「ip 212.107.30.202 requested 5 distinct models in 60s (offense 3)」被归为 auth——**归因错但处置对**（立即放弃）
- 两套标本口径对比：fuel-agent 重试 rate_limit+transient；cc-probe 重试除 auth/quota/forbidden 外全部（含 not_found）——**没有标准答案，只有口径**

**背景素材**：画境本机 90+ 渠道（写稿时精确统计）；503 假死深夜复活、限流 57008s 的战史（ai-image-studio-channels 记忆）；用户 gpt-image-only 规矩 = 「降级是有价值观的」活例（结尾回扣）。

## 二、七章骨架（每章论点配真实数据走查）

1. **写死的模型是单点故障**——fuel-agent 把模型做成可插拔资源（models.js 头注释）；一次 503 = 全产品不可用；引出「总机」比喻：请求是来电，模型是分机，总机接线员 = 路由层
2. **协议适配器：三家三种方言**——统一消息格式 + 四适配器；tokensOf 收敛三家 usage 字段名；anthropic 浏览器直连头；Ollama 老版退 /api/tags
3. **错误要分类：不同错不同药**——classifyError 六类正则逐条拆；两套口径对照；**黄金走查**：503 包 model_not_found 的盲区 + 500 convert_request_failed 的白重试（真实时间线）
4. **按角色路由，不是全局一个模型**——route() 三角色三链；vision 能力过滤（L665）；「首选贵模型+次选便宜模型」本身就是成本策略（store.js L749 注释）
5. **回退的两层包装**——invoke() 算法逐行：同模型退避重试（backoffMs 抖动）→ 换下一个 → mock 兜底；Health 熔断（3 败/60s/半开放行）；skipped 如实记录不静默消失
6. **健康度从哪来：探测与留痕**——cc-probe 五种探测（含鹈鹕 SVG）；Timeline 逐毫秒日志 + _mask 脱钥；HostPacer 排队；真实 23 条账本 + bulk_probe_detected 战史（60 秒 5 模型被封 IP）
7. **成本账本与诚实的兜底**——costOf 百万单价；fallbackRate；mock 兜底哲学：宁可明示模拟，不许静默降级；回扣 gpt-image-only 规矩：**降级策略是产品价值观的表达**——什么任务不许自动降级、失败要停下来叫人

## 三、四枚确定性小样（全部可在正文核对）

1. **错误分类台**（ch3）：probe.db 脱敏错误串逐条喂给两个分类器并排判 → 显示类别/是否可重试；开关「读 JSON body 的 code」看盲区修复；含三条黄金案例的逐字符判别过程
2. **回退链推演器**（ch5）：链 [A,B,mock]×失败模式（rate_limit 第 n 次成功/auth 立即弃/连败进冷却），按 invoke() 真实算法逐步走：attempt 序号、backoff 时长（固定种子）、skipped/failures、最终 fellBack；时间轴可视化
3. **熔断状态机**（ch5）：allowedFails/cooldownMs 可调，连败→冷却→半开→清零全状态图；对照 LiteLLM 口径注释
4. **探针账本**（ch6）：真实 23 条数据可过滤（kind×type×渠道）；grok-4.7 pelican 35 秒全链路时间线（脱敏版）；成本/时延小结

## 四、主题与视觉

- **老式电话总机接线台**（亮色）：插线板矩阵 = 路由链，插头 = 请求，占线 = 熔断冷却，接线员 = 总机
- 配色：奶油纸 `#f4efe6` / 接线绿 `#3a7d5c` / 警报橙红 `#c94f30` / 黄铜插孔 `#9a7b3f`；母题：插线孔、电话线弧线、打孔纸带时间线
- 与前九套全区分（米纸深蓝/夜空/钢青/放映室/实验纸/kraft/示波器/制图车间）
- hero：系列单眼折纸鸟 × 戴话务员耳麦坐总机前；GPT 系生图（gpt-image-2.5-sunburst / gpt-image-2.5 / gpt-image-2），wait=false 提交+轮询，size 64 倍数

## 五、管线 checklist（从 VOL.09 复制）

- [ ] 拷 `canvas-editor-anatomy/build/*.mjs + fonts`（verify/scroll/render-stack/build 四件套 + chars.txt 子集法）
- [ ] 字体：/tmp/lxgw Regular+Medium 全量 TTF 还在；**改完正文重收 chars.txt 重新子集**（漏过一次缺 22 字形）
- [ ] 小样类名先全局 grep 防撞全局类（VOL.08 .wire 坑）；.ts-guide 父容器要 position:relative（VOL.09 坑）
- [ ] 交付物 bash heredoc ≤10KB 分块（Write 工具跨轮会消失）；写完 wc -c + tail 校验
- [ ] tech-stack 全景图（docs/tech-stack.html → headless 2x PNG）+ README
- [ ] 发布：token 建仓 → push（代理挂了用 `git -c http.proxy= -c https.proxy= push`）→ Pages API（须先有 main）→ verify-live.mjs
- [ ] 结语放 footer.html 内（id=closing，VOL.08 死锚教训）

## 六、待办顺序

定稿章纲 → 写正文分片（ch1-7+hero+footer）→ 四小样 demos.js → style.css 总机主题 → build 拼接 → verify+scroll 本地验收 → 字体子集 → 生图 5 张 → tech-stack 图 → 建仓发布 → verify-live → 补记忆
