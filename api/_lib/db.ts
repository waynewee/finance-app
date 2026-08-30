import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Missing DATABASE_URL environment variable. Set it to your Neon connection string.",
  );
}

export const sql = neon(connectionString);
