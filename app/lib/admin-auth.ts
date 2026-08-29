import { getChatGPTUser } from "../chatgpt-auth";
import { ADMIN_EMAIL } from "./admin-identity";

export { ADMIN_EMAIL } from "./admin-identity";

export async function requireAdminApi() {
  const user = await getChatGPTUser();

  if (!user) {
    return {
      ok: false as const,
      response: Response.json({ error: "Требуется авторизация" }, { status: 401 }),
    };
  }

  if (user.email.toLowerCase() !== ADMIN_EMAIL) {
    return {
      ok: false as const,
      response: Response.json({ error: "Нет доступа" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}
