"use client";

import { useState, useMemo } from "react";
import { CalendarDays, ChevronRight, GripVertical, Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

function buildClientMap(projects: Project[]): Map<string, Project[]> {
  const map = new Map<string, Project[]>();
  for (const p of projects) {
    for (const c of p.clients) {
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(p);
    }
  }
  return map;
}

// ===== SortableClientGroup =====

function SortableClientGroup({
  clientName,
  clientProjects,
  isOpen,
  onToggle,
  selectedProjectId,
  onSelectProject,
}: {
  clientName: string;
  clientProjects: Project[];
  isOpen: boolean;
  onToggle: () => void;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clientName });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "relative z-50 opacity-50")}
    >
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <div className="group/row flex items-center gap-0.5">
          {/* ドラッグハンドル */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/30 opacity-0 hover:text-muted-foreground active:cursor-grabbing group-hover/row:opacity-100"
            aria-label="ドラッグして並び替え"
          >
            <GripVertical className="size-3" />
          </button>

          <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 rounded-md py-1.5 pr-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-150",
                isOpen && "rotate-90",
              )}
            />
            <span className="truncate">{clientName}</span>
            <span className="ml-auto shrink-0 tabular-nums opacity-60">
              {clientProjects.length}
            </span>
          </CollapsibleTrigger>
        </div>

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
    </div>
  );
}

// ===== ProjectListPane =====

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
  const [projectListOpen, setProjectListOpen] = useState(true);
  const [clientOrder, setClientOrder] = useState<string[]>([]);

  const projectList = projects.filter(p => p.id !== PERSONAL_PROJECT_ID);
  const myProjects = projectList.filter(p => p.clients.length === 0);
  const clientedProjects = projectList.filter(p => p.clients.length > 0);

  const clientGroupMap = useMemo(() => buildClientMap(clientedProjects), [clientedProjects]);
  const allClientNames = useMemo(() => Array.from(clientGroupMap.keys()), [clientGroupMap]);

  // clientOrder にない新クライアントは末尾に追加
  const orderedClients = useMemo(() => {
    const inOrder = clientOrder.filter(c => clientGroupMap.has(c));
    const newClients = allClientNames.filter(c => !clientOrder.includes(c));
    return [...inOrder, ...newClients];
  }, [clientOrder, clientGroupMap, allClientNames]);

  const toggleClient = (clientName: string) => {
    setClosedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientName)) next.delete(clientName);
      else next.add(clientName);
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedClients.indexOf(active.id as string);
    const newIdx = orderedClients.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) {
      setClientOrder(arrayMove(orderedClients, oldIdx, newIdx));
    }
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
          {/* マイタスク */}
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
            {/* プロジェクト一覧ヘッダー（展開時のみ表示） */}
            <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <Collapsible
                open={projectListOpen}
                onOpenChange={setProjectListOpen}
                className="group-data-[collapsible=icon]:hidden"
              >
                <CollapsibleTrigger className="flex items-center gap-1 px-1 py-1 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
                  <ChevronRight
                    className={cn(
                      "size-3 shrink-0 transition-transform duration-150",
                      projectListOpen && "rotate-90",
                    )}
                  />
                  プロジェクト一覧
                </CollapsibleTrigger>
              </Collapsible>
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

              {/* 展開時: プロジェクト一覧コンテンツ */}
              {projectListOpen && (
                <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                  {/* My Project: クライアントなしプロジェクト */}
                  {myProjects.length > 0 && (
                    <SidebarMenu>
                      {myProjects.map((project) => {
                        const currentMilestone = project.milestones.find(
                          (m) => m.id === project.status,
                        );
                        return (
                          <SidebarMenuItem key={project.id}>
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
                  )}

                  {/* My Project とクライアントグループの間の区切り */}
                  {myProjects.length > 0 && orderedClients.length > 0 && (
                    <div className="mx-2 my-0.5">
                      <Separator />
                    </div>
                  )}

                  {/* クライアントグループ（DnD並び替え） */}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={orderedClients} strategy={verticalListSortingStrategy}>
                      {orderedClients.map((clientName) => (
                        <SortableClientGroup
                          key={clientName}
                          clientName={clientName}
                          clientProjects={clientGroupMap.get(clientName) ?? []}
                          isOpen={!closedClients.has(clientName)}
                          onToggle={() => toggleClient(clientName)}
                          selectedProjectId={selectedProjectId}
                          onSelectProject={onSelectProject}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
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
