/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    /** True when the request carries a valid session cookie. */
    isAdmin: boolean;
    /** The secret admin prefix, e.g. "/k-7f3q9…". Only ever rendered for logged-in requests. */
    adminBase: string;
  }
}
