import { z } from "zod";

// 角色卡 schema：一次研究里一个模拟用户的完整设定
export const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  background: z.string().min(1), // 身份背景：年级/专业/生活状态
  traits: z.array(z.string()).min(1), // 性格特征
  stance: z.string().min(1), // 对研究主题的立场/态度
  voice: z.string().min(1), // 说话风格
  evidence: z.array(z.string()).min(1), // 依据的侦察素材（scouting.md 中的链接/文件名），角色必须锚定真实素材
});

export type Persona = z.infer<typeof PersonaSchema>;
