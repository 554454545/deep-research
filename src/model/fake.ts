import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
} from "@ai-sdk/provider";

/** 脚本一步：返回若干工具调用，或一段最终文本 */
export interface FakeStep {
  text?: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * 离线确定性应答器：实现 LanguageModelV2 接口（仅 doGenerate，doStream 抛错）。
 * 按调用次数逐轮执行脚本——不解析 prompt 内容，用于验证主循环链路，
 * 不配 key 也能跑通"规划 → todo 推进 → 报告"全流程。
 */
export function createFakeModel(script: FakeStep[] = DEFAULT_SCRIPT): LanguageModelV2 {
  let calls = 0;
  return {
    specificationVersion: "v2",
    provider: "fake",
    modelId: "fake-offline",
    supportedUrls: {},
    doGenerate: async (_options: LanguageModelV2CallOptions) => {
      const step = script[Math.min(calls, script.length - 1)];
      calls++;
      const content: LanguageModelV2Content[] = [];
      if (step.toolCalls?.length) {
        for (const [i, tc] of step.toolCalls.entries()) {
          content.push({
            type: "tool-call",
            toolCallId: `call_${calls}_${i}`,
            toolName: tc.name,
            input: JSON.stringify(tc.input), // V2 要求 stringified JSON
          });
        }
      }
      if (step.text) content.push({ type: "text", text: step.text });
      return {
        content,
        finishReason: step.toolCalls?.length ? "tool-calls" : "stop",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        warnings: [],
        response: { id: `fake_${calls}`, timestamp: new Date(), modelId: "fake-offline" },
      };
    },
    doStream: async () => {
      throw new Error("FakeModel 不支持流式");
    },
  };
}

/** 默认脚本：完整跑一遍最小研究流程（规划 → 侦察 → 8 阶段 todo 并行推进 → 报告） */
export const DEFAULT_SCRIPT: FakeStep[] = [
  {
    toolCalls: [
      {
        name: "make_study_plan",
        input: {
          goal: "理解当代学生不去图书馆的根本原因，找到提升到馆率的策略",
          audience: "大学生（本科生 + 研究生，覆盖高频/低频/不去者）",
          framework: "JTBD + KANO",
          methods: ["社媒侦察", "焦点小组讨论", "一对一深度访谈"],
        },
      },
    ],
  },
  {
    toolCalls: [
      {
        name: "scout_sources",
        input: {
          topic: "学生不去图书馆的原因与替代学习场所",
          queries: ["大学生 为什么不去图书馆", "图书馆 自习 占座 吐槽", "宿舍 学习 替代 图书馆"],
        },
      },
    ],
  },
  {
    toolCalls: Array.from({ length: 8 }, (_, i) => ({
      name: "update_todo",
      input: { index: i, completed: true },
    })),
  },
  {
    toolCalls: [
      {
        name: "generate_report",
        input: {
          title: "大学图书馆到馆率提升洞察报告",
          highlights: [
            "图书馆在不同学生心中是五种完全不同的空间（避难所/战场/工具/社交地/精神园地）",
            "边界感、仪式感等心理需求与插座、网速等基础设施同等重要",
            "分区管理是调和不同用户需求的最佳策略",
          ],
        },
      },
    ],
  },
  { text: "研究完成。报告已生成，核心发现：图书馆的吸引力来自能否匹配用户当前的任务类型与心理状态。" },
];
