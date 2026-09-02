import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const adminRoleEnum = pgEnum("admin_role", ["owner", "staff"]);

/**
 * Roller för de inloggade admin-användarna. Separat från Auth.js `users`
 * eftersom `users` bara är identitet — den här tabellen är behörighet.
 * En rad skapas/uppdateras i signIn-callbacken första gången en
 * allowlistad e-post loggar in.
 */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  role: adminRoleEnum("role").notNull().default("staff"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
adminUsers.enableRLS();

/**
 * Alla inloggningsförsök som INTE ledde till en session — fel domän,
 * saknad allowlist-post, overifierad e-post. Lyckade inloggningar
 * uppdaterar bara admin_users.last_login_at, de loggas inte här.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: text("actor_email"),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  success: boolean("success").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
auditLog.enableRLS();
