"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { projectSchema, type Project } from "@/lib/schema";

/**
 * 1プロジェクトの最新状態をサーバから取り直す（page.tsx と同じ include / map）。
 * アシスタント承認などサーバ変更の直後に、クライアント state を即時に同期するために使う
 * （`useState(initialProjects)` は router.refresh() のプロップ変更を拾わないため）。
 */
export async function fetchProjectById(projectId: string): Promise<Project | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const p = await db.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId: session.user.id },
        { projectMembers: { some: { userId: session.user.id } } },
      ],
    },
    include: {
      milestones: { orderBy: { order: "asc" } },
      noteFolders: { orderBy: { order: "asc" } },
      notes: {
        include: { subtasks: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
      projectMembers: { include: { user: true } },
      pendingInvites: true,
    },
  });
  if (!p) return null;

  const mapped = {
    ...p,
    projectMembers: p.projectMembers.map((pm) => ({
      id: pm.id,
      userId: pm.userId,
      name: pm.user.name,
      email: pm.user.email,
      image: pm.user.image,
    })),
    pendingInvites: p.pendingInvites.map((inv) => ({ id: inv.id, email: inv.email })),
  };

  const parsed = projectSchema.safeParse(mapped);
  return parsed.success ? parsed.data : null;
}

export type InviteResult =
  | { ok: true; member: { id: string; userId: string; name: string | null; email: string | null; image: string | null } }
  | { ok: true; pending: true; email: string }
  | { ok: false; error: "already_member" | "already_invited" | "unauthorized" };

export async function createProject(name: string, preId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.project.create({
    data: {
      id: preId,
      name,
      description: "",
      clients: [],
      status: "",
      archived: false,
      members: [],
      ownerId: "",
      userId: session.user.id,
    },
  });
  revalidatePath("/");
}

export async function updateProject(
  id: string,
  field: "name" | "description" | "status",
  value: string,
) {
  await db.project.update({ where: { id }, data: { [field]: value } });
  revalidatePath("/");
}

export async function archiveProject(id: string, archived: boolean) {
  await db.project.update({ where: { id }, data: { archived } });
  revalidatePath("/");
}

export async function updateProjectClients(id: string, clients: string[]) {
  await db.project.update({ where: { id }, data: { clients } });
  revalidatePath("/");
}

export async function updateProjectMembers(id: string, members: string[]) {
  await db.project.update({ where: { id }, data: { members } });
  revalidatePath("/");
}

export async function deleteProject(id: string) {
  await db.project.delete({ where: { id } });
  revalidatePath("/");
}

export async function inviteCollaborator(projectId: string, email: string): Promise<InviteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };

  const target = await db.user.findUnique({ where: { email } });

  if (target) {
    // 登録済みユーザー → 即メンバー追加
    const existing = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: target.id } },
    });
    if (existing) return { ok: false, error: "already_member" };

    const member = await db.projectMember.create({
      data: { projectId, userId: target.id },
      include: { user: true },
    });

    revalidatePath("/");
    return {
      ok: true,
      member: {
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
      },
    };
  }

  // 未登録ユーザー → PendingInvite に積む
  const existingInvite = await db.pendingInvite.findUnique({
    where: { projectId_email: { projectId, email } },
  });
  if (existingInvite) return { ok: false, error: "already_invited" };

  await db.pendingInvite.create({ data: { projectId, email } });

  revalidatePath("/");
  return { ok: true, pending: true, email };
}

export async function removeCollaborator(projectId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  revalidatePath("/");
}

export async function removePendingInvite(projectId: string, email: string) {
  await db.pendingInvite.delete({
    where: { projectId_email: { projectId, email } },
  });
  revalidatePath("/");
}

/** 初回ログイン時に呼ぶ。pending invite を消化して ProjectMember に変換する。 */
export async function processPendingInvites(userId: string, email: string) {
  const pending = await db.pendingInvite.findMany({ where: { email } });
  if (pending.length === 0) return;

  await db.$transaction([
    ...pending.map((inv) =>
      db.projectMember.upsert({
        where: { projectId_userId: { projectId: inv.projectId, userId } },
        create: { projectId: inv.projectId, userId },
        update: {},
      }),
    ),
    db.pendingInvite.deleteMany({ where: { email } }),
  ]);
}
