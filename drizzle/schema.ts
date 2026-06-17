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
