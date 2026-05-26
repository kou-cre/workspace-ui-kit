import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import workspaceData from "@/data/workspace.json";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { projectsSchema, workspaceSchema, type GoogleCalendarEvent } from "@/lib/schema";
import { fetchGoogleCalendarEvents } from "@/lib/google-calendar";
import { getUserSetting } from "@/lib/actions/userSetting";

export default async function Page() {
  const session = await auth();
  if (!session) redirect("/login");

  const wsResult = workspaceSchema.safeParse(workspaceData);
  if (!wsResult.success) {
    throw new Error(
      `workspace.json の形式が正しくありません: ${wsResult.error.issues[0]?.message}`,
    );
  }

  const rawProjects = await db.project.findMany({
    where: {
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
    orderBy: { createdAt: "asc" },
  });

  const projects = rawProjects.map((p) => ({
    ...p,
    projectMembers: p.projectMembers.map((pm) => ({
      id: pm.id,
      userId: pm.userId,
      name: pm.user.name,
      email: pm.user.email,
      image: pm.user.image,
    })),
    pendingInvites: p.pendingInvites.map((inv) => ({
      id: inv.id,
      email: inv.email,
    })),
  }));

  const projResult = projectsSchema.safeParse(projects);
  if (!projResult.success) {
    throw new Error(
      `DB データの形式が正しくありません: ${projResult.error.issues[0]?.message}`,
    );
  }

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 7, 0).toISOString();
  let googleCalendarEvents: GoogleCalendarEvent[] = [];
  try {
    const allEvents = await fetchGoogleCalendarEvents(session.user.id, timeMin, timeMax);
    // ワークスペースが作成したイベントはアクションチップで表示済みなので除外
    const workspaceEventIds = new Set(
      projResult.data.flatMap((p) => p.notes.map((n) => n.googleEventId)).filter(Boolean),
    );
    googleCalendarEvents = allEvents.filter((e) => !workspaceEventIds.has(e.id));
  } catch {
    // fail silently — calendar sync is best-effort
  }

  const user = {
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
    image: session.user?.image ?? null,
  };

  const userSetting = await getUserSetting();

  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <Workspace
      initialProjects={projResult.data}
      workspace={wsResult.data}
      user={user}
      onSignOut={handleSignOut}
      googleCalendarEvents={googleCalendarEvents}
      initialUserSetting={userSetting}
    />
  );
}
