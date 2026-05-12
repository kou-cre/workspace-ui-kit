"use client";

/**
 * Workspace: 4 ペインの親コンポーネント（AIコンサルドメイン）。
 *
 * - Pane 1: 案件一覧サイドバー（ProjectListPane）
 * - Pane 2: 案件詳細 + マイルストーン + アクションプラン（ProjectDetailPane）
 * - Pane 3: フリーメモ一覧（NoteListPane）
 * - Pane 4: メモ詳細編集（NoteDetailPane）— メモ選択時に展開
 *
 * データモデル原則:
 * - Note が全情報の単一ソース。アクションもメモも Note として保存される。
 * - isAction: true のメモ → Pane2 のマイルストーンアクションリストに表示
 * - isAction: false のメモ → Pane3 のみに表示（アクションへの昇格も可能）
 * - milestones は案件ごとにカスタマイズ可能。Note.phase はマイルストーン ID を参照。
 */

import { useState, useCallback, useMemo } from "react";

import {
  type Project,
  type StatusKey,
  type Note,
  type NoteKind,
  type NoteStatus,
  type Milestone,
} from "@/lib/schema";
import { type ComboOption } from "@/components/primitives/InlineComboboxField";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/workspace/GlobalHeader";
import { MilestoneDetailPane } from "@/components/workspace/MilestoneDetailPane";
import { ProjectListPane } from "@/components/workspace/ProjectListPane";
import { ProjectDetailPane } from "@/components/workspace/ProjectDetailPane";
import { NoteListPane } from "@/components/workspace/NoteListPane";
import { NoteDetailPane } from "@/components/workspace/NoteDetailPane";

type WorkspaceProps = {
  initialProjects: Project[];
  workspace: { name: string; icon: string };
};

