import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** 日志接口：runStudy 内部埋点用，可注入（文件实现 / 空实现） */
export interface Logger {
  // 记事件 -- logger.info("study_done", { workspace: "...", steps: 10 })
  info(event: string, data?: Record<string, unknown>): void;
  // 记工具调用 -- 工具名称 + 参数
  tool(toolName: string, input: unknown): void;
  error(event: string, data?: Record<string, unknown>): void;
}

/** 文件日志：JSONL 格式（每行一条 JSON），logs/<runName>.log */
export function createFileLogger(dir: string, runName: string): Logger {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${runName}.log`);

  function write(level: string, event: string, data?: Record<string, unknown>): void {
    // 北京时间（UTC+8）：toISOString 是 UTC，偏移 8 小时并标注 +08:00
    const ts = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace("Z", "+08:00");
    const line = JSON.stringify({ ts, level, event, ...data });
    appendFileSync(file, line + "\n");
  }

  return {
    info: (event, data) => write("info", event, data),
    tool: (toolName, input) =>
      write("tool", "tool_call", {
        tool: toolName,
        input: JSON.stringify(input).slice(0, 500),
      }),
    error: (event, data) => write("error", event, data),
  };
}

/** 空实现：不写任何日志（测试/未配置 logDir 时用） */
export function createNullLogger(): Logger {
  return {
    info: () => {},
    tool: () => {},
    error: () => {},
  };
}
