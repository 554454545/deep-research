# deep-research

洞察与用户研究 Agent（个人轻量版）：输入任何**关于人类行为与决策的商业问题**，Agent 自主完成用户研究全流程，为**驱动真实选择的主观因素**建模（动机/情感/权衡/认知偏差），输出深度洞察报告。

参考特赞 Atypica 的研究方法论（JTBD + KANO、画像 → Panel → 焦点小组 → 深度访谈 → 报告），做轻量本地实现。总体目标与设计见 [AGENT.md](./AGENT.md)。

## 快速开始

```bash
npm install
# 配置 DeepSeek key：复制 .env.example 为 .env 填入（或手动建 .env 写 DEEPSEEK_API_KEY=sk-xxx）
npm run demo
```

运行后提示输入研究问题（必须由用户输入；也可用 `npm run demo -- "问题"` 直接传入）。运行必须有 key，无 key 时程序会提示并退出。

| 命令 | 行为 |
|---|---|
| `npm run demo` | 交互输入研究问题 → 真实研究（联网侦察 + DeepSeek） |
| `npm run demo -- "问题"` | 直接带问题运行 |

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | 类型检查（tsc --noEmit） |
| `npm test` | 全量测试（node --import tsx --test test/*/*.test.ts） |
| `npm run demo -- "<问题>"` | 跑一次研究演示 |

## 目录结构

```
src/
  model/       # 模型工厂（懒加载，缺 key 抛明确错误）
  workspace/   # 工作区：研究计划/todo/笔记/报告 落盘与续跑
  agent/       # 主循环：工具注册 + 阶段流转
  source/      # 数据源抽象：360 搜索（联网侦察）+ 本地语料库（离线兜底）
test/          # 镜像 src/ 路径 + helpers（测试用假模型）
workspaces/    # 每次研究一个目录（运行时产物，已 gitignore）
corpus/        # 本地语料库：手动投放的资料（.md/.txt），侦察补充用
```

## 数据源

侦察阶段走数据源抽象（src/source/），可插拔切换：

| 源 | 类型 | 说明 |
|---|---|---|
| so360（默认） | 免费联网 | 360 搜索，中文质量好、无反爬（实测） |
| corpus | 本地离线 | 检索 corpus/ 目录 .md/.txt，无网兜底 |
| baidu / bing | 保留备用 | 实测被安全验证拦截 / 结果降级为字典页 |

升级付费源（SerpAPI 等）：新增一个实现，在 src/source/index.ts 里替换，流程代码不动。

## 变更日志

- v0.2.2 移除离线模式：运行必须有真实 key（无 key 提示退出）；FakeModel 降级为测试专用（test/helpers/）
- v0.2.1 研究问题必须由用户输入：demo 交互式询问（readline），无输入/EOF 友好退出；保留命令行传参
- v0.2.0 侦察真实化：数据源抽象层（360 搜索 + 本地语料库），scout_sources 从骨架变为真实联网采集
- v0.1.0 骨架：模型工厂 + Workspace + 最小主循环（工具注册 + todo 状态机），离线 FakeModel 端到端可跑通
