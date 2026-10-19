import type { APIRoute } from "astro";
import { SESSION_COOKIE, deleteSession } from "../../lib/auth";

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(locals.runtime.env.DB, token);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return redirect("/", 303);
};
