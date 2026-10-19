import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE, getSession } from "./lib/auth";
import { classify, normalizeAdminPath, sameOrigin } from "./lib/guard";

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

export const onRequest = defineMiddleware(async (ctx, next) => {
  const env = ctx.locals.runtime.env;
  const adminPath = normalizeAdminPath(env.ADMIN_PATH);
  const route = classify(ctx.url.pathname, adminPath);

  ctx.locals.isAdmin = false;
  ctx.locals.adminBase = "";
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  if (token && adminPath) {
    const session = await getSession(env.DB, token);
    if (session) {
      ctx.locals.isAdmin = true;
      ctx.locals.adminBase = adminPath;
      if (session.renewedUntil) {
        ctx.cookies.set(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: ctx.url.protocol === "https:",
          sameSite: "strict",
          path: "/",
          expires: session.renewedUntil,
        });
      }
    } else {
      ctx.cookies.delete(SESSION_COOKIE, { path: "/" });
    }
  }

  const origin = ctx.request.headers.get("Origin");

  switch (route.kind) {
    case "hidden":
      return next("/404");

    case "api": {
      if (!ctx.locals.isAdmin) return notFound();
      if (!sameOrigin(ctx.request.method, origin, ctx.url.origin)) return notFound();
      const res = await next();
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    case "admin": {
      const isLogin = route.target === "/admin";
      if (!ctx.locals.isAdmin && !isLogin) return ctx.redirect(adminPath);
      if (!sameOrigin(ctx.request.method, origin, ctx.url.origin)) return notFound();
      const res = await next(ctx.locals.isAdmin ? route.target : "/admin/login");
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      res.headers.set("Cache-Control", "no-store");
      res.headers.set("Referrer-Policy", "no-referrer");
      return res;
    }

    default: {
      const res = await next();
      if (ctx.locals.isAdmin) res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  }
});
