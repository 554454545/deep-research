import { z } from "zod";

/** 角色卡 schema：一次研究里一个模拟用户的完整设定 */
export const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  background: z.string().min(1), // 身份背景：年级/专业/生活状态
  traits: z.array(z.string()).min(1), // 性格特征
  stance: z.string().min(1), // 对研究主题的立场/态度
  voice: z.string().min(1), // 说话风格
});

export type Persona = z.infer<typeof PersonaSchema>;
