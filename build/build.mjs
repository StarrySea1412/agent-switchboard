// 拼接单文件站点：head + style + hero + 七章 + 结语(footer 内) + demos.js
// 用法：node build/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const style = read("build/style.css");
const hero = read("build/hero.html");
const chapters = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"]
  .map((n) => read(`build/${n}.html`)).join("\n");
const footer = read("build/footer.html");
const js = read("build/demos.js");

const head = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="theme-color" content="#f3eee2"/>
<link rel="preload" href="assets/fonts/wenkai-regular.woff2" as="font" type="font/woff2" crossorigin/>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23f3eee2'/%3E%3Crect x='3' y='4' width='18' height='16' rx='2' fill='none' stroke='%233a7d5c' stroke-width='1.4'/%3E%3Ccircle cx='8' cy='9' r='1.7' fill='none' stroke='%2396762f' stroke-width='1.3'/%3E%3Ccircle cx='16' cy='9' r='1.7' fill='none' stroke='%2396762f' stroke-width='1.3'/%3E%3Cpath d='M8 10.7v6.3M16 10.7v6.3M8 17h8' stroke='%23c04a2c' stroke-width='1.3' stroke-linecap='round'/%3E%3C/svg%3E"/>
<meta name="description" content="模型路由与降级的解剖：从一次凌晨的 503 假死讲起，拆开错误分类、按角色路由、双层回退、熔断冷却、探测留痕与成本账本——两个真实标本、二十三条真实探测记录、四枚确定性小样。"/>
<meta name="author" content="StarrySea1412"/>
<meta property="og:title" content="给 Agent 配一台总机 · 造物手记 VOL.10"/>
<meta property="og:description" content="模型挂了之后发生什么：六类错误两种药、重试包在换人里、熔断冷却 60 秒、以及「不许静默降级」背后的价值观。"/>
<meta property="og:type" content="article"/>
<meta property="og:image" content="assets/art/hero.webp"/>
<title>给 Agent 配一台总机 · 造物手记 VOL.10</title>
<style>
${style}
</style>
</head>
<body>
<div class="progress" id="progress"></div>
`;
const tail = `
<script>
${js}
</script>
</body>
</html>
`;

const html = head + hero + "\n<main>\n" + chapters + "\n" + footer + "\n</main>\n" + tail;
writeFileSync(join(root, "index.html"), html, "utf8");
console.log(`built index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
