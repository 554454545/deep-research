# 小红书数据源配置教程（草稿，配置完成后整合进 README）

> 状态：**部分可用**（2026-08-09 实测）。feed 推荐流 ✅ / 关键词搜索 ❌（登录墙）。

## 实测结论（2026-08-09）

- **OpenCLI 路线（最终选定）**：opencli 扩展连 Windows Chrome，复用 xiaohongshu.com 登录会话
  - `opencli xiaohongshu feed` ✅ —— 首页推荐流可用（标题/作者/点赞/URL）
  - `opencli xiaohongshu search` ❌ —— 搜索页弹"登录后查看搜索结果"登录墙（即使 Chrome 已登录，平台对自动化会话弹墙）
  - `opencli xiaohongshu whoami/creator-*` —— 创作者中心需要额外登录
  - rednote.com（海外域）在国内 IP 下 302 跳回 xiaohongshu.com，适配器登录检测永远失败 → 用 xiaohongshu 命令而非 rednote
- 反爬死路记录：小红书 API 直连需要 x-s 签名（前端 JS 加密，裸 curl 网关 500）；xiaohongshu-mcp 无头浏览器在 WSL 起不来（Chrome 二进制 headless 段错误 SIGSEGV，debug url 获取失败）
- 搜索墙可能原因（待验证）：账号未实名/新号权限、平台对扩展自动化导航的检测。账号实名 + 日常活跃后再试

## 已装组件（WSL）

- `~/.agent-reach-venv/` —— agent-reach（GitHub main 版）+ bili-cli（B站 ✅ 可用）
- mcporter（`~/.npm-global/bin/mcporter`）+ Exa 语义搜索（配置已写入，未验证连通）
- OpenCLI（`~/.npm-global/bin/opencli`，扩展 v1.0.22 已连，daemon 端口 19825）
- `~/.agent-reach/tools/xiaohongshu-mcp` + `xiaohongshu-login`（备用，WSL 起不来）

## 用户侧操作（Cookie-Editor 路线，已完成过）

1. **登录小红书**：浏览器打开 https://www.xiaohongshu.com 并登录（建议小号）
2. **安装 Cookie-Editor 扩展**：
   `https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm`
3. **导出 Cookie**：小红书页面 → 🍪 图标 → Export → Header String → 复制

## 安全说明

- Cookie 只在本地，不上传；撤销：小红书设置 → 退出所有设备
- 封号风险：建议专用小号，不要用主账号
