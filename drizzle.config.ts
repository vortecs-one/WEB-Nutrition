import type { Config } from "drizzle-kit";

const config: Config = {
  schema: "./drizzle/schema.ts",   // adjust if your schema path is different
  out: "./drizzle",               // adjust if your migrations folder is different
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL || "",
  },
};

export default config;
