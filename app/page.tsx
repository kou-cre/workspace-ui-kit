import { Workspace } from "@/components/workspace/Workspace";
import projectsData from "@/data/projects.json";
import workspaceData from "@/data/workspace.json";
import { projectsSchema, workspaceSchema } from "@/lib/schema";

export default function Page() {
  const projResult = projectsSchema.safeParse(projectsData);
  const wsResult = workspaceSchema.safeParse(workspaceData);

  if (!projResult.success || !wsResult.success) {
    const errors = [
      !projResult.success &&
        `projects.json: ${projResult.error.issues[0]?.message}`,
      !wsResult.success &&
        `workspace.json: ${wsResult.error.issues[0]?.message}`,
    ].filter(Boolean);
    throw new Error(`データの形式が正しくありません:\n${errors.join("\n")}`);
  }

  return (
    <Workspace
      initialProjects={projResult.data}
      workspace={wsResult.data}
    />
  );
}
