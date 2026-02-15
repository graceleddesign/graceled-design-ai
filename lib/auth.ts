import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "graceled_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

export type AppSession = {
  userId: string;
  organizationId: string;
  email: string;
  organizationName: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string, organizationId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      token,
      userId,
      organizationId,
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: true,
      organization: true
    }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { token } }).catch(() => null);
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: session.userId,
        organizationId: session.organizationId
      }
    },
    select: {
      role: true
    }
  });

  return {
    userId: session.userId,
    organizationId: session.organizationId,
    email: session.user.email,
    organizationName: session.organization.name,
    role: membership?.role || "MEMBER"
  };
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.delete({ where: { token } }).catch(() => null);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
