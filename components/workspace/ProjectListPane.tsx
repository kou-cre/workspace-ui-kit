"use client";

import { useState } from "react";
import { CalendarDays, ChevronRight, Plus } from "lucide-react";

import { type Project, PERSONAL_PROJECT_ID } from "@/lib/schema";
import { getMilestoneBadgeVariant } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AddItemDialog } from "@/components/workspace/AddItemDialog";
import { Pane1Toggle } from "@/components/workspace/Pane1Toggle";

type ProjectListPaneProps = {
  workspaceName: string;
  projects: Project[];
  selectedProjectId: string;
  isPersonalSelected: boolean;
  onSelectProject: (id: string) => void;
  onSelectPersonal: () => void;
  onAddProject: (name: string) => void;
};

/** クライアントごとにプロジェクトをグルーピングして返す。
 *  共有案件（複数クライアント）は各クライアント配下に重複して表示される。 */
function groupByClient(projects: Project[]): [string, Project[]][] {
  const map = new Map<string, Project[]>();
  for (const project of projects) {
    const keys = project.clients.length > 0 ? project.clients : ["未設定"];
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(project);
    }
  }
  return Array.from(map.entries());
}

export function ProjectListPane({
  workspaceName,
  projects,
  selectedProjectId,
  isPersonalSelected,
  onSelectProject,
  onSelectPersonal,
  onAddProject,
}: ProjectListPaneProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [closedClients, setClosedClients] = useState<Set<string>>(new Set());

  const projectList = projects.filter(p => p.id !== PERSONAL_PROJECT_ID);
  const clientGroups = groupByClient(projectList);

  const isOpen = (clientName: string) => !closedClients.has(clientName);
  const toggleClient = (clientName: string) => {
    setClosedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientName)) next.delete(clientName);
      else next.add(clientName);
      return next;
    });
  };

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border [&_[data-slot=sidebar-container]]:bg-sidebar"
      >
        <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2">
          <span className="truncate font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {workspaceName}
          </span>
          <Pane1Toggle />
        </SidebarHeader>

        <SidebarContent>
          {/* マイタスク（個人ダッシュボード）エントリ */}
          <SidebarGroup className="pb-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isPersonalSelected}
                    onClick={onSelectPersonal}
                    tooltip="マイタスク"
                    className="h-auto py-1.5"
                  >
                    <CalendarDays className="size-4 shrink-0" />
                    <span className="font-medium group-data-[collapsible=icon]:hidden">マイタスク</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <div className="px-3 py-1 group-data-[collapsible=icon]:px-1">
            <Separator />
          </div>

          <SidebarGroup>
            <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <span className="px-2 py-1 text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                プロジェクト一覧
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setAddDialogOpen(true)}
                aria-label="プロジェクトを追加"
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Plus />
              </Button>
            </div>

            <SidebarGroupContent>
              {/* アイコン折りたたみ時 */}
              <SidebarMenu className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col">
                {projectList.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={project.id === selectedProjectId}
                      onClick={() => onSelectProject(project.id)}
                      tooltip={project.name}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold">
                        {project.name[0]}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>

              {/* 展開時: クライアント別 Collapsible グループ */}
              <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                {clientGroups.map(([clientName, clientProjects]) => (
                  <Collapsible
                    key={clientName}
                    open={isOpen(clientName)}
                    onOpenChange={() => toggleClient(clientName)}
                  >
                    <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 transition-transform duration-150",
                          isOpen(clientName) && "rotate-90",
                        )}
                      />
                      <span className="truncate">{clientName}</span>
                      <span className="ml-auto shrink-0 tabular-nums opacity-60">
                        {clientProjects.length}
                      </span>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenu className="pl-3">
                        {clientProjects.map((project) => {
                          const currentMilestone = project.milestones.find(
                            (m) => m.id === project.status,
                          );
                          return (
                            <SidebarMenuItem key={`${clientName}-${project.id}`}>
                              <SidebarMenuButton
                                isActive={project.id === selectedProjectId}
                                onClick={() => onSelectProject(project.id)}
                                tooltip={project.name}
                                className="h-auto py-1.5"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <span className="truncate text-sm font-medium leading-tight">
                                    {project.name}
                                  </span>
                                  {project.clients.length > 1 && (
                                    <Badge variant="secondary" size="xs" className="shrink-0">
                                      共有
                                    </Badge>
                                  )}
                                </div>

                                {currentMilestone && (
                                  <Badge
                                    variant={getMilestoneBadgeVariant(project.status)}
                                    size="xs"
                                    className="ml-auto shrink-0"
                                  >
                                    {currentMilestone.label}
                                  </Badge>
                                )}
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <AddItemDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        title="プロジェクトを追加"
        description="プロジェクト名を入力してください。クライアント名は後から設定できます。"
        fieldLabel="プロジェクト名"
        fieldId="project-name"
        placeholder="例: 新規Webサイト制作"
        onAdd={onAddProject}
      />
    </>
  );
}
