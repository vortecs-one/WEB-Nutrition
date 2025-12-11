// drizzle/schema.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  serial,
  varchar,
} from "drizzle-orm/pg-core";

// === Usuarios ===
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
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
