"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export type AuthActionState = {
  error?: string;
};

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8)
});

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8),
  organizationName: z.string().trim().min(2).max(120)
});

async function nextOrganizationSlug(name: string) {
  const base = slugify(name) || "organization";
  let slug = base;
  let attempt = 1;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }

  return slug;
}

export async function loginAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: {
      memberships: {
        include: { organization: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!user) {
    return { error: "Invalid credentials." };
  }

  const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return { error: "Invalid credentials." };
  }

  let membership = user.memberships[0];

  if (!membership) {
    const slug = await nextOrganizationSlug(`${user.name || "team"} workspace`);
    const organization = await prisma.organization.create({
      data: {
        name: `${user.name || "My"} Workspace`,
        slug,
        memberships: {
          create: {
            userId: user.id,
            role: "OWNER"
          }
        }
      },
      include: {
        memberships: {
          include: { organization: true }
        }
      }
    });

    membership = organization.memberships[0];
  }

  await createSession(user.id, membership.organizationId);
  redirect("/app/projects");
}

export async function signupAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName")
  });

  if (!parsed.success) {
    return { error: "Please complete all fields with valid values." };
  }

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (existingUser) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const organizationSlug = await nextOrganizationSlug(parsed.data.organizationName);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash
      }
    });

    const organization = await tx.organization.create({
      data: {
        name: parsed.data.organizationName,
        slug: organizationSlug
      }
    });

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: "OWNER"
      }
    });

    return { user, organization };
  });

  await createSession(result.user.id, result.organization.id);
  redirect("/app/projects");
}
