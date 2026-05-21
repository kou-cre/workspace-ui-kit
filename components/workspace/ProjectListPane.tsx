"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,

  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { type Project, PERSONAL_PROJECT_ID } from "@/lib/schema";
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
import { Pane1Toggle } from "@/components/workspace/Pane1Toggle";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";

type CtxMenu = { projectId: string; x: number; y: number } | null;
type ClientCtxMenu = { clientName: string; x: number; y: number } | null;

function ContextMenuPopover({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", escHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  const menuW = 160;
  const menuH = 120;
  const cx = Math.min(x, window.innerWidth - menuW - 8);
  const cy = Math.min(y, window.innerHeight - menuH - 8);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg"
      style={{ left: cx, top: cy }}
    >
      {children}
    </div>
  );
}

function CtxItem({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent",
        danger && "text-destructive hover:text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProjectContextMenu({
  state,
  onClose,
  onRename,
  onArchive,
  onDelete,
}: {
  state: CtxMenu;
  onClose: () => void;
  onRename: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!state) return null;
  return (
    <ContextMenuPopover x={state.x} y={state.y} onClose={onClose}>
      <CtxItem label="名前を変更" icon={<Pencil className="size-3.5" />} onClick={() => { onRename(state.projectId); onClose(); }} />
      <CtxItem label="アーカイブ" icon={<Archive className="size-3.5" />} onClick={() => { onArchive(state.projectId); onClose(); }} />
      <Separator className="my-1" />
      <CtxItem label="削除" icon={<Trash2 className="size-3.5" />} onClick={() => { onDelete(state.projectId); onClose(); }} danger />
    </ContextMenuPopover>
  );
}

function ClientContextMenu({
  state,
  onClose,
  onRename,
  onArchive,
  onDelete,
}: {
  state: ClientCtxMenu;
  onClose: () => void;
  onRename: (name: string) => void;
  onArchive: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  if (!state) return null;
  return (
    <ContextMenuPopover x={state.x} y={state.y} onClose={onClose}>
      <CtxItem label="名前を変更" icon={<Pencil className="size-3.5" />} onClick={() => { onRename(state.clientName); onClose(); }} />
      <CtxItem label="アーカイブ" icon={<Archive className="size-3.5" />} onClick={() => { onArchive(state.clientName); onClose(); }} />
      <Separator className="my-1" />
      <CtxItem label="削除" icon={<Trash2 className="size-3.5" />} onClick={() => { onDelete(state.clientName); onClose(); }} danger />
    </ContextMenuPopover>
  );
}

function groupByClient(projects: Project[], clientOrder: string[]): [string, Project[]][] {
  const map = new Map<string, Project[]>();
  for (const project of projects) {
    if (project.clients.length === 0) continue;
    for (const key of project.clients) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(project);
    }
  }
  const ordered: [string, Project[]][] = [];
  for (const name of clientOrder) {
    if (map.has(name)) ordered.push([name, map.get(name)!]);
  }
  for (const [name, projs] of map.entries()) {
    if (!clientOrder.includes(name)) ordered.push([name, projs]);
  }
  return ordered;
}

