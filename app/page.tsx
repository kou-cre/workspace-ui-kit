import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import workspaceData from "@/data/workspace.json";
import demoProjectsData from "@/data/demo-projects.json";
import demoCalendarData from "@/data/demo-calendar.json";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import {
  projectsSchema,
  workspaceSchema,
  DEFAULT_WORK_START_TIME,
  type GoogleCalendarEvent,
} from "@/lib/schema";
import { fetchGoogleCalendarEvents } from "@/lib/google-calendar";

/**
 * スクリーンショット用デモモード。
 * DEMO_MODE=true のとき、認証・DB・Google カレンダーを一切使わず、
 * data/demo-*.json のダミーデータと固定のデモユーザーで描画する。
 * フラグ未設定（=本番）の場合はこの分岐に入らないため、本番経路は無傷。
 */
async function renderDemoWorkspace() {
  const wsResult = workspaceSchema.safeParse(workspaceData);
  if (!wsResult.success) {
    throw new Error(
      `workspace.json の形式が正しくありません: ${wsResult.error.issues[0]?.message}`,
    );
  }

  const projResult = projectsSchema.safeParse(demoProjectsData);
  if (!projResult.success) {
    throw new Error(
      `demo-projects.json の形式が正しくありません: ${projResult.error.issues[0]?.message}`,
    );
  }

  const user = { name: "三上 健", email: "ken@example.com", image: null };
  const userSetting = { workStartTime: DEFAULT_WORK_START_TIME };
  const googleCalendarEvents = demoCalendarData as GoogleCalendarEvent[];

  const handleSignOut = async () => {
    "use server";
    redirect("/");
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

export default async function Page() {
  if (process.env.DEMO_MODE === "true") {
    return renderDemoWorkspace();
  }

  const session = await auth();
  if (!session) redirect("/login");

  const wsResult = workspaceSchema.safeParse(workspaceData);
  if (!wsResult.success) {
    throw new Error(
      `workspace.json の形式が正しくありません: ${wsResult.error.issues[0]?.message}`,
    );
  }

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 7, 0).toISOString();

  // セッション取得後の独立した 3 つのデータ取得を並列実行
  const [rawProjects, allEvents, userSettingRaw] = await Promise.all([
    db.project.findMany({
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
    }),
    fetchGoogleCalendarEvents(session.user.id, timeMin, timeMax).catch(
      () => [] as GoogleCalendarEvent[],
    ),
    db.userSetting.findUnique({ where: { userId: session.user.id } }),
  ]);

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

  // ワークスペースが作成したイベントはアクションチップで表示済みなので除外
  const workspaceEventIds = new Set(
    projResult.data.flatMap((p) => p.notes.map((n) => n.googleEventId)).filter(Boolean),
  );
  const googleCalendarEvents = allEvents.filter((e) => !workspaceEventIds.has(e.id));

  const user = {
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
    image: session.user?.image ?? null,
  };

  const userSetting = {
    workStartTime: userSettingRaw?.workStartTime ?? DEFAULT_WORK_START_TIME,
  };

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
