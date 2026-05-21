"use client";

import { useEffect, useState } from "react";
import { Briefcase, FileText, Search, LogOut } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Project } from "@/lib/schema";

type SessionUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type GlobalHeaderProps = {
  workspaceName: string;
  selectedProjectName?: string;
  projects: Project[];
  onSelectProject: (id: string) => void;
  onSelectNote: (noteId: string, projectId: string) => void;
  user?: SessionUser;
  onSignOut?: () => Promise<void>;
};

export function GlobalHeader({
  workspaceName,
  selectedProjectName,
  projects,
  onSelectProject,
  onSelectNote,
  user,
  onSignOut,
}: GlobalHeaderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const activeProjects = projects.filter((p) => !p.archived);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <Breadcrumb
        className="min-w-0 flex-1 overflow-hidden"
        aria-label="パンくず"
      >
        <BreadcrumbList className="flex-nowrap text-[11px]">
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink>{workspaceName}</BreadcrumbLink>
          </BreadcrumbItem>
          {selectedProjectName && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-medium">
                  {selectedProjectName}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        aria-label="検索 (⌘K)"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">検索</span>
        <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>

      {user && onSignOut && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="size-7 shrink-0 overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            }
          >
            {user.image ? (
              <img src={user.image} alt={user.name ?? "ユーザー"} className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center bg-muted text-[10px] font-medium text-foreground">
                {user.name?.charAt(0).toUpperCase() ?? "U"}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onSignOut()}
              className="gap-2"
            >
              <LogOut className="size-3.5" />
              ログアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="検索"
        description="プロジェクト・メモを横断検索"
      >
        <Command>
          <CommandInput placeholder="プロジェクト名・メモ・クライアント名で検索..." />
          <CommandList className="max-h-[28rem]">
            <CommandEmpty>見つかりませんでした</CommandEmpty>

            <CommandGroup heading="プロジェクト">
              {activeProjects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project ${p.id} ${p.name} ${p.clients.join(" ")}`}
                  onSelect={() => {
                    onSelectProject(p.id);
                    setOpen(false);
                  }}
                >
                  <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{p.name}</span>
                  {p.clients.length > 0 && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {p.clients.join(", ")}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="メモ">
              {activeProjects.flatMap((p) =>
                p.notes
                  .filter((n) => !n.isAction && (n.title || n.text).trim())
                  .map((n) => (
                    <CommandItem
                      key={n.id}
                      value={`note ${n.id} ${n.title || n.text} ${p.name}`}
                      onSelect={() => {
                        onSelectProject(p.id);
                        onSelectNote(n.id, p.id);
                        setOpen(false);
                      }}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{n.title || n.text}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {p.name}
                      </span>
                    </CommandItem>
                  )),
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}
