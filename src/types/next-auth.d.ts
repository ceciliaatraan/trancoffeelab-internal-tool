import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role?: "owner" | "staff";
    } & DefaultSession["user"];
  }
}
