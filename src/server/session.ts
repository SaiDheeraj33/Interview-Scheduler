/**
 * The one seam between this feature and authentication.
 * The prototype signs in by choosing a persona; production replaces the body of
 * `getSession` with the NIAT SSO session lookup and nothing else changes, because
 * every page and every server action asks this file who the caller is.
 */
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";

export const SESSION_COOKIE = "grit_persona";

export const getSession = cache(async (): Promise<User | null> => {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
});

/** For pages: send anyone without the right role back to the persona picker. */
export async function requireRole(...roles: User["role"][]): Promise<User> {
  const user = await getSession();
  if (!user || !roles.includes(user.role)) redirect("/");
  return user;
}

export const homeFor = (role: User["role"]) =>
  role === "student" ? "/student" : role === "interviewer" ? "/interviewer" : "/team";
