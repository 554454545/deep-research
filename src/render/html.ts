import { readFile } from "node:fs/promises";
import path from "node:path";

/** 轻量解析 report.md（我们模板生成，结构固定）：按 ## 分节，### 发现 01：标题\n详情 */
export interface ReportSections {
  title: string;
  question: string;
  background: string;
  coreQuestions: string[];
  findings: Array<{ title: string; detail: string }>;
  personas: string[];
  needs: { must: string[]; performance: string[]; delight: string[] };
  recommendations: string[];
  quotes: string[];
  todos: string[];
}

export function parseReport(md: string): ReportSections {
  const sections: ReportSections = {
    title: "",
    question: "",
    background: "",
    coreQuestions: [],
    findings: [],
    personas: [],
    needs: { must: [], performance: [], delight: [] },
    recommendations: [],
    quotes: [],
    todos: [],
  };
  const lines = md.split("\n");
  let current: string = "";
  let kanoSub: "must" | "performance" | "delight" | null = null;
  let finding: { title: string; detail: string } | null = null;
  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      current = h2[1]!;
      if (current === "核心发现") finding = null;
      continue;
    }
    const h1 = line.match(/^# (.+)$/);
    if (h1) sections.title = h1[1]!;
    const quote = line.match(/^> 研究问题：(.+)$/);
    if (quote) sections.question = quote[1]!;
    const findingMatch = line.match(/^### 发现 \d+：(.+)$/);
    if (findingMatch) {
      finding = { title: findingMatch[1]!, detail: "" };
      sections.findings.push(finding);
      continue;
    }
    const bullet = line.match(/^- (.+)$/);
    switch (current) {
      case "研究背景":
        if (line.trim() && !line.startsWith("#") && !line.startsWith(">")) sections.background += line;
        break;
      case "核心研究问题":
        if (bullet) sections.coreQuestions.push(bullet[1]!);
        break;
      case "核心发现":
        if (finding && line.trim() && !line.startsWith("###")) finding.detail += line;
        break;
      case "用户画像":
        if (bullet) sections.personas.push(bullet[1]!);
        break;
      case "需求分层（KANO）": {
        const h3 = line.match(/^### (.+)$/);
        if (h3) {
          if (h3[1]!.includes("MUST")) kanoSub = "must";
          else if (h3[1]!.includes("PERFORMANCE")) kanoSub = "performance";
          else if (h3[1]!.includes("DELIGHTER")) kanoSub = "delight";
          else kanoSub = null;
        } else if (bullet && kanoSub) {
          sections.needs[kanoSub].push(bullet[1]!);
        }
        break;
      }
      case "策略建议":
        if (bullet) sections.recommendations.push(bullet[1]!);
        break;
      case "用户原声":
        if (bullet) sections.quotes.push(bullet[1]!);
        break;
      case "研究过程":
        if (bullet) sections.todos.push(bullet[1]!);
        break;
    }
  }
  return sections;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function priorityClass(s: string): string {
  if (s.includes("P1")) return "p1";
  if (s.includes("P2")) return "p2";
  if (s.includes("P3")) return "p3";
  return "p4";
}

const CSS = `
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f7f7f5; color: #222; margin: 0; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 0 24px 80px; }
  .cover { text-align: center; padding: 72px 0 48px; }
  .cover .brand { font-size: 12px; letter-spacing: 4px; color: #999; text-transform: uppercase; }
  .cover h1 { font-size: 36px; line-height: 1.35; margin: 20px 0 12px; font-weight: 700; }
  .cover .question { color: #666; font-size: 15px; }
  .stats { display: flex; gap: 16px; justify-content: center; margin-top: 36px; }
  .stat { background: #1c1c1c; color: #fff; border-radius: 12px; padding: 16px 28px; min-width: 110px; }
  .stat .num { font-size: 30px; font-weight: 700; }
  .stat .label { font-size: 12px; color: #f5a623; margin-top: 4px; }
  h2 { font-size: 22px; margin: 56px 0 18px; padding-left: 14px; border-left: 4px solid #f5a623; }
  .card { background: #fff; border-radius: 12px; padding: 22px 26px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .finding-title { font-weight: 700; font-size: 16px; line-height: 1.5; }
  .finding-title .no { color: #f5a623; margin-right: 8px; }
  .finding-detail { color: #555; font-size: 14px; line-height: 1.8; margin-top: 8px; }
  .persona { background: #fff; border-radius: 10px; padding: 12px 18px; margin-bottom: 8px; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
  .kano-row { border-radius: 10px; padding: 14px 20px; margin-bottom: 10px; font-size: 14px; line-height: 1.7; }
  .kano-must { background: #fdf0ef; border-left: 4px solid #d64541; }
  .kano-performance { background: #eef3fb; border-left: 4px solid #3b7dd8; }
  .kano-delight { background: #eef8f0; border-left: 4px solid #3aa76d; }
  .kano-row .tag { font-size: 11px; font-weight: 700; margin-right: 8px; letter-spacing: 1px; }
  .rec { display: flex; gap: 12px; align-items: baseline; }
  .rec .pri { flex-shrink: 0; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; color: #fff; }
  .pri.p1 { background: #d64541; } .pri.p2 { background: #e67e22; } .pri.p3 { background: #3b7dd8; } .pri.p4 { background: #999; }
  .rec .body { font-size: 14px; line-height: 1.75; color: #333; }
  .quote { border-left: 3px solid #ddd; padding: 10px 18px; margin-bottom: 10px; color: #444; font-style: italic; font-size: 14px; line-height: 1.7; }
  .todo { font-size: 13px; color: #666; line-height: 1.9; }
  .todo .ok { color: #3aa76d; }
`;

/** 渲染工作区为自包含 HTML 报告，返回 HTML 字符串 */
export async function renderHtmlReport(wsDir: string): Promise<string> {
  const reportMd = await readFile(path.join(wsDir, "report.md"), "utf8");
  const s = parseReport(reportMd);

  // 统计徽章：画像数 / 讨论发言数 / 访谈发言数
  let personaCount = 0;
  try {
    const p = JSON.parse(await readFile(path.join(wsDir, "personas.json"), "utf8")) as unknown[];
    personaCount = p.length;
  } catch {
    personaCount = s.personas.length;
  }
  const countSpeeches = async (file: string) => {
    try {
      const raw = await readFile(path.join(wsDir, "notes", file), "utf8");
      return raw.split("\n").filter((l) => /^[^#\s][^：\n]*[：]/.test(l) && !l.startsWith("参与")).length;
    } catch {
      return 0;
    }
  };
  const discussionCount = await countSpeeches("discussion.md");
  const interviewCount = await countSpeeches("interviews.md");

  const findingsHtml = s.findings
    .map(
      (f, i) =>
        `<div class="card"><div class="finding-title"><span class="no">${String(i + 1).padStart(2, "0")}</span>${esc(f.title)}</div><div class="finding-detail">${esc(f.detail)}</div></div>`
    )
    .join("\n");
  const kanoHtml = [
    { key: "must" as const, tag: "MUST-HAVE · 缺失即流失", cls: "kano-must" },
    { key: "performance" as const, tag: "PERFORMANCE · 越好越满意", cls: "kano-performance" },
    { key: "delight" as const, tag: "DELIGHTER · 超出预期", cls: "kano-delight" },
  ]
    .map(
      ({ key, tag, cls }) =>
        `<div class="kano-row ${cls}"><span class="tag">${tag}</span>${s.needs[key].map((n) => esc(n)).join("；")}</div>`
    )
    .join("\n");
  const recHtml = s.recommendations
    .map((r) => {
      const m = r.match(/^\*\*(P\d[^*]*)\*\*：(.+)$/);
      if (m) {
        return `<div class="rec card"><span class="pri ${priorityClass(m[1]!)}">${esc(m[1]!.trim())}</span><div class="body">${esc(m[2]!)}</div></div>`;
      }
      return `<div class="rec card"><div class="body">${esc(r)}</div></div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
    <div class="brand">INSIGHT RESEARCH REPORT</div>
    <h1>${esc(s.title)}</h1>
    <div class="question">研究问题：${esc(s.question)}</div>
    <div class="stats">
      <div class="stat"><div class="num">${personaCount}</div><div class="label">研究画像</div></div>
      <div class="stat"><div class="num">${discussionCount}</div><div class="label">小组发言</div></div>
      <div class="stat"><div class="num">${interviewCount}</div><div class="label">访谈发言</div></div>
    </div>
  </div>
  <h2>研究背景</h2>
  <div class="card">${esc(s.background)}</div>
  <h2>核心研究问题</h2>
  <div class="card">${s.coreQuestions.map((q) => `· ${esc(q)}`).join("<br>")}</div>
  <h2>核心发现</h2>
  ${findingsHtml}
  <h2>用户画像</h2>
  ${s.personas.map((p) => `<div class="persona">${esc(p)}</div>`).join("\n")}
  <h2>需求分层（KANO）</h2>
  ${kanoHtml}
  <h2>策略建议</h2>
  ${recHtml}
  <h2>用户原声</h2>
  ${s.quotes.map((q) => `<div class="quote">${esc(q)}</div>`).join("\n")}
  <h2>研究过程</h2>
  <div class="card todo">${s.todos.map((t) => `<span class="${t.startsWith("[x]") ? "ok" : ""}">${esc(t)}</span><br>`).join("")}</div>
</div>
</body>
</html>`;
}
