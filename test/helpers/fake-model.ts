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
 * 测试用假模型：实现 LanguageModelV2 接口（仅 doGenerate，doStream 抛错）。
 * 按调用次数逐轮执行脚本——不解析 prompt 内容，让端到端测试不花钱不联网。
 * 产品运行不涉及（运行必须有真实 key），仅 test/ 使用。
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
    toolCalls: [
      {
        name: "build_persona",
        input: {
          personas: [
            {
              name: "考研党·阿哲",
              background: "大三考研，每天 7:30 排队抢座，图书馆是主场",
              traits: ["自律", "秩序感强", "争分夺秒"],
              stance: "图书馆是战场，占座必须严格管理，安静是底线",
              voice: "直接、语速快、带焦虑感",
              evidence: ["library.md"],
            },
            {
              name: "氛围派·小萌",
              background: "大二，喜欢有审美的空间，图书馆只去打卡角",
              traits: ["感性", "爱拍照", "易被环境影响"],
              stance: "图书馆太空旷压抑，咖啡馆更有灵感",
              voice: "活泼、爱用比喻",
              evidence: ["library.md"],
            },
            {
              name: "宿舍党·博文",
              background: "大四计算机，双屏+机械键盘宿舍流",
              traits: ["工具控", "怕麻烦", "效率优先"],
              stance: "宿舍设备齐全，图书馆插座抢座太麻烦",
              voice: "务实、爱讲装备参数",
              evidence: ["library.md"],
            },
          ],
        },
      },
    ],
  },
  {
    toolCalls: [
      {
        name: "create_panel",
        input: {
          title: "高校图书馆氛围派学习者",
          personaNames: ["考研党·阿哲", "氛围派·小萌", "宿舍党·博文"],
        },
      },
    ],
  },
  {
    toolCalls: [
      {
        name: "run_discussion",
        input: {
          personas: [
            {
              name: "考研党·阿哲",
              background: "大三考研，每天 7:30 排队抢座，图书馆是主场",
              traits: ["自律", "秩序感强"],
              stance: "图书馆是战场，占座必须严格管理",
              voice: "直接",
              evidence: ["library.md"],
            },
            {
              name: "氛围派·小萌",
              background: "大二，喜欢有审美的空间",
              traits: ["感性"],
              stance: "咖啡馆更有灵感",
              voice: "活泼",
              evidence: ["library.md"],
            },
            {
              name: "宿舍党·博文",
              background: "大四计算机，宿舍设备流",
              traits: ["效率优先"],
              stance: "宿舍设备齐全",
              voice: "务实",
              evidence: ["library.md"],
            },
          ],
          topic: "学习场所选择与图书馆的使用",
          questions: ["你平时在哪里学习？为什么？", "图书馆哪些地方让你不想去？"],
        },
      },
    ],
  },
  {
    toolCalls: [
      {
        name: "run_interview",
        input: {
          persona: {
            name: "宿舍党·博文",
            background: "大四计算机，宿舍设备流",
            traits: ["效率优先", "怕麻烦"],
            stance: "宿舍设备齐全，图书馆太麻烦",
            voice: "务实",
            evidence: ["library.md"],
          },
          questions: ["你最后一次去图书馆是什么时候？", "什么让你决定不去？"],
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
          summary:
            "大学图书馆正面临悖论：馆舍扩建、资源扩充，但学生到馆日益稀少。学生不是不想学习，而是图书馆未能提供确定性——本报告基于真实侦察素材与多角色讨论产出。",
          coreQuestions: [
            "学生真正在图书馆里要完成什么任务？",
            "是什么摩擦将学生推向替代场所？",
            "哪些改进能最有效触达不同类型的学生？",
          ],
          findings: [
            {
              title: "学生不是不想学习，而是图书馆未能提供确定性",
              detail:
                "确定有电、确定有网、确定有座、确定不被打扰——这是认知资源的保护策略，而非审美偏好。",
              evidence: ["library.md"],
            },
            {
              title: "图书馆的竞争对手是宿舍+咖啡馆的组合体",
              detail: "技术宅在宿舍建驾驶舱，仪式感型去咖啡馆买松弛感，分别满足控制权与氛围。",
              evidence: ["library.md"],
            },
            {
              title: "基础设施的修复比创意改造更能拉回学生",
              detail: "插座损坏、网络断连、预约卡顿——每次低级失误都会导致一个学生永久转向替代方案。",
              evidence: ["library.md"],
            },
          ],
          personas: [
            "考研党·阿哲（高频）：需要稳定座位、持续开放时间、绝对安静",
            "氛围派·小萌（偶尔）：需要审美空间、宽松规则",
            "宿舍党·博文（极少）：需要高速 Wi-Fi、充足插座",
          ],
          needs: {
            must: ["稳定可用的供电插座", "全覆盖高速无线网络", "流畅的座位预约系统"],
            performance: ["落实执行的占座管理机制", "物理隔断的分区管理"],
            delight: ["独立预约式研修间", "咖啡角与轻食区"],
          },
          recommendations: [
            {
              priority: "P1 立即",
              action: "建立插座损坏 24 小时响应机制",
              why: "基础设施失守是学生流失的第一触发点",
            },
            {
              priority: "P2 短期",
              action: "上线座位超时自动释放功能",
              why: "占座问题严重影响公平感",
            },
            {
              priority: "P3 中期",
              action: "物理隔断实现静音区/交流区分区",
              why: "调和不同用户群体的根本张力",
            },
          ],
          quotes: [
            "图书馆免费，但来回折腾加时间卡死，每天至少浪费一小时——自习室月卡值回票价（林晓）",
            "全覆盖高速 Wi-Fi 和插座是生存底线（王博文）",
          ],
        },
      },
    ],
  },
  { text: "研究完成。报告已生成，核心发现：图书馆的吸引力来自能否匹配用户当前的任务类型与心理状态。" },
];
