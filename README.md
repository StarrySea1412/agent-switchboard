# 给 Agent 配一台总机 · 造物手记 VOL.10

> 模型路由与降级的解剖 —— 从一次凌晨的 503 假死讲起：错误分类、按角色路由、双层回退、熔断冷却、探测留痕，和「不许静默降级」背后的价值观。

**在线阅读：<https://starrysea1412.github.io/agent-switchboard/>**

![技术栈全景图](assets/tech-stack.png)

## 这篇讲什么

任何一个跑了一阵子的 Agent，手里都攥着一份模型名单。名单越长，故障越像天气。这篇拿两个真实标本，把「模型挂了之后发生什么」拆成可以核对的七段：

| 章 | 主题 | 关键机制 |
|---|---|---|
| 01 | 写死的模型是单点故障 | 模型做成插拔资源 · builtin-mock 链尾兜底 |
| 02 | 协议适配器 | 统一消息格式 · tokensOf 收敛三家用量字段 |
| 03 | 错误要分类 | classifyError 六类正则 · RETRYABLE 白名单 · 503 壳包 model_not_found 的真实盲区 |
| 04 | 按角色路由 | 三条优先级链 · 能力过滤 · 死链清理与老格式迁移 |
| 05 | 回退的两层包装 | 重试包在换人里 · backoffMs 指数退避+抖动 · Health 熔断（3 败/60s） |
| 06 | 探测与留痕 | cc-probe 五种探测 · 逐毫秒 Timeline · 23 条真实账本 |
| 07 | 成本账本与价值观 | costOf · fallbackRate · 降级必须可见，兜底必须明示 |

## 标本

- **fuel-agent**（本机自研原型）：`assets/js/models.js` 813 行模型接入层 + `store.js` 配置层。所有引文核对到真实函数与行号。
- **cc-probe**（本机自研）：渠道探针，`probe.db` 里 23 条真实探测记录直接入文（IP 与密钥已脱敏），含「60 秒探 5 个模型被封 IP」的战史。

## 四枚确定性小样

1. **错误分类台** —— probe.db 真实错误串逐条分诊，开关「读响应体」现场修复分类盲区
2. **回退链推演器** —— 严格照抄 invoke() 循环结构与 backoffMs() 公式（固定种子可复现）
3. **熔断状态机** —— Health.note()/state() 全逻辑：连败计数、成功清零、撞线冷却、到期放行
4. **探针账本** —— 23 条真实记录可筛选可回放，含唯一成功（grok-4.7 鹈鹕 SVG，35.3s / $0.026）

无外部随机数，参数摊在明面上，读者可以自己推翻。

## 系列

造物手记 · VOL.10。往期：[VOL.09 把文字画成像素](https://starrysea1412.github.io/canvas-editor-anatomy/) · [VOL.08 Agent 的三条信号线](https://starrysea1412.github.io/agent-signals/) · [VOL.06 给 Agent 打分](https://starrysea1412.github.io/agent-eval/) · [VOL.04 Agent 内核](https://starrysea1412.github.io/agent-kernel/)

---

单文件站点（`index.html` ≈141KB），零依赖、零构建产物（`build/` 目录为源分片与验收脚本）。字体 [LXGW 文楷](https://github.com/lxgw/LxgwWenKai)（OFL 许可，子集化见 `assets/fonts/OFL.txt`）。插图由 GPT 系图像模型生成。
