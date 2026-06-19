// drizzle/schema.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  serial,
  varchar,
  date,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

// === Usuarios ===
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  // Platform the user registered from (e.g. "app-thruxion").
  // Stored at registration and required again at login.
  platform: varchar("platform", { length: 100 })
    .notNull()
    .default("app-thruxion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === Tokens de traspaso (handoff app móvil -> WebView) ===
// Single-use, short-lived tokens used to hand a native-app session into the
// web app without re-entering credentials. The raw token is NEVER stored;
// only its SHA-256 hash is kept, so a DB leak can't be replayed.
export const handoffTokens = pgTable("handoff_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  // Resolved identity (validated against Thruxion at issue time).
  email: text("email").notNull(),
  userId: text("user_id"),
  humanId: text("human_id"),
  name: text("name"),
  role: text("role"),
  platform: varchar("platform", { length: 100 }),
  // Preferred UI language selected in the native app (e.g. "es" / "en").
  // Validated server-side at issue time and propagated into the web session.
  lang: varchar("lang", { length: 8 }),
  // Single-use + short expiry.
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// === Grupos de trabajo ===
export const workGroups = pgTable("work_groups", {
  id: serial("id").primaryKey(),                    // 1,2,3...
  name: varchar("name", { length: 255 }).notNull(), // nombre del grupo
  status: varchar("status", { length: 50 })
    .notNull()
    .default("Activo"),                             // Activo / Inactivo
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),                                  // fecha de creación
  logoUrl: text("logo_url"),                        // opcional, para ícono
});

// === Géneros ===
export const genders = pgTable("genders", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// === Deportes / Actividades ===
export const sports = pgTable("sports", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// === Pacientes ===
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  // Unique ID (RUT/DNI/Pasaporte)
  document: varchar("document", { length: 60 }).notNull().unique(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  birthDate: date("birth_date").notNull(),
  phone: varchar("phone", { length: 30 }),
  // ✅ required for login + unique
  email: text("email").notNull().unique(),
  // ✅ from list
  genderId: integer("gender_id")
    .notNull()
    .references(() => genders.id),
  // ✅ from work groups
  workGroupId: integer("work_group_id")
    .notNull()
    .references(() => workGroups.id),
  // ✅ optional
  sportId: integer("sport_id").references(() => sports.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