export function Workspace({ initialProjects, workspace }: WorkspaceProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialProjects[0]?.id ?? "",
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [pane4ManuallyClosed, setPane4ManuallyClosed] = useState(false);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const allClientOptions = useMemo<ComboOption[]>(() => {
    const names = new Set<string>();
    for (const p of projects) {
      for (const c of p.clients) {
        if (c) names.add(c);
      }
    }
    return Array.from(names).map((name) => ({ value: name, description: "" }));
  }, [projects]);

  const pane4Open = (selectedNoteId !== null || selectedMilestoneId !== null) && !pane4ManuallyClosed;
  const activeNote = activeProject?.notes.find((n) => n.id === selectedNoteId) ?? null;
  const activeMilestone = activeProject?.milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const activeMilestoneActions = activeMilestone
    ? (activeProject?.notes.filter((n) => n.isAction && n.phase === activeMilestone.id) ?? [])
    : [];

  // ===== ユーティリティ =====

  const updateProjectNotes = useCallback(
    (updater: (notes: Note[]) => Note[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId ? { ...p, notes: updater(p.notes) } : p,
        ),
      );
    },
    [selectedProjectId],
  );

  // ===== 案件操作 =====

  const selectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedNoteId(null);
    setSelectedMilestoneId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const addProject = useCallback((name: string) => {
    const newProject: Project = {
      id: `p-${Date.now()}`,
      name,
      clients: [],
      status: "",
      milestones: [],
      noteFolders: [],
      notes: [],
    };
    setProjects((prev) => [...prev, newProject]);
    setSelectedProjectId(newProject.id);
    setSelectedNoteId(null);
    setSelectedMilestoneId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const updateProjectStatus = useCallback(
    (status: StatusKey) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, status } : p)),
      );
    },
    [selectedProjectId],
  );

  const updateClients = useCallback(
    (clients: string[]) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, clients } : p)),
      );
    },
    [selectedProjectId],
  );

  // ===== マイルストーン操作 =====

  const addMilestone = useCallback(
    (id: string, label: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, milestones: [...p.milestones, { id, label, dueDate: null }] }
            : p,
        ),
      );
    },
    [selectedProjectId],
  );

  const updateMilestone = useCallback(
    (milestoneId: string, label: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? {
                ...p,
                milestones: p.milestones.map((m) =>
                  m.id === milestoneId ? { ...m, label } : m,
                ),
              }
            : p,
        ),
      );
    },
    [selectedProjectId],
  );

  const updateMilestoneDate = useCallback(
    (milestoneId: string, date: string | null) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? {
                ...p,
                milestones: p.milestones.map((m) =>
                  m.id === milestoneId ? { ...m, dueDate: date } : m,
                ),
              }
            : p,
        ),
      );
    },
    [selectedProjectId],
  );

  const deleteMilestone = useCallback(
    (milestoneId: string) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProjectId) return p;
          const remaining = p.milestones.filter((m) => m.id !== milestoneId);
          return {
            ...p,
            milestones: remaining,
            notes: p.notes.map((n) =>
              n.phase === milestoneId ? { ...n, phase: null } : n,
            ),
            status: p.status === milestoneId
              ? (remaining[0]?.id ?? "")
              : p.status,
          };
        }),
      );
    },
    [selectedProjectId],
  );

  // ===== アクション操作（Note.isAction === true のメモを操作） =====

  const toggleAction = useCallback(
    (noteId: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, done: !n.done } : n)),
      );
    },
    [updateProjectNotes],
  );

  const addAction = useCallback(
    (phase: StatusKey, text: string) => {
      const newNote: Note = {
        id: `a-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        kind: "ToDo候補" as NoteKind,
        status: "未解決" as NoteStatus,
        phase,
        priority: "normal",
        isAction: true,
        done: false,
        subtasks: [],
        text,
      };
      updateProjectNotes((notes) => [...notes, newNote]);
    },
    [updateProjectNotes],
  );

  const deleteAction = useCallback(
    (noteId: string) => {
      updateProjectNotes((notes) => notes.filter((n) => n.id !== noteId));
      setSelectedNoteId((prev) => (prev === noteId ? null : prev));
    },
    [updateProjectNotes],
  );

  const updateAction = useCallback(
    (noteId: string, text: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
      );
    },
    [updateProjectNotes],
  );

  const addSubtask = useCallback(
    (noteId: string, text: string) => {
      const newSub = { id: `s-${Date.now()}`, text, done: false };
      updateProjectNotes((notes) =>
        notes.map((n) =>
          n.id === noteId
            ? { ...n, subtasks: [...(n.subtasks ?? []), newSub] }
            : n,
        ),
      );
    },
    [updateProjectNotes],
  );

  const toggleSubtask = useCallback(
    (noteId: string, subtaskId: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) =>
          n.id === noteId
            ? {
                ...n,
                subtasks: (n.subtasks ?? []).map((s) =>
                  s.id === subtaskId ? { ...s, done: !s.done } : s,
                ),
              }
            : n,
        ),
      );
    },
    [updateProjectNotes],
  );

  const deleteSubtask = useCallback(
    (noteId: string, subtaskId: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) =>
          n.id === noteId
            ? { ...n, subtasks: (n.subtasks ?? []).filter((s) => s.id !== subtaskId) }
            : n,
        ),
      );
    },
    [updateProjectNotes],
  );

  const addNoteFolder = useCallback(
    (label: string) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProjectId) return p;
          const id = `folder-${Date.now()}`;
          return { ...p, noteFolders: [...(p.noteFolders ?? []), { id, label }] };
        }),
      );
    },
    [selectedProjectId],
  );

  const reorderMilestones = useCallback(
    (orderedIds: string[]) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProjectId) return p;
          const idToMs = new Map(p.milestones.map((m) => [m.id, m]));
          return {
            ...p,
            milestones: orderedIds.map((id) => idToMs.get(id)!).filter(Boolean),
          };
        }),
      );
    },
    [selectedProjectId],
  );

  const reorderActions = useCallback(
    (_phase: StatusKey, orderedIds: string[]) => {
      const idSet = new Set(orderedIds);
      updateProjectNotes((notes) => {
        const idToNote = new Map(notes.map((n) => [n.id, n]));
        let reorderedIdx = 0;
        return notes.map((n) => {
          if (idSet.has(n.id)) {
            return idToNote.get(orderedIds[reorderedIdx++])!;
          }
          return n;
        });
      });
    },
    [updateProjectNotes],
  );

  // ===== メモ操作 =====

  const selectNote = useCallback((id: string) => {
    setSelectedNoteId(id);
    setSelectedMilestoneId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const selectMilestone = useCallback((id: string) => {
    setSelectedMilestoneId(id);
    setSelectedNoteId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const addNote = useCallback(
    (phase: StatusKey | null = null) => {
      const newNote: Note = {
        id: `n-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        kind: "アイデア" as NoteKind,
        status: "未解決" as NoteStatus,
        phase,
        priority: "normal",
        isAction: false,
        done: false,
        subtasks: [],
        text: "",
      };
      updateProjectNotes((notes) => [...notes, newNote]);
      setSelectedNoteId(newNote.id);
      setPane4ManuallyClosed(false);
    },
    [updateProjectNotes],
  );

  const updateNote = useCallback(
    (noteId: string, field: keyof Note, value: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, [field]: value } : n)),
      );
    },
    [updateProjectNotes],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      updateProjectNotes((notes) => notes.filter((n) => n.id !== noteId));
      setSelectedNoteId(null);
      setPane4ManuallyClosed(false);
    },
    [updateProjectNotes],
  );

  const setNotePhase = useCallback(
    (noteId: string, phase: StatusKey | null) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, phase } : n)),
      );
    },
    [updateProjectNotes],
  );

  /** メモをアクションに昇格（isAction: true にするだけ。メモは消えない）。 */
  const promoteNoteToAction = useCallback(
    (noteId: string, phase: StatusKey) => {
      updateProjectNotes((notes) =>
        notes.map((n) =>
          n.id === noteId ? { ...n, isAction: true, phase } : n,
        ),
      );
    },
    [updateProjectNotes],
  );

  const toggleNoteStatus = useCallback(
    (noteId: string) => {
      const cycle = { 未解決: "対応中", 対応中: "解決済み", 解決済み: "未解決" } as const;
      updateProjectNotes((notes) =>
        notes.map((n) =>
          n.id === noteId ? { ...n, status: cycle[n.status] } : n,
        ),
      );
    },
    [updateProjectNotes],
  );

  const togglePane4 = useCallback(() => setPane4ManuallyClosed((v) => !v), []);

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen w-full overflow-hidden bg-background text-foreground"
    >
      <ProjectListPane
        workspaceName={workspace.name}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={selectProject}
        onAddProject={addProject}
      />

      <SidebarInset className="flex min-w-0 flex-col bg-background">
        <GlobalHeader
          workspaceName={workspace.name}
          selectedProjectName={activeProject?.name}
        />

        <div className="flex min-h-0 flex-1">
          {activeProject ? (
            <>
              {/* Pane 2: 案件詳細 + マイルストーン + アクションプラン */}
              <ProjectDetailPane
                key={selectedProjectId}
                project={activeProject}
                allClientOptions={allClientOptions}
                selectedMilestoneId={selectedMilestoneId}
                onSelectMilestone={selectMilestone}
                onUpdateProjectStatus={updateProjectStatus}
                onUpdateClients={updateClients}
                onAddMilestone={addMilestone}
                onUpdateMilestone={updateMilestone}
                onDeleteMilestone={deleteMilestone}
                onToggleAction={toggleAction}
                onAddAction={addAction}
                onDeleteAction={deleteAction}
                onUpdateAction={updateAction}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onReorderActions={reorderActions}
                onReorderMilestones={reorderMilestones}
              />

              {/* Pane 3: フリーメモ一覧 */}
              <NoteListPane
                notes={activeProject.notes}
                milestones={activeProject.milestones}
                noteFolders={activeProject.noteFolders ?? []}
                selectedNoteId={selectedNoteId}
                onSelectNote={selectNote}
                onAddNote={addNote}
                onToggleNoteStatus={toggleNoteStatus}
                onUpdateNoteText={(id, text) => updateNote(id, "text", text)}
                onUpdateNotePriority={(id, priority) => updateNote(id, "priority", priority)}
                onPromoteToAction={promoteNoteToAction}
                onDeleteNote={deleteNote}
                onAddNoteFolder={addNoteFolder}
              />

              {/* Pane 4: マイルストーン詳細またはメモ詳細 */}
              {pane4Open && (
                activeMilestone ? (
                  <MilestoneDetailPane
                    key={activeMilestone.id}
                    milestone={activeMilestone}
                    actions={activeMilestoneActions}
                    pane4Open={pane4Open}
                    onTogglePane4={togglePane4}
                    onUpdateLabel={(label) => updateMilestone(activeMilestone.id, label)}
                    onUpdateDueDate={(date) => updateMilestoneDate(activeMilestone.id, date)}
                  />
                ) : activeNote ? (
                  <NoteDetailPane
                    key={activeNote.id}
                    note={activeNote}
                    milestones={activeProject.milestones}
                    noteFolders={activeProject.noteFolders ?? []}
                    pane4Open={pane4Open}
                    onTogglePane4={togglePane4}
                    onUpdateNote={(field, value) =>
                      updateNote(activeNote.id, field, value)
                    }
                    onSetNotePhase={(phase) => setNotePhase(activeNote.id, phase)}
                    onDeleteNote={() => deleteNote(activeNote.id)}
                    onMoveToPhase={(phase) => promoteNoteToAction(activeNote.id, phase)}
                  />
                ) : null
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              左の一覧から案件を選択してください
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