function MilestoneDots({ project }: { project: Project }) {
  const currentIdx = project.milestones.findIndex((ms) => ms.id === project.status);
  if (project.milestones.length === 0) return null;
  return (
    <div className="flex items-center gap-0.5">
      {project.milestones.map((m, idx) => (
        <span
          key={m.id}
          className={cn(
            "size-1.5 rounded-full",
            idx < currentIdx
              ? "bg-chart-2"
              : idx === currentIdx
                ? "bg-primary"
                : "bg-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

function ProjectItemWithArchive({
  project,
  isSelected,
  onClick,
  showSharedBadge,
  onArchive,
  onContextMenu,
  isRenaming,
  onRenameCommit,
  onRenameCancel,
}: {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
  showSharedBadge?: boolean;
  onArchive: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isRenaming: boolean;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-project-${project.id}`,
    data: { type: "sidebar-project", projectId: project.id, label: project.name },
  });
  const shouldSave = useRef(true);

  return (
    <SidebarMenuItem>
      <div
        onContextMenu={onContextMenu}
        className={cn("group/drag flex w-full items-center", isDragging && "opacity-40")}
      >
        <button
          ref={setNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none px-1 text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing focus-visible:opacity-100 group-hover/drag:opacity-100"
          aria-label="クライアントにドラッグして関連付け"
        >
          <GripVertical className="size-3.5" />
        </button>
        <SidebarMenuButton
          isActive={isSelected}
          onClick={isRenaming ? undefined : onClick}
          tooltip={isRenaming ? undefined : (project.name || "無題のプロジェクト")}
          className="h-auto flex-1 py-1.5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {isRenaming ? (
                <input
                  autoFocus
                  defaultValue={project.name}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    if (shouldSave.current) onRenameCommit(e.target.value);
                    shouldSave.current = true;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.currentTarget.blur();
                    }
                    if (e.key === "Escape") {
                      shouldSave.current = false;
                      onRenameCancel();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none border-b border-primary focus:border-primary"
                />
              ) : (
                <span className={cn("truncate text-xs font-medium leading-tight", !project.name && "text-muted-foreground/60")}>
                  {project.name || "無題のプロジェクト"}
                </span>
              )}
              {!isRenaming && showSharedBadge && (
                <Badge variant="secondary" size="xs" className="shrink-0">
                  共有
                </Badge>
              )}
            </div>
            {!isRenaming && <MilestoneDots project={project} />}
          </div>
        </SidebarMenuButton>
        {!isRenaming && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/drag:opacity-100"
            aria-label="アーカイブ"
          >
            <Archive className="size-3.5" />
          </button>
        )}
      </div>
    </SidebarMenuItem>
  );
}

function SortableMyProjectItem({
  project,
  isSelected,
  onClick,
  onArchive,
  onContextMenu,
  isRenaming,
  onRenameCommit,
  onRenameCancel,
}: {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
  onArchive: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isRenaming: boolean;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: `sidebar-project-${project.id}`,
    data: { type: "sidebar-project", projectId: project.id, label: project.name },
  });
  const shouldSave = useRef(true);

  return (
    <SidebarMenuItem>
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
          transition,
        }}
        onContextMenu={onContextMenu}
        className={cn("group/drag flex w-full items-center", isDragging && "opacity-40")}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none px-1 text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing focus-visible:opacity-100 group-hover/drag:opacity-100"
          aria-label="ドラッグして並び替え"
        >
          <GripVertical className="size-3.5" />
        </button>
        <SidebarMenuButton
          isActive={isSelected}
          onClick={isRenaming ? undefined : onClick}
          tooltip={isRenaming ? undefined : (project.name || "無題のプロジェクト")}
          className="h-auto flex-1 py-1.5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {isRenaming ? (
                <input
                  autoFocus
                  defaultValue={project.name}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    if (shouldSave.current) onRenameCommit(e.target.value);
                    shouldSave.current = true;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.currentTarget.blur();
                    }
                    if (e.key === "Escape") {
                      shouldSave.current = false;
                      onRenameCancel();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none border-b border-primary focus:border-primary"
                />
              ) : (
                <span className={cn("truncate text-xs font-medium leading-tight", !project.name && "text-muted-foreground/60")}>
                  {project.name || "無題のプロジェクト"}
                </span>
              )}
            </div>
            {!isRenaming && <MilestoneDots project={project} />}
          </div>
        </SidebarMenuButton>
        {!isRenaming && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/drag:opacity-100"
            aria-label="アーカイブ"
          >
            <Archive className="size-3.5" />
          </button>
        )}
      </div>
    </SidebarMenuItem>
  );
}

function ArchivedProjectItem({
  project,
  isSelected,
  onClick,
  onUnarchive,
}: {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
  onUnarchive: () => void;
}) {
  return (
    <SidebarMenuItem>
      <div className="group/arch flex w-full items-center">
        <SidebarMenuButton
          isActive={isSelected}
          onClick={onClick}
          tooltip={project.name}
          className="h-auto flex-1 py-1.5 opacity-60"
        >
          <span className="truncate text-xs font-medium leading-tight">{project.name}</span>
        </SidebarMenuButton>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnarchive();
          }}
          className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/arch:opacity-100"
          aria-label="復元"
        >
          <ArchiveRestore className="size-3.5" />
        </button>
      </div>
    </SidebarMenuItem>
  );
}

function SortableClientGroupWithArchive({
  clientName,
  clientProjects,
  isOpen,
  onToggle,
  selectedProjectId,
  onSelectProject,
  onArchiveClient,
  onArchiveProject,
  openCtxMenu,
  renamingId,
  onRenameProject,
  onRenameCancel,
  onClientContextMenu,
  isRenamingClient,
  onClientRenameCommit,
  onClientRenameCancel,
}: {
  clientName: string;
  clientProjects: Project[];
  isOpen: boolean;
  onToggle: () => void;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  onArchiveClient: () => void;
  onArchiveProject: (id: string) => void;
  openCtxMenu: (e: React.MouseEvent, projectId: string) => void;
  renamingId: string | null;
  onRenameProject: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onClientContextMenu: (e: React.MouseEvent) => void;
  isRenamingClient: boolean;
  onClientRenameCommit: (name: string) => void;
  onClientRenameCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: `client-${clientName}`,
      data: { type: "client", clientName },
    });
  const clientShouldSave = useRef(true);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
        ),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
      className={cn(
        "rounded-md transition-all duration-150",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/30",
      )}
    >
      <Collapsible open={isOpen} onOpenChange={isRenamingClient ? undefined : onToggle}>
        <div className="group/client flex items-center" onContextMenu={onClientContextMenu}>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none px-1.5 py-2 text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing focus-visible:opacity-100 group-hover/client:opacity-100"
            aria-label={`${clientName}を並べ替え`}
          >
            <GripVertical className="size-3.5" />
          </button>
          {isRenamingClient ? (
            <div className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70">
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-150",
                  isOpen && "rotate-90",
                )}
              />
              <input
                autoFocus
                defaultValue={clientName}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  if (clientShouldSave.current) onClientRenameCommit(e.target.value);
                  clientShouldSave.current = true;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                  if (e.key === "Escape") {
                    clientShouldSave.current = false;
                    onClientRenameCancel();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none border-b border-primary focus:border-primary"
              />
            </div>
          ) : (
            <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
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
          )}
          {!isRenamingClient && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchiveClient();
              }}
              className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/client:opacity-100"
              aria-label={`${clientName}をアーカイブ`}
            >
              <Archive className="size-3.5" />
            </button>
          )}
        </div>

        <CollapsibleContent>
          <SidebarMenu className="pl-3">
            {clientProjects.map((project) => (
              <ProjectItemWithArchive
                key={`${clientName}-${project.id}`}
                project={project}
                isSelected={project.id === selectedProjectId}
                onClick={() => onSelectProject(project.id)}
                showSharedBadge={project.clients.length > 1}
                onArchive={() => onArchiveProject(project.id)}
                onContextMenu={(e) => openCtxMenu(e, project.id)}
                isRenaming={renamingId === project.id}
                onRenameCommit={(name) => onRenameProject(project.id, name)}
                onRenameCancel={onRenameCancel}
              />
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ArchivedClientGroup({
  clientName,
  clientProjects,
  isOpen,
  onToggle,
  selectedProjectId,
  onSelectProject,
  onUnarchiveClient,
  onUnarchiveProject,
}: {
  clientName: string;
  clientProjects: Project[];
  isOpen: boolean;
  onToggle: () => void;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  onUnarchiveClient: () => void;
  onUnarchiveProject: (id: string) => void;
}) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div className="group/arch-client flex items-center">
        <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-150",
              isOpen && "rotate-90",
            )}
          />
          <span className="truncate">{clientName}</span>
          <span className="ml-auto shrink-0 tabular-nums opacity-60">{clientProjects.length}</span>
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnarchiveClient();
          }}
          className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/arch-client:opacity-100"
          aria-label={`${clientName}を復元`}
        >
          <ArchiveRestore className="size-3.5" />
        </button>
      </div>
      <CollapsibleContent>
        <SidebarMenu className="pl-3">
          {clientProjects.map((project) => (
            <ArchivedProjectItem
              key={project.id}
              project={project}
              isSelected={project.id === selectedProjectId}
              onClick={() => onSelectProject(project.id)}
              onUnarchive={() => onUnarchiveProject(project.id)}
            />
          ))}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
}

type ProjectListPaneProps = {
  workspaceName: string;
  projects: Project[];
  selectedProjectId: string;
  isPersonalSelected: boolean;
  onSelectProject: (id: string) => void;
  onSelectPersonal: () => void;
  onAddProject: (name: string) => void;
  clientOrder: string[];
  onReorderClients: (newOrder: string[]) => void;
  onAddClientToProject: (projectId: string, clientName: string) => void;
  archivedClients: string[];
  onArchiveProject: (id: string) => void;
  onUnarchiveProject: (id: string) => void;
  onArchiveClient: (clientName: string) => void;
  onUnarchiveClient: (clientName: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameClient: (oldName: string, newName: string) => void;
  onDeleteClient: (clientName: string) => void;
  myProjectOrder: string[];
  onReorderMyProjects: (newOrder: string[]) => void;
};

export function ProjectListPane({
  workspaceName,
  projects,
  selectedProjectId,
  isPersonalSelected,
  onSelectProject,
  onSelectPersonal,
  onAddProject,
  clientOrder,
  onReorderClients,
  onAddClientToProject,
  archivedClients,
  onArchiveProject,
  onUnarchiveProject,
  onArchiveClient,
  onUnarchiveClient,
  onRenameProject,
  onDeleteProject,
  onRenameClient,
  onDeleteClient,
  myProjectOrder,
  onReorderMyProjects,
}: ProjectListPaneProps) {
  const [closedClients, setClosedClients] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [clientCtxMenu, setClientCtxMenu] = useState<ClientCtxMenu>(null);
  const [renamingClientName, setRenamingClientName] = useState<string | null>(null);
  const [deleteClientName, setDeleteClientName] = useState<string | null>(null);
  const [activeSidebarDrag, setActiveSidebarDrag] = useState<{
    type: string;
    label: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const projectList = projects.filter((p) => p.id !== PERSONAL_PROJECT_ID);

  // アクティブプロジェクト
  const activeProjects = projectList.filter((p) => !p.archived);
  const activeMyProjects = activeProjects.filter((p) => p.clients.length === 0);

  const sortedMyProjects = [
    ...myProjectOrder
      .map((id) => activeMyProjects.find((p) => p.id === id))
      .filter((p): p is Project => p !== undefined),
    ...activeMyProjects.filter((p) => !myProjectOrder.includes(p.id)),
  ];
  const myProjectsRef = useRef(sortedMyProjects);
  myProjectsRef.current = sortedMyProjects;
  const sortableMyProjectIds = sortedMyProjects.map((p) => `sidebar-project-${p.id}`);
  const activeClientGroups = groupByClient(activeProjects, clientOrder).filter(
    ([clientName]) => !archivedClients.includes(clientName),
  );
  const sharedActiveProjects = activeProjects.filter((p) => (p.projectMembers?.length ?? 0) > 0);
  const sortableClientIds = activeClientGroups.map(([name]) => `client-${name}`);

  // 個別アーカイブ済みプロジェクト（クライアント自体はアーカイブされていない）
  const individuallyArchivedProjects = projectList.filter(
    (p) => p.archived && !p.clients.some((c) => archivedClients.includes(c)),
  );
  const archivedMyProjects = individuallyArchivedProjects.filter((p) => p.clients.length === 0);
  const archivedProjectsByClient = groupByClient(
    individuallyArchivedProjects.filter((p) => p.clients.length > 0),
    clientOrder,
  );

  // アーカイブ済みクライアントグループ
  const archivedClientGroups: [string, Project[]][] = archivedClients.map((clientName) => [
    clientName,
    projectList.filter((p) => p.clients.includes(clientName)),
  ]);

  const hasArchived = individuallyArchivedProjects.length > 0 || archivedClients.length > 0;
  const totalArchivedCount =
    individuallyArchivedProjects.length +
    archivedClientGroups.reduce((sum, [, projs]) => sum + projs.length, 0);

  const clientGroupsRef = useRef(activeClientGroups);
  clientGroupsRef.current = activeClientGroups;

  const isOpen = (key: string) => !closedClients.has(key);

  const openCtxMenu = useCallback((e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ projectId, x: e.clientX, y: e.clientY });
  }, []);

  const openClientCtxMenu = useCallback((e: React.MouseEvent, clientName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setClientCtxMenu({ clientName, x: e.clientX, y: e.clientY });
  }, []);

  const toggleClient = (key: string) => {
    setClosedClients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type?: string; clientName?: string; label?: string }
      | undefined;
    setActiveSidebarDrag({
      type: data?.type ?? "",
      label: data?.label ?? data?.clientName ?? "",
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveSidebarDrag(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { type?: string; projectId?: string; clientName?: string }
        | undefined;
      const overData = over.data.current as
        | { type?: string; clientName?: string; projectId?: string }
        | undefined;
      const activeType = activeData?.type;

      if (activeType === "client" && overData?.type === "client" && active.id !== over.id) {
        const names = clientGroupsRef.current.map(([name]) => name);
        const oldIdx = names.indexOf(activeData?.clientName ?? "");
        const newIdx = names.indexOf(overData.clientName ?? "");
        if (oldIdx !== -1 && newIdx !== -1) {
          onReorderClients(arrayMove(names, oldIdx, newIdx));
        }
      }

      if (activeType === "sidebar-project" && overData?.type === "sidebar-project" && active.id !== over.id) {
        const ids = myProjectsRef.current.map((p) => p.id);
        const activeProjectId = activeData?.projectId;
        const overProjectId = overData?.projectId;
        if (activeProjectId && overProjectId) {
          const oldIdx = ids.indexOf(activeProjectId);
          const newIdx = ids.indexOf(overProjectId);
          if (oldIdx !== -1 && newIdx !== -1) {
            onReorderMyProjects(arrayMove(ids, oldIdx, newIdx));
          }
        }
      }

      if (activeType === "sidebar-project" && overData?.type === "client") {
        const projectId = activeData?.projectId;
        const clientName = overData.clientName;
        if (projectId && clientName) {
          onAddClientToProject(projectId, clientName);
        }
      }
    },
    [onReorderClients, onAddClientToProject, onReorderMyProjects],
  );

  return (
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
                  <span className="font-medium group-data-[collapsible=icon]:hidden">
                    マイタスク
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="px-3 py-1 group-data-[collapsible=icon]:px-1">
          <Separator />
        </div>

        {/* アイコン折りたたみ時: 全アクティブプロジェクトをアイコン表示 */}
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col">
              {activeProjects.map((project) => (
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

            {/* 展開時 */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                {/* マイプロジェクト */}
                <div className="pb-1">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs font-medium text-sidebar-foreground/70">
                      マイプロジェクト
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onAddProject("")}
                      aria-label="プロジェクトを追加"
                      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Plus />
                    </Button>
                  </div>
                  <SortableContext items={sortableMyProjectIds} strategy={verticalListSortingStrategy}>
                    <SidebarMenu>
                      {sortedMyProjects.map((project) => (
                        <SortableMyProjectItem
                          key={project.id}
                          project={project}
                          isSelected={project.id === selectedProjectId}
                          onClick={() => onSelectProject(project.id)}
                          onArchive={() => onArchiveProject(project.id)}
                          onContextMenu={(e) => openCtxMenu(e, project.id)}
                          isRenaming={renamingId === project.id}
                          onRenameCommit={(name) => { setRenamingId(null); onRenameProject(project.id, name); }}
                          onRenameCancel={() => setRenamingId(null)}
                        />
                      ))}
                      {sortedMyProjects.length === 0 && (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground/50">プロジェクトなし</p>
                      )}
                    </SidebarMenu>
                  </SortableContext>
                </div>

                <div className="px-3 py-1">
                  <Separator />
                </div>

                {/* クライアント別 */}
                <div className="pt-1">
                  <div className="flex items-center px-2 py-1">
                    <span className="text-xs font-medium text-sidebar-foreground/70">
                      クライアント別
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <SortableContext
                      items={sortableClientIds}
                      strategy={verticalListSortingStrategy}
                    >
                      {activeClientGroups.map(([clientName, clientProjects]) => (
                        <SortableClientGroupWithArchive
                          key={clientName}
                          clientName={clientName}
                          clientProjects={clientProjects}
                          isOpen={isOpen(clientName)}
                          onToggle={() => toggleClient(clientName)}
                          selectedProjectId={selectedProjectId}
                          onSelectProject={onSelectProject}
                          onArchiveClient={() => onArchiveClient(clientName)}
                          onArchiveProject={onArchiveProject}
                          openCtxMenu={openCtxMenu}
                          renamingId={renamingId}
                          onRenameProject={(id, name) => { setRenamingId(null); onRenameProject(id, name); }}
                          onRenameCancel={() => setRenamingId(null)}
                          onClientContextMenu={(e) => openClientCtxMenu(e, clientName)}
                          isRenamingClient={renamingClientName === clientName}
                          onClientRenameCommit={(name) => { setRenamingClientName(null); onRenameClient(clientName, name); }}
                          onClientRenameCancel={() => setRenamingClientName(null)}
                        />
                      ))}
                    </SortableContext>
                    {activeClientGroups.length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground/50">
                        クライアントなし
                      </p>
                    )}
                  </div>
                </div>

                {/* 共有プロジェクト */}
                <div className="px-3 py-1">
                  <Separator />
                </div>
                <div className="pt-1">
                  <div className="flex items-center px-2 py-1">
                    <span className="text-xs font-medium text-sidebar-foreground/70">
                      共有プロジェクト
                    </span>
                  </div>
                  <SidebarMenu>
                    {sharedActiveProjects.map((project) => (
                      <ProjectItemWithArchive
                        key={`shared-${project.id}`}
                        project={project}
                        isSelected={project.id === selectedProjectId}
                        onClick={() => onSelectProject(project.id)}
                        onArchive={() => onArchiveProject(project.id)}
                        onContextMenu={(e) => openCtxMenu(e, project.id)}
                        isRenaming={renamingId === project.id}
                        onRenameCommit={(name) => { setRenamingId(null); onRenameProject(project.id, name); }}
                        onRenameCancel={() => setRenamingId(null)}
                      />
                    ))}
                    {sharedActiveProjects.length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground/50">共有プロジェクトなし</p>
                    )}
                  </SidebarMenu>
                </div>

                {/* アーカイブセクション */}
                {hasArchived && (
                  <>
                    <div className="px-3 py-1 pt-2">
                      <Separator />
                    </div>
                    <div className="pt-1">
                      <Collapsible
                        open={isOpen("__archive__")}
                        onOpenChange={() => toggleClient("__archive__")}
                      >
                        <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                          <ChevronRight
                            className={cn(
                              "size-3.5 shrink-0 transition-transform duration-150",
                              isOpen("__archive__") && "rotate-90",
                            )}
                          />
                          <Archive className="size-3.5 shrink-0" />
                          <span>アーカイブ</span>
                          <span className="ml-auto shrink-0 tabular-nums opacity-60">
                            {totalArchivedCount}
                          </span>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="pl-2">
                          {/* 個別アーカイブ: マイプロジェクト */}
                          {archivedMyProjects.length > 0 && (
                            <SidebarMenu>
                              {archivedMyProjects.map((project) => (
                                <ArchivedProjectItem
                                  key={project.id}
                                  project={project}
                                  isSelected={project.id === selectedProjectId}
                                  onClick={() => onSelectProject(project.id)}
                                  onUnarchive={() => onUnarchiveProject(project.id)}
                                />
                              ))}
                            </SidebarMenu>
                          )}

                          {/* 個別アーカイブ: クライアント別 */}
                          {archivedProjectsByClient.map(([clientName, clientProjects]) => (
                            <div key={clientName} className="mt-1">
                              <p className="px-2 pb-0.5 text-xs text-muted-foreground/50">
                                {clientName}
                              </p>
                              <SidebarMenu>
                                {clientProjects.map((project) => (
                                  <ArchivedProjectItem
                                    key={project.id}
                                    project={project}
                                    isSelected={project.id === selectedProjectId}
                                    onClick={() => onSelectProject(project.id)}
                                    onUnarchive={() => onUnarchiveProject(project.id)}
                                  />
                                ))}
                              </SidebarMenu>
                            </div>
                          ))}

                          {/* アーカイブ済みクライアントグループ */}
                          {archivedClientGroups.map(([clientName, clientProjects]) => (
                            <ArchivedClientGroup
                              key={clientName}
                              clientName={clientName}
                              clientProjects={clientProjects}
                              isOpen={isOpen(`__arch-client-${clientName}`)}
                              onToggle={() => toggleClient(`__arch-client-${clientName}`)}
                              selectedProjectId={selectedProjectId}
                              onSelectProject={onSelectProject}
                              onUnarchiveClient={() => onUnarchiveClient(clientName)}
                              onUnarchiveProject={onUnarchiveProject}
                            />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </>
                )}
              </div>

              <DragOverlay dropAnimation={null}>
                {activeSidebarDrag?.type === "client" ? (
                  <div className="flex items-center gap-1.5 rounded-md bg-sidebar px-2 py-1.5 text-xs font-medium opacity-90 shadow-lg ring-1 ring-primary/30">
                    <GripVertical className="size-3.5 text-muted-foreground" />
                    <span>{activeSidebarDrag.label}</span>
                  </div>
                ) : activeSidebarDrag?.type === "sidebar-project" ? (
                  <div className="flex items-center gap-1.5 rounded-md bg-sidebar px-2 py-1.5 text-xs font-medium opacity-90 shadow-lg ring-1 ring-primary/30">
                    <GripVertical className="size-3.5 text-muted-foreground" />
                    <span className="max-w-36 truncate">{activeSidebarDrag.label}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <ClientContextMenu
        state={clientCtxMenu}
        onClose={() => setClientCtxMenu(null)}
        onRename={(name) => setRenamingClientName(name)}
        onArchive={(name) => onArchiveClient(name)}
        onDelete={(name) => setDeleteClientName(name)}
      />
      <DeleteConfirmDialog
        open={deleteClientName !== null}
        onOpenChange={(open) => { if (!open) setDeleteClientName(null); }}
        title="クライアントを削除"
        itemName={deleteClientName ?? ""}
        description={`「${deleteClientName}」をクライアントとして削除します。関連するプロジェクトからも削除されます。この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteClientName) {
            onDeleteClient(deleteClientName);
            setDeleteClientName(null);
          }
        }}
      />
      <ProjectContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onRename={(id) => setRenamingId(id)}
        onArchive={(id) => onArchiveProject(id)}
        onDelete={(id) => setDeleteTargetId(id)}
      />
      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="プロジェクトを削除"
        itemName={projectList.find((p) => p.id === deleteTargetId)?.name || "無題のプロジェクト"}
        onConfirm={() => {
          if (deleteTargetId) {
            onDeleteProject(deleteTargetId);
            setDeleteTargetId(null);
          }
        }}
      />
    </Sidebar>
  );
}
