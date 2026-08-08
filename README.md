# deep-research

洞察与用户研究 Agent（个人轻量版）：输入一个问题，Agent 自主完成用户研究全流程，输出深度洞察报告。

参考特赞 Atypica 的研究方法论（JTBD + KANO、画像 → Panel → 焦点小组 → 深度访谈 → 报告），做轻量本地实现。总体目标与设计见 [AGENT.md](./AGENT.md)。

## 快速开始

```bash
npm install
# 配置 DeepSeek key（或任意 openai-compatible 服务）
export DEEPSEEK_API_KEY=sk-xxx
npm run demo -- "为什么当代学生不再走进图书馆了"
```

不配 key 也能跑通全链路（离线确定性应答器），用于演示与测试。

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
test/          # 镜像 src/ 路径
workspaces/    # 每次研究一个目录（运行时产物，已 gitignore）
```

## 变更日志

- v0.1.0 骨架：模型工厂 + Workspace + 最小主循环（工具注册 + todo 状态机），离线 FakeModel 端到端可跑通
