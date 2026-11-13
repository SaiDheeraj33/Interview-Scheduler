import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/grit.db";
if (url.startsWith("file:")) mkdirSync(path.dirname(url.slice(5)), { recursive: true });

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { __gritClient?: Client };
const client = globalForDb.__gritClient ?? createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
if (process.env.NODE_ENV !== "production") globalForDb.__gritClient = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
