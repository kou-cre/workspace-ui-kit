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

import { useState, useCallback, useMemo, useEffect } from "react";
import { GripVertical, ChevronLeft, CalendarDays, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import {
  type Project,
  type StatusKey,
  type Note,
  type NoteFolder,
  type NoteKind,
  type NoteStatus,
  type Milestone,
  type GoogleCalendarEvent,
  type UserSetting,
} from "@/lib/schema";
import { type ComboOption } from "@/components/primitives/InlineComboboxField";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/workspace/GlobalHeader";
import { MilestoneDetailPane } from "@/components/workspace/MilestoneDetailPane";
import { NoteFolderDetailPane } from "@/components/workspace/NoteFolderDetailPane";
import { ProjectListPane } from "@/components/workspace/ProjectListPane";
import { ProjectDetailPane } from "@/components/workspace/ProjectDetailPane";
import { NoteListPane } from "@/components/workspace/NoteListPane";
import { NoteDetailPane } from "@/components/workspace/NoteDetailPane";
import { CalendarPane } from "@/components/workspace/CalendarPane";
import { ProjectSummaryPane } from "@/components/workspace/ProjectSummaryPane";
import { type CalendarTodo, PERSONAL_PROJECT_ID } from "@/lib/schema";
import { nanoid } from "nanoid";
import {
  createProject as createProjectAction,
  updateProject as updateProjectAction,
  archiveProject as archiveProjectDbAction,
  updateProjectClients as updateProjectClientsAction,
  deleteProject as deleteProjectAction,
  inviteCollaborator as inviteCollaboratorAction,
  removeCollaborator as removeCollaboratorAction,
  removePendingInvite as removePendingInviteAction,
  type InviteResult,
} from "@/lib/actions/projects";
import {
  createMilestone as createMilestoneAction,
  updateMilestone as updateMilestoneAction,
  deleteMilestone as deleteMilestoneAction,
  reorderMilestones as reorderMilestonesAction,
} from "@/lib/actions/milestones";
import {
  createNote as createNoteAction,
  updateNote as updateNoteAction,
  deleteNote as deleteNoteAction,
  reorderNotes as reorderNotesAction,
  reorderTimelineNotes as reorderTimelineNotesAction,
  createSubtask as createSubtaskAction,
  updateSubtask as updateSubtaskAction,
  deleteSubtask as deleteSubtaskAction,
} from "@/lib/actions/notes";
import {
  createNoteFolder as createNoteFolderAction,
  updateNoteFolder as updateNoteFolderAction,
} from "@/lib/actions/folders";
import { updateWorkStartTime as updateWorkStartTimeAction } from "@/lib/actions/userSetting";
import { UnassignedTaskPane } from "@/components/workspace/UnassignedTaskPane";
import { DayTimelinePane } from "@/components/workspace/DayTimelinePane";
import { DEFAULT_TIMELINE_DURATION, DEFAULT_WORK_START_TIME } from "@/lib/schema";

const todayLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// ドラッグ中のアイテム種別に応じて衝突対象を絞り込む。
//
// action ドラッグ時に closestCenter だけ使うと milestone-zone（マイルストーン全体を
// 覆う巨大 droppable）の中心が動かないため常に勝ち続け、挿入ラインが最下部に固定される。
// 対策: action が 1 つ以上あるマイルストーンの milestone-zone を候補から除外し、
// 空マイルストーンの zone だけ残す。closestCenter は verticalListSortingStrategy と
// 相性が良く、transform 後の rect でも中心距離で正しく判定できる。
const workspaceCollisionDetection: CollisionDetection = (args) => {
  const activeType = (args.active.data.current as { type?: string } | undefined)?.type;

  // action ドラッグ時、「中に action droppable を持つマイルストーンの zone」を集める。
  const milestoneIdsWithActions = new Set<string>();
  if (activeType === "action") {
    for (const c of args.droppableContainers) {
      const d = c.data.current as { type?: string; milestoneId?: string } | undefined;
      if (d?.type === "action" && d.milestoneId) {
        milestoneIdsWithActions.add(d.milestoneId);
      }
    }
  }

  const droppableContainers = args.droppableContainers.filter((c) => {
    const d = c.data.current as { type?: string; milestoneId?: string } | undefined;
    const t = d?.type;
    if (activeType === "action") {
      if (t === "action") return true;
      if (t === "milestone-zone") {
        // 空のマイルストーンのみ候補に残す（action 列内では action droppable に任せる）
        return d?.milestoneId ? !milestoneIdsWithActions.has(d.milestoneId) : false;
      }
      return false;
    }
    if (activeType === "milestone") return t === "milestone";
    if (activeType === "note") return t === "milestone-zone";
    return true;
  });

  // ポインター位置を衝突矩形の中心にすることで、グリップ位置と setNodeRef 要素のズレを補正する
  const { pointerCoordinates } = args;
  const collisionRect = pointerCoordinates
    ? {
        ...args.collisionRect,
        left: pointerCoordinates.x,
        right: pointerCoordinates.x,
        top: pointerCoordinates.y,
        bottom: pointerCoordinates.y,
        width: 0,
        height: 0,
      }
    : args.collisionRect;
  // note ドラッグ時はポインターが実際に milestone-zone の内側にある場合だけ衝突させる。
  // closestCenter は「最も近い」を返すため、どこに落としても必ず何かに吸い込まれてしまう。
  if (activeType === "note") {
    return pointerWithin({ ...args, droppableContainers });
  }

  return closestCenter({ ...args, droppableContainers, collisionRect });
};

type SessionUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type WorkspaceProps = {
  initialProjects: Project[];
  workspace: { name: string; icon: string };
  user?: SessionUser;
  onSignOut?: () => Promise<void>;
  googleCalendarEvents?: GoogleCalendarEvent[];
  initialUserSetting?: UserSetting;
};

export function Workspace({ initialProjects, workspace, user, onSignOut, googleCalendarEvents = [], initialUserSetting }: WorkspaceProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [workStartTime, setWorkStartTime] = useState<string>(
    initialUserSetting?.workStartTime ?? DEFAULT_WORK_START_TIME,
  );

  const handleWorkStartTimeChange = useCallback((time: string) => {
    setWorkStartTime(time);
    updateWorkStartTimeAction(time).catch(console.error);
  }, []);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialProjects.find(p => p.id !== PERSONAL_PROJECT_ID)?.id ?? initialProjects[0]?.id ?? "",
  );
  const [archivedClients, setArchivedClients] = useState<string[]>([]);

  const [clientOrder, setClientOrder] = useState<string[]>(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const p of initialProjects) {
      for (const c of p.clients) {
        if (!seen.has(c)) { seen.add(c); order.push(c); }
      }
    }
    return order;
  });

  const [myProjectOrder, setMyProjectOrder] = useState<string[]>(() =>
    initialProjects
      .filter((p) => p.id !== PERSONAL_PROJECT_ID && p.clients.length === 0 && !p.archived)
      .map((p) => p.id),
  );

  const updateMyProjectOrder = useCallback((newOrder: string[]) => {
    setMyProjectOrder(newOrder);
  }, []);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [pane4ManuallyClosed, setPane4ManuallyClosed] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: string; label: string } | null>(null);

  // モバイル専用ナビゲーション
  const [mobileTab, setMobileTab] = useState<"personal" | "projects">("personal");
  const [mobileDetailProjectId, setMobileDetailProjectId] = useState<string | null>(null);
  const [mobileProjectSubTab, setMobileProjectSubTab] = useState<"actions" | "notes">("actions");
  const [mobileNoteView, setMobileNoteView] = useState(false);
  const [mobilePersonalSubTab, setMobilePersonalSubTab] = useState<"unassigned" | "timeline">("unassigned");

  // 個人ダッシュボード
  const [selectedView, setSelectedView] = useState<"personal" | null>(null);
  const [personalTab, setPersonalTab] = useState<"calendar" | "summary">("calendar");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(todayLocalDate);
  const [selectedNoteProjectId, setSelectedNoteProjectId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  const allActiveClientOptions = useMemo<ComboOption[]>(() => {
    const names = new Set<string>();
    for (const p of projects) {
      for (const c of p.clients) {
        if (c && !archivedClients.includes(c)) names.add(c);
      }
    }
    return Array.from(names).map((name) => ({ value: name, description: "" }));
  }, [projects, archivedClients]);

  const allArchivedClientOptions = useMemo<ComboOption[]>(() => {
    return archivedClients.map((name) => ({ value: name, description: "" }));
  }, [archivedClients]);

  const activeNote = activeProject?.notes.find((n) => n.id === selectedNoteId) ?? null;
  const activeMilestone = activeProject?.milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const activeFolder = activeProject?.noteFolders?.find((f) => f.id === selectedFolderId) ?? null;
  const activeMilestoneActions = activeMilestone
    ? (activeProject?.notes.filter((n) => n.isAction && n.phase === activeMilestone.id) ?? [])
    : [];
  const pane4Open = (activeNote !== null || activeMilestone !== null || activeFolder !== null) && !pane4ManuallyClosed;

  // 個人ダッシュボード用の集計
  const calendarTodos = useMemo<CalendarTodo[]>(() => {
    return projects.flatMap(p =>
      p.notes
        .filter(n => n.date && (p.id === PERSONAL_PROJECT_ID ? true : n.isAction))
        .map(n => ({ ...n, projectId: p.id, projectName: p.name })),
    );
  }, [projects]);

  const dayTodos = useMemo(
    () => calendarTodos.filter(t => t.date === selectedCalendarDate),
    [calendarTodos, selectedCalendarDate],
  );

  const dayUnassignedTodos = useMemo(
    () =>
      dayTodos
        .filter((t) => (t.duration ?? 0) <= 0 || !t.time)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [dayTodos],
  );

  const dayTimelineTodos = useMemo(
    () =>
      dayTodos
        .filter((t) => (t.duration ?? 0) > 0 && !!t.time)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [dayTodos],
  );

  const personalActiveNote = useMemo(() => {
    if (!selectedNoteId || !selectedNoteProjectId) return null;
    return projects.find(p => p.id === selectedNoteProjectId)?.notes.find(n => n.id === selectedNoteId) ?? null;
  }, [selectedNoteId, selectedNoteProjectId, projects]);

  const personalActiveProject = useMemo(() => {
    if (!selectedNoteProjectId) return null;
    return projects.find(p => p.id === selectedNoteProjectId) ?? null;
  }, [selectedNoteProjectId, projects]);

  const personalPane4Open = personalActiveNote !== null && !pane4ManuallyClosed;

  const mobileDetailProject = mobileDetailProjectId
    ? (projects.find((p) => p.id === mobileDetailProjectId) ?? null)
    : null;

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

  // ブラウザ戻るボタン対応
  useEffect(() => {
    const initId = initialProjects.find(p => p.id !== PERSONAL_PROJECT_ID)?.id ?? initialProjects[0]?.id ?? "";
    window.history.replaceState({ type: "project", projectId: initId }, "");

    const handler = (e: PopStateEvent) => {
      const state = e.state as { type: string; projectId?: string } | null;
      if (!state) return;
      if (state.type === "personal") {
        setSelectedView("personal");
        setSelectedNoteId(null);
        setSelectedNoteProjectId(null);
        setSelectedMilestoneId(null);
        setSelectedFolderId(null);
        setPane4ManuallyClosed(false);
      } else if (state.type === "project" && state.projectId) {
        setSelectedProjectId(state.projectId);
        setSelectedView(null);
        setSelectedNoteId(null);
        setSelectedMilestoneId(null);
        setSelectedFolderId(null);
        setPane4ManuallyClosed(false);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 案件操作 =====

  const selectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedView(null);
    setSelectedNoteId(null);
    setSelectedMilestoneId(null);
    setSelectedFolderId(null);
    setPane4ManuallyClosed(false);
    window.history.pushState({ type: "project", projectId: id }, "");
  }, []);

  const navigateToNote = useCallback((noteId: string, projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedView(null);
    setSelectedNoteId(noteId);
    setSelectedMilestoneId(null);
    setSelectedFolderId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const selectPersonalDashboard = useCallback(() => {
    setSelectedView("personal");
    setSelectedNoteId(null);
    setSelectedNoteProjectId(null);
    setSelectedMilestoneId(null);
    setSelectedFolderId(null);
    setPane4ManuallyClosed(false);
    window.history.pushState({ type: "personal" }, "");
  }, []);

  const toggleCalendarTodo = useCallback((noteId: string, projectId: string) => {
    const currentDone = projects.find(p => p.id === projectId)?.notes.find(n => n.id === noteId)?.done ?? false;
    const newDone = !currentDone;
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        notes: p.notes.map(n => {
          if (n.id !== noteId) return n;
          return { ...n, done: newDone, status: newDone ? "解決済み" : "未解決" };
        }),
      };
    }));
    updateNoteAction(noteId, "done", newDone).catch(console.error);
    updateNoteAction(noteId, "status", newDone ? "解決済み" : "未解決").catch(console.error);
  }, [projects]);

  const addPersonalTodo = useCallback((text: string, date: string) => {
    const id = nanoid();
    const newNote: Note = {
      id,
      date,
      endDate: "",
      time: "",
      duration: 0,
      kind: "Todo",
      status: "未解決",
      phase: null,
      priority: "normal",
      isAction: false,
      done: false,
      subtasks: [],
      title: text,
      text: "",
      assignee: "",
      createdBy: "",
      order: 0,
      googleEventId: null,
    };
    setProjects(prev => prev.map(p =>
      p.id === PERSONAL_PROJECT_ID ? { ...p, notes: [...p.notes, newNote] } : p,
    ));
    createNoteAction(PERSONAL_PROJECT_ID, { id, date, kind: "Todo", status: "未解決", title: text, text: "" }).catch(console.error);
  }, []);

  const selectCalendarNote = useCallback((noteId: string, projectId: string) => {
    setSelectedNoteId(noteId);
    setSelectedNoteProjectId(projectId);
    setPane4ManuallyClosed(false);
  }, []);

  const addProject = useCallback((name: string) => {
    const id = nanoid();
    const newProject: Project = {
      id,
      name,
      description: "",
      clients: [],
      status: "",
      archived: false,
      milestones: [],
      noteFolders: [],
      notes: [],
      members: [],
      ownerId: "",
      projectMembers: [],
      pendingInvites: [],
    };
    setProjects((prev) => [...prev, newProject]);
    setSelectedProjectId(id);
    setSelectedNoteId(null);
    setSelectedMilestoneId(null);
    setSelectedFolderId(null);
    setPane4ManuallyClosed(false);
    createProjectAction(name, id).catch(console.error);
  }, []);


  const updateProjectName = useCallback(
    (name: string) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, name } : p)),
      );
      updateProjectAction(selectedProjectId, "name", name).catch(console.error);
    },
    [selectedProjectId],
  );

  const updateProjectDescription = useCallback(
    (description: string) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, description } : p)),
      );
      updateProjectAction(selectedProjectId, "description", description).catch(console.error);
    },
    [selectedProjectId],
  );

  const updateProjectStatus = useCallback(
    (status: StatusKey) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, status } : p)),
      );
      updateProjectAction(selectedProjectId, "status", status).catch(console.error);
    },
    [selectedProjectId],
  );

  const updateClients = useCallback(
    (clients: string[]) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, clients } : p)),
      );
      setClientOrder((prev) => {
        const newOnes = clients.filter((c) => !prev.includes(c));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
      updateProjectClientsAction(selectedProjectId, clients).catch(console.error);
    },
    [selectedProjectId],
  );

  const updateClientOrder = useCallback((newOrder: string[]) => {
    setClientOrder(newOrder);
  }, []);

  const addClientToProject = useCallback((projectId: string, clientName: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId || p.clients.includes(clientName)) return p;
        return { ...p, clients: [...p.clients, clientName] };
      }),
    );
    setClientOrder((prev) =>
      prev.includes(clientName) ? prev : [...prev, clientName],
    );
  }, []);

  // ===== アーカイブ操作 =====

  const moveTodoDate = useCallback((noteId: string, projectId: string, newDate: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, notes: p.notes.map((n) => n.id === noteId ? { ...n, date: newDate } : n) };
      }),
    );
    updateNoteAction(noteId, "date", newDate).catch(console.error);
  }, []);

  // ===== カレンダー D&D =====

  const [calendarActiveDrag, setCalendarActiveDrag] = useState<CalendarTodo | null>(null);

  const calendarSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleCalendarDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { todo: CalendarTodo } | undefined;
    setCalendarActiveDrag(data?.todo ?? null);
  }, []);

  const handleCalendarDragEnd = useCallback((event: DragEndEvent) => {
    setCalendarActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const todo = (active.data.current as { todo: CalendarTodo }).todo;
    const targetDate = (over.data.current as { dateStr?: string })?.dateStr;
    if (targetDate && todo.date !== targetDate) {
      moveTodoDate(todo.id, todo.projectId, targetDate);
    }
  }, [moveTodoDate]);

  // ===== マイタスク（カレンダー + 未割当 + タイムライン）D&D =====

  /**
   * 同じ projects state 内で、特定 date の note 群を「未割当(duration<=0) → タイムライン(duration>0)」
   * の順に結合し、新しい order を 0..N で振り直す。projects state を直接ミューテートせず新オブジェクトを返す。
   *
   * `moveNoteId` を指定すると、その note を target zone の末尾に移動し（必要なら duration を上書き）、
   * `swapWithNoteId` を指定すると、その note を swapWithNoteId の位置と入れ替える。
   */
  const recomputeDayOrder = useCallback(
    (
      currentProjects: Project[],
      date: string,
      options: {
        moveNoteId?: string;
        targetZone?: "timeline" | "unassigned";
        overrideDuration?: number;
        overrideTime?: string;
        sortableSwap?: { activeId: string; overId: string; zone: "timeline" | "unassigned" };
      },
    ): { nextProjects: Project[]; orderedIds: string[] } => {
      // 当該日付の全 note を 1 列に集める
      type Tagged = { note: Note; projectId: string };
      const sameDay: Tagged[] = [];
      for (const p of currentProjects) {
        for (const n of p.notes) {
          if (n.date === date) sameDay.push({ note: n, projectId: p.id });
        }
      }
      // moveNoteId 指定時は当該 note を見つけて duration/time を上書き
      let movedTag: Tagged | null = null;
      const others = sameDay.filter((t) => {
        if (options.moveNoteId && t.note.id === options.moveNoteId) {
          movedTag = {
            ...t,
            note: {
              ...t.note,
              duration: options.overrideDuration ?? t.note.duration,
              time: options.overrideTime ?? t.note.time,
            },
          };
          return false;
        }
        return true;
      });
      const allDay: Tagged[] = movedTag ? [...others, movedTag] : others;
      // 未割当 / タイムラインに分割
      const unassigned = allDay
        .filter((t) => (t.note.duration ?? 0) <= 0)
        .sort((a, b) => (a.note.order ?? 0) - (b.note.order ?? 0));
      const timeline = allDay
        .filter((t) => (t.note.duration ?? 0) > 0)
        .sort((a, b) => (a.note.order ?? 0) - (b.note.order ?? 0));

      // sortableSwap 指定があれば、該当 zone 内で入れ替え
      if (options.sortableSwap) {
        const zoneList = options.sortableSwap.zone === "timeline" ? timeline : unassigned;
        const oldIdx = zoneList.findIndex((t) => t.note.id === options.sortableSwap!.activeId);
        const newIdx = zoneList.findIndex((t) => t.note.id === options.sortableSwap!.overId);
        if (oldIdx !== -1 && newIdx !== -1) {
          const moved = arrayMove(zoneList, oldIdx, newIdx);
          if (options.sortableSwap.zone === "timeline") {
            timeline.splice(0, timeline.length, ...moved);
          } else {
            unassigned.splice(0, unassigned.length, ...moved);
          }
        }
      } else if (movedTag) {
        // moveNoteId 指定時は target zone の末尾へ
        const list = options.targetZone === "timeline" ? timeline : unassigned;
        // movedTag は既に末尾に追加されている（filter + concat の効果）。zone 振り分けで自然に末尾になる
        // 念のため重複を取り除き末尾に再挿入
        const idx = list.findIndex((t) => t.note.id === movedTag!.note.id);
        if (idx !== -1) {
          list.splice(idx, 1);
          list.push(movedTag);
        }
      }

      const combined: Tagged[] = [...unassigned, ...timeline];
      const orderedIds = combined.map((t) => t.note.id);

      // projects に書き戻す（同日 note の order/duration/time を更新）
      const tagByNoteId = new Map<string, Tagged>();
      combined.forEach((t, i) => {
        tagByNoteId.set(t.note.id, { ...t, note: { ...t.note, order: i } });
      });
      const nextProjects = currentProjects.map((p) => ({
        ...p,
        notes: p.notes.map((n) => {
          const tag = tagByNoteId.get(n.id);
          if (!tag) return n;
          return tag.note;
        }),
      }));

      return { nextProjects, orderedIds };
    },
    [],
  );

  /** 未割当 ↔ タイムラインの zone 跨ぎ。duration / time を切り替えて当該 zone の末尾へ。 */
  const moveBetweenZones = useCallback(
    (
      noteId: string,
      projectId: string,
      targetZone: "timeline" | "unassigned",
      /** タイムラインへドロップした時刻（HH:MM）。未指定なら 09:00。 */
      dropTime?: string,
    ) => {
      const project = projects.find((p) => p.id === projectId);
      const note = project?.notes.find((n) => n.id === noteId);
      if (!note) return;
      const date = note.date;
      const overrideDuration =
        targetZone === "timeline"
          ? note.duration > 0
            ? note.duration
            : DEFAULT_TIMELINE_DURATION
          : 0;
      const overrideTime =
        targetZone === "unassigned"
          ? ""
          : (dropTime ?? (note.time || "09:00"));

      const { nextProjects, orderedIds } = recomputeDayOrder(projects, date, {
        moveNoteId: noteId,
        targetZone,
        overrideDuration,
        overrideTime,
      });
      setProjects(nextProjects);

      updateNoteAction(noteId, "duration", overrideDuration).catch(console.error);
      updateNoteAction(noteId, "time", overrideTime).catch(console.error);
      reorderTimelineNotesAction(date, orderedIds).catch(console.error);
    },
    [projects, recomputeDayOrder],
  );

  /** 同一 zone 内の並び替え。 */
  const reorderInZone = useCallback(
    (zone: "timeline" | "unassigned", activeNoteId: string, overNoteId: string) => {
      const allNotes = projects.flatMap((p) => p.notes.map((n) => ({ n, projectId: p.id })));
      const active = allNotes.find(({ n }) => n.id === activeNoteId);
      if (!active) return;
      const date = active.n.date;

      const { nextProjects, orderedIds } = recomputeDayOrder(projects, date, {
        sortableSwap: { activeId: activeNoteId, overId: overNoteId, zone },
      });
      setProjects(nextProjects);
      reorderTimelineNotesAction(date, orderedIds).catch(console.error);
    },
    [projects, recomputeDayOrder],
  );

  /** タイムラインのリサイズで time / duration を更新する。 */
  const updateNoteTimeAndDuration = useCallback(
    (noteId: string, projectId: string, time: string | null, duration: number) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                notes: p.notes.map((n) =>
                  n.id !== noteId
                    ? n
                    : {
                        ...n,
                        time: time ?? n.time,
                        duration,
                      },
                ),
              },
        ),
      );
      if (time !== null) updateNoteAction(noteId, "time", time).catch(console.error);
      updateNoteAction(noteId, "duration", duration).catch(console.error);
    },
    [],
  );

  const handleMyTaskDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as
        | { type?: string; todo?: CalendarTodo; noteId?: string; projectId?: string }
        | undefined;
      if (!data) return;
      if (data.type === "calendar-todo" && data.todo) {
        setCalendarActiveDrag(data.todo);
        return;
      }
      if ((data.type === "unassigned-task" || data.type === "timeline-task") && data.noteId && data.projectId) {
        const todo = calendarTodos.find(
          (t) => t.id === data.noteId && t.projectId === data.projectId,
        );
        if (todo) setCalendarActiveDrag(todo);
      }
    },
    [calendarTodos],
  );

  const handleMyTaskDragEnd = useCallback(
    (event: DragEndEvent) => {
      setCalendarActiveDrag(null);
      const { active, over } = event;
      if (!over) return;
      const a = active.data.current as
        | { type?: string; noteId?: string; projectId?: string; todo?: CalendarTodo }
        | undefined;
      const o = over.data.current as { type?: string; dateStr?: string } | undefined;
      if (!a) return;

      // (1) カレンダーチップ → 日付セル（既存）
      if (a.type === "calendar-todo" && o?.type === "calendar-day" && o.dateStr && a.todo) {
        if (a.todo.date !== o.dateStr) {
          moveTodoDate(a.todo.id, a.todo.projectId, o.dateStr);
        }
        return;
      }
      // (2) 未割当 → タイムライン
      if (
        a.type === "unassigned-task" &&
        (o?.type === "timeline-zone" || o?.type === "timeline-task") &&
        a.noteId &&
        a.projectId
      ) {
        // ドロップ位置の Y から時刻を計算（タイムラインゾーンの top を起点に分換算）
        let dropTime: string | undefined;
        const aRect = active.rect.current.translated;
        const oRect = over.rect;
        if (aRect && oRect) {
          const yInTimeline = aRect.top - oRect.top;
          const min = Math.round(yInTimeline / 15) * 15;
          const clamped = Math.max(0, Math.min(24 * 60 - 15, min));
          const h = Math.floor(clamped / 60);
          const m = clamped % 60;
          dropTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        moveBetweenZones(a.noteId, a.projectId, "timeline", dropTime);
        return;
      }
      // (3) タイムライン → 未割当
      if (a.type === "timeline-task" && o?.type === "unassigned-zone" && a.noteId && a.projectId) {
        moveBetweenZones(a.noteId, a.projectId, "unassigned");
        return;
      }
      // (4) タイムライン内並び替え
      if (a.type === "timeline-task" && o?.type === "timeline-task" && a.noteId) {
        const overId = String(over.id).replace(/^timeline-/, "");
        if (overId !== a.noteId) reorderInZone("timeline", a.noteId, overId);
        return;
      }
      // (5) 未割当内並び替え
      if (a.type === "unassigned-task" && o?.type === "unassigned-task" && a.noteId) {
        const overId = String(over.id).replace(/^unassigned-/, "");
        if (overId !== a.noteId) reorderInZone("unassigned", a.noteId, overId);
        return;
      }
    },
    [moveTodoDate, moveBetweenZones, reorderInZone],
  );

  const archiveProject = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archived: true } : p)));
    setSelectedProjectId((prev) => {
      if (prev !== id) return prev;
      const next = projects.find((p) => p.id !== id && p.id !== PERSONAL_PROJECT_ID && !p.archived);
      return next?.id ?? (projects.find((p) => p.id !== id && p.id !== PERSONAL_PROJECT_ID)?.id ?? "");
    });
    archiveProjectDbAction(id, true).catch(console.error);
  }, [projects]);

  const unarchiveProject = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archived: false } : p)));
    archiveProjectDbAction(id, false).catch(console.error);
  }, []);

  const archiveClient = useCallback((clientName: string) => {
    setArchivedClients((prev) => prev.includes(clientName) ? prev : [...prev, clientName]);
  }, []);

  const unarchiveClient = useCallback((clientName: string) => {
    setArchivedClients((prev) => prev.filter((c) => c !== clientName));
  }, []);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    updateProjectAction(id, "name", name).catch(console.error);
  }, []);

  const renameClient = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        clients: p.clients.map((c) => (c === oldName ? trimmed : c)),
      })),
    );
    setClientOrder((prev) => prev.map((c) => (c === oldName ? trimmed : c)));
    const affected = projects.filter((p) => p.clients.includes(oldName));
    for (const p of affected) {
      updateProjectClientsAction(p.id, p.clients.map((c) => (c === oldName ? trimmed : c))).catch(console.error);
    }
  }, [projects]);

  const deleteClient = useCallback((clientName: string) => {
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        clients: p.clients.filter((c) => c !== clientName),
      })),
    );
    setClientOrder((prev) => prev.filter((c) => c !== clientName));
    const affected = projects.filter((p) => p.clients.includes(clientName));
    for (const p of affected) {
      updateProjectClientsAction(p.id, p.clients.filter((c) => c !== clientName)).catch(console.error);
    }
  }, [projects]);

  const handleDeleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedProjectId((prev) => {
      if (prev !== id) return prev;
      const remaining = projects.filter((p) => p.id !== id && p.id !== PERSONAL_PROJECT_ID && !p.archived);
      return remaining[0]?.id ?? (projects.find((p) => p.id !== id && p.id !== PERSONAL_PROJECT_ID)?.id ?? "");
    });
    deleteProjectAction(id).catch(console.error);
  }, [projects]);

  // ===== マイルストーン操作 =====

  const addMilestone = useCallback(
    (id: string, label: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, milestones: [...p.milestones, { id, label, dueDate: null, description: "" }] }
            : p,
        ),
      );
      createMilestoneAction(selectedProjectId, id, label).catch(console.error);
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
      updateMilestoneAction(milestoneId, "label", label).catch(console.error);
    },
    [selectedProjectId],
  );

  const updateMilestoneDescription = useCallback(
    (milestoneId: string, description: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? {
                ...p,
                milestones: p.milestones.map((m) =>
                  m.id === milestoneId ? { ...m, description } : m,
                ),
              }
            : p,
        ),
      );
      updateMilestoneAction(milestoneId, "description", description).catch(console.error);
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
      updateMilestoneAction(milestoneId, "dueDate", date).catch(console.error);
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
      deleteMilestoneAction(milestoneId).catch(console.error);
    },
    [selectedProjectId],
  );

  // ===== アクション操作（Note.isAction === true のメモを操作） =====

  const toggleAction = useCallback(
    (noteId: string) => {
      const currentDone = projects.find(p => p.id === selectedProjectId)?.notes.find(n => n.id === noteId)?.done ?? false;
      const newDone = !currentDone;
      updateProjectNotes((notes) =>
        notes.map((n) => {
          if (n.id !== noteId) return n;
          return { ...n, done: newDone, status: newDone ? "解決済み" : "未解決" };
        }),
      );
      updateNoteAction(noteId, "done", newDone).catch(console.error);
      updateNoteAction(noteId, "status", newDone ? "解決済み" : "未解決").catch(console.error);
    },
    [updateProjectNotes, projects, selectedProjectId],
  );

  const addAction = useCallback(
    (phase: StatusKey, text: string) => {
      const id = nanoid();
      const date = "";
      const newNote: Note = {
        id,
        date,
        endDate: "",
        time: "",
        duration: 0,
        kind: "Todo" as NoteKind,
        status: "未解決" as NoteStatus,
        phase,
        priority: "normal",
        isAction: true,
        done: false,
        subtasks: [],
        title: text,
        text: "",
        assignee: "",
        createdBy: "",
        order: 0,
        googleEventId: null,
      };
      updateProjectNotes((notes) => [...notes, newNote]);
      createNoteAction(selectedProjectId, { id, date, kind: "Todo", status: "未解決", phase, isAction: true, title: text, text: "" }).catch(console.error);
    },
    [updateProjectNotes, selectedProjectId],
  );

  const deleteAction = useCallback(
    (noteId: string) => {
      updateProjectNotes((notes) => notes.filter((n) => n.id !== noteId));
      setSelectedNoteId((prev) => (prev === noteId ? null : prev));
      deleteNoteAction(noteId).catch(console.error);
    },
    [updateProjectNotes],
  );

  const updateAction = useCallback(
    (noteId: string, text: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, title: text } : n)),
      );
      updateNoteAction(noteId, "title", text).catch(console.error);
    },
    [updateProjectNotes],
  );

  const updateActionAssignee = useCallback(
    (noteId: string, assignee: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, assignee } : n)),
      );
      updateNoteAction(noteId, "assignee", assignee).catch(console.error);
    },
    [updateProjectNotes],
  );

  const inviteCollaborator = useCallback(
    async (email: string): Promise<InviteResult> => {
      const result = await inviteCollaboratorAction(selectedProjectId, email);
      if (result.ok) {
        if ("pending" in result && result.pending) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === selectedProjectId
                ? {
                    ...p,
                    pendingInvites: [
                      ...(p.pendingInvites ?? []),
                      { id: `pending-${Date.now()}`, email: result.email },
                    ],
                  }
                : p,
            ),
          );
        } else if ("member" in result) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === selectedProjectId
                ? { ...p, projectMembers: [...(p.projectMembers ?? []), result.member] }
                : p,
            ),
          );
        }
      }
      return result;
    },
    [selectedProjectId],
  );

  const removeCollaborator = useCallback(
    (userId: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, projectMembers: (p.projectMembers ?? []).filter((m) => m.userId !== userId) }
            : p,
        ),
      );
      removeCollaboratorAction(selectedProjectId, userId).catch(console.error);
    },
    [selectedProjectId],
  );

  const removePendingInvite = useCallback(
    (email: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, pendingInvites: (p.pendingInvites ?? []).filter((inv) => inv.email !== email) }
            : p,
        ),
      );
      removePendingInviteAction(selectedProjectId, email).catch(console.error);
    },
    [selectedProjectId],
  );

  const pastMemberOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { label: string; email: string }[] = [];
    for (const p of projects) {
      for (const m of p.projectMembers ?? []) {
        if (m.email && !seen.has(m.email)) {
          seen.add(m.email);
          options.push({ label: m.name ?? m.email, email: m.email });
        }
      }
    }
    return options;
  }, [projects]);

  const addSubtask = useCallback(
    (noteId: string, text: string) => {
      const subId = nanoid();
      const newSub = { id: subId, text, done: false };
      updateProjectNotes((notes) =>
        notes.map((n) =>
          n.id === noteId
            ? { ...n, subtasks: [...(n.subtasks ?? []), newSub] }
            : n,
        ),
      );
      createSubtaskAction(noteId, text, subId).catch(console.error);
    },
    [updateProjectNotes],
  );

  const toggleSubtask = useCallback(
    (noteId: string, subtaskId: string) => {
      const currentDone = projects
        .find(p => p.id === selectedProjectId)
        ?.notes.find(n => n.id === noteId)
        ?.subtasks?.find(s => s.id === subtaskId)
        ?.done ?? false;
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
      updateSubtaskAction(subtaskId, "done", !currentDone).catch(console.error);
    },
    [updateProjectNotes, projects, selectedProjectId],
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
      deleteSubtaskAction(subtaskId).catch(console.error);
    },
    [updateProjectNotes],
  );

  const moveActionToMilestone = useCallback(
    (noteId: string, targetMilestoneId: string) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, phase: targetMilestoneId } : n)),
      );
      updateNoteAction(noteId, "phase", targetMilestoneId).catch(console.error);
    },
    [updateProjectNotes],
  );

  const addNoteFolder = useCallback(
    (label: string) => {
      const id = nanoid();
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProjectId) return p;
          return {
            ...p,
            noteFolders: [
              ...(p.noteFolders ?? []),
              { id, label, sort: "date-desc" as const, filterKind: null, filterStatus: null },
            ],
          };
        }),
      );
      createNoteFolderAction(selectedProjectId, label, id).catch(console.error);
    },
    [selectedProjectId],
  );

  const updateNoteFolder = useCallback(
    (folderId: string, updates: Partial<NoteFolder>) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? {
                ...p,
                noteFolders: (p.noteFolders ?? []).map((f) =>
                  f.id === folderId ? { ...f, ...updates } : f,
                ),
              }
            : p,
        ),
      );
      updateNoteFolderAction(folderId, updates).catch(console.error);
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
      reorderMilestonesAction(selectedProjectId, orderedIds).catch(console.error);
    },
    [selectedProjectId],
  );

  const reorderActions = useCallback(
    (phase: StatusKey, orderedIds: string[]) => {
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
      reorderNotesAction(selectedProjectId, phase, orderedIds).catch(console.error);
    },
    [updateProjectNotes, selectedProjectId],
  );

  // ===== メモ操作 =====

  const selectNote = useCallback((id: string) => {
    setSelectedNoteId(id);
    setSelectedMilestoneId(null);
    setSelectedFolderId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const selectMilestone = useCallback((id: string) => {
    setSelectedMilestoneId(id);
    setSelectedNoteId(null);
    setSelectedFolderId(null);
    setPane4ManuallyClosed(false);
  }, []);

  const selectFolder = useCallback((id: string | null) => {
    setSelectedFolderId(id);
    if (id !== null) {
      setSelectedNoteId(null);
      setSelectedMilestoneId(null);
      setPane4ManuallyClosed(false);
    }
  }, []);

  const addNote = useCallback(
    (phase: StatusKey | null = null, defaults?: { kind?: NoteKind; status?: NoteStatus }) => {
      const id = nanoid();
      const date = "";
      const kind = defaults?.kind ?? "アイデア";
      const status = defaults?.status ?? "未解決";
      const newNote: Note = {
        id,
        date,
        endDate: "",
        time: "",
        duration: 0,
        kind,
        status,
        phase,
        priority: "normal",
        isAction: false,
        done: false,
        subtasks: [],
        title: "",
        text: "",
        assignee: "",
        createdBy: "",
        order: 0,
        googleEventId: null,
      };
      updateProjectNotes((notes) => [...notes, newNote]);
      setSelectedNoteId(id);
      setPane4ManuallyClosed(false);
      createNoteAction(selectedProjectId, { id, date, kind, status, phase, title: "", text: "" }).catch(console.error);
    },
    [updateProjectNotes, selectedProjectId],
  );

  const updateNote = useCallback(
    (noteId: string, field: keyof Note, value: string | number) => {
      updateProjectNotes((notes) =>
        notes.map((n) => {
          if (n.id !== noteId) return n;
          const updated: Note = { ...n, [field]: value };
          // duration を 0 にしたら time も "" にする（タイムラインから外す = 未割当へ）
          if (field === "duration" && value === 0) updated.time = "";
          return updated;
        }),
      );
      updateNoteAction(noteId, field, value).catch(console.error);
      if (field === "duration" && value === 0) {
        updateNoteAction(noteId, "time", "").catch(console.error);
      }
    },
    [updateProjectNotes],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      updateProjectNotes((notes) => notes.filter((n) => n.id !== noteId));
      setSelectedNoteId(null);
      setPane4ManuallyClosed(false);
      deleteNoteAction(noteId).catch(console.error);
    },
    [updateProjectNotes],
  );

  const setNotePhase = useCallback(
    (noteId: string, phase: StatusKey | null) => {
      updateProjectNotes((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, phase } : n)),
      );
      updateNoteAction(noteId, "phase", phase).catch(console.error);
    },
    [updateProjectNotes],
  );

  /** メモをアクションに昇格（isAction: true にするだけ。メモは消えない）。 */
  const promoteNoteToAction = useCallback(
    (noteId: string, phase: StatusKey) => {
      updateProjectNotes((notes) => {
        const noteIdx = notes.findIndex((n) => n.id === noteId);
        if (noteIdx === -1) return notes;
        const promoted = { ...notes[noteIdx], isAction: true, phase, done: false };
        const without = notes.filter((n) => n.id !== noteId);
        // 対象マイルストーンのアクション末尾に挿入
        let insertAt = without.length;
        for (let i = without.length - 1; i >= 0; i--) {
          if (without[i].isAction && without[i].phase === phase) {
            insertAt = i + 1;
            break;
          }
        }
        return [...without.slice(0, insertAt), promoted, ...without.slice(insertAt)];
      });
      updateNoteAction(noteId, "isAction", true).catch(console.error);
      updateNoteAction(noteId, "phase", phase).catch(console.error);
    },
    [updateProjectNotes],
  );

  const toggleNoteStatus = useCallback(
    (noteId: string) => {
      const cycle = { 未解決: "対応中", 対応中: "解決済み", 解決済み: "未解決" } as const;
      const currentNote = projects.find(p => p.id === selectedProjectId)?.notes.find(n => n.id === noteId);
      updateProjectNotes((notes) =>
        notes.map((n) => {
          if (n.id !== noteId) return n;
          if (n.isAction) {
            const newDone = !n.done;
            return { ...n, done: newDone, status: newDone ? "解決済み" : "未解決" };
          }
          return { ...n, status: cycle[n.status] };
        }),
      );
      if (currentNote) {
        if (currentNote.isAction) {
          const newDone = !currentNote.done;
          updateNoteAction(noteId, "done", newDone).catch(console.error);
          updateNoteAction(noteId, "status", newDone ? "解決済み" : "未解決").catch(console.error);
        } else {
          const newStatus = cycle[currentNote.status];
          updateNoteAction(noteId, "status", newStatus).catch(console.error);
        }
      }
    },
    [updateProjectNotes, projects, selectedProjectId],
  );

  const togglePane4 = useCallback(() => setPane4ManuallyClosed((v) => !v), []);

  const handleWorkspaceDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; label?: string } | undefined;
    setActiveDrag({
      id: event.active.id as string,
      type: data?.type ?? "unknown",
      label: data?.label ?? "",
    });
  }, []);

  const handleWorkspaceDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const project = projects.find((p) => p.id === selectedProjectId);
      if (!project) return;

      const activeType = (active.data.current as { type?: string } | undefined)?.type;
      const overData = over.data.current as { type?: string; milestoneId?: string } | undefined;

      if (activeType === "milestone") {
        if (overData?.type !== "milestone") return;
        const ids = project.milestones.map((m) => m.id);
        const oldIdx = ids.indexOf(active.id as string);
        const newIdx = ids.indexOf(over.id as string);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderMilestones(arrayMove(ids, oldIdx, newIdx));
        }
        return;
      }

      if (activeType === "action") {
        const fromMilestoneId = (active.data.current as { milestoneId?: string } | undefined)?.milestoneId;
        let toMilestoneId: string | null = null;
        if (overData?.type === "action" || overData?.type === "milestone-zone") {
          toMilestoneId = overData.milestoneId ?? null;
        } else if (overData?.type === "milestone") {
          toMilestoneId = over.id as string;
        }
        if (!toMilestoneId || !fromMilestoneId) return;

        if (fromMilestoneId === toMilestoneId) {
          const actions = project.notes.filter((n) => n.isAction && n.phase === fromMilestoneId);
          const ids = actions.map((a) => a.id);
          const oldIdx = ids.indexOf(active.id as string);
          const newIdx = ids.indexOf(over.id as string);
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            reorderActions(fromMilestoneId, arrayMove(ids, oldIdx, newIdx));
          }
        } else {
          moveActionToMilestone(active.id as string, toMilestoneId);
        }
        return;
      }

      if (activeType === "note") {
        const noteData = active.data.current as { noteId?: string; isAction?: boolean } | undefined;
        const noteId = noteData?.noteId ?? (active.id as string);
        const isActionNote = noteData?.isAction ?? false;

        let toMilestoneId: string | null = null;
        if (overData?.type === "action" || overData?.type === "milestone-zone") {
          toMilestoneId = overData.milestoneId ?? null;
        } else if (overData?.type === "milestone") {
          toMilestoneId = over.id as string;
        }
        if (toMilestoneId && project.milestones.some((m) => m.id === toMilestoneId)) {
          if (isActionNote) {
            moveActionToMilestone(noteId, toMilestoneId);
          } else {
            promoteNoteToAction(noteId, toMilestoneId);
          }
        }
      }
    },
    [projects, selectedProjectId, reorderMilestones, reorderActions, moveActionToMilestone, promoteNoteToAction],
  );

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen w-full overflow-hidden bg-background text-foreground"
    >
      <ProjectListPane
        workspaceName={workspace.name}
        projects={projects}
        selectedProjectId={selectedProjectId}
        isPersonalSelected={selectedView === "personal"}
        onSelectProject={selectProject}
        onSelectPersonal={selectPersonalDashboard}
        onAddProject={addProject}
        clientOrder={clientOrder}
        onReorderClients={updateClientOrder}
        onAddClientToProject={addClientToProject}
        archivedClients={archivedClients}
        onArchiveProject={archiveProject}
        onUnarchiveProject={unarchiveProject}
        onArchiveClient={archiveClient}
        onUnarchiveClient={unarchiveClient}
        onRenameProject={renameProject}
        onDeleteProject={handleDeleteProject}
        onRenameClient={renameClient}
        onDeleteClient={deleteClient}
        myProjectOrder={myProjectOrder}
        onReorderMyProjects={updateMyProjectOrder}
      />

      <SidebarInset className="flex min-w-0 flex-col bg-background">
        <GlobalHeader
          workspaceName={workspace.name}
          selectedProjectName={
            selectedView === "personal" || mobileTab === "personal"
              ? "マイタスク"
              : (mobileDetailProject?.name || activeProject?.name || "無題のプロジェクト")
          }
          projects={projects}
          onSelectProject={selectProject}
          onSelectNote={navigateToNote}
          user={user}
          onSignOut={onSignOut}
        />

        {/* ─── デスクトップレイアウト (lg+) ─── */}
        <div className="hidden lg:flex min-h-0 flex-1">
          {selectedView === "personal" ? (
            <>
              {personalTab === "summary" ? (
                <ProjectSummaryPane
                  projects={projects}
                  activeTab={personalTab}
                  onTabChange={setPersonalTab}
                  onSelectProject={selectProject}
                />
              ) : (
                <DndContext
                  sensors={calendarSensors}
                  collisionDetection={pointerWithin}
                  onDragStart={handleMyTaskDragStart}
                  onDragEnd={handleMyTaskDragEnd}
                >
                  {/* Pane 2: 月カレンダー */}
                  <CalendarPane
                    todos={calendarTodos}
                    selectedDate={selectedCalendarDate}
                    onSelectDate={(date) => {
                      setSelectedCalendarDate(date);
                      setSelectedNoteId(null);
                      setSelectedNoteProjectId(null);
                    }}
                    activeTab={personalTab}
                    onTabChange={setPersonalTab}
                    googleEvents={googleCalendarEvents}
                  />

                  {/* Pane 3: 未割当タスク（duration === 0） */}
                  <UnassignedTaskPane
                    date={selectedCalendarDate}
                    todos={dayUnassignedTodos}
                    selectedNoteId={selectedNoteId}
                    onSelectNote={selectCalendarNote}
                    onToggle={toggleCalendarTodo}
                    onAddPersonalTodo={addPersonalTodo}
                  />

                  {/* Pane 4: タイムライン（duration > 0） */}
                  <DayTimelinePane
                    date={selectedCalendarDate}
                    todos={dayTimelineTodos}
                    selectedNoteId={selectedNoteId}
                    workStartTime={workStartTime}
                    onWorkStartTimeChange={handleWorkStartTimeChange}
                    onSelectNote={selectCalendarNote}
                    onToggle={toggleCalendarTodo}
                    onResize={updateNoteTimeAndDuration}
                    onMoveToUnassigned={(noteId, projectId) =>
                      moveBetweenZones(noteId, projectId, "unassigned")
                    }
                  />

                  <DragOverlay dropAnimation={null}>
                    {calendarActiveDrag ? (
                      <div className="max-w-48 truncate rounded-md border border-primary/30 bg-card px-2.5 py-1.5 text-xs shadow-xl ring-2 ring-primary/20">
                        {calendarActiveDrag.title || calendarActiveDrag.text || "(無題)"}
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}

              {/* Pane 4: Todo 詳細（NoteDetailPane を流用） — カレンダータブのみ */}
              {personalTab === "calendar" && personalPane4Open && personalActiveNote && personalActiveProject && (
                <NoteDetailPane
                  key={personalActiveNote.id}
                  note={personalActiveNote}
                  milestones={personalActiveProject.milestones}
                  noteFolders={personalActiveProject.noteFolders ?? []}
                  pane4Open={personalPane4Open}
                  onTogglePane4={togglePane4}
                  onUpdateNote={(field, value) => {
                    setProjects(prev => prev.map(p => {
                      if (p.id !== selectedNoteProjectId) return p;
                      return { ...p, notes: p.notes.map(n => n.id === personalActiveNote.id ? { ...n, [field]: value } : n) };
                    }));
                    updateNoteAction(personalActiveNote.id, field, value).catch(console.error);
                  }}
                  currentUserName={user?.name ?? "自分"}
                  onSetNotePhase={() => {}}
                  onDeleteNote={() => {
                    setProjects(prev => prev.map(p => {
                      if (p.id !== selectedNoteProjectId) return p;
                      return { ...p, notes: p.notes.filter(n => n.id !== personalActiveNote.id) };
                    }));
                    deleteNoteAction(personalActiveNote.id).catch(console.error);
                    setSelectedNoteId(null);
                    setSelectedNoteProjectId(null);
                  }}
                  onMoveToPhase={() => {}}
                />
              )}
            </>
          ) : activeProject ? (
            <DndContext
              sensors={sensors}
              collisionDetection={workspaceCollisionDetection}
              onDragStart={handleWorkspaceDragStart}
              onDragEnd={handleWorkspaceDragEnd}
            >
              {/* Pane 2: 案件詳細 + マイルストーン + アクションプラン */}
              <ProjectDetailPane
                key={selectedProjectId}
                project={activeProject}
                allClientOptions={allActiveClientOptions}
                allArchivedClientOptions={allArchivedClientOptions}
                currentUserName={user?.name ?? "自分"}
                currentUserImage={user?.image ?? null}
                selectedMilestoneId={selectedMilestoneId}
                onSelectMilestone={selectMilestone}
                onUpdateProjectName={updateProjectName}
                onUpdateProjectDescription={updateProjectDescription}
                onUpdateProjectStatus={updateProjectStatus}
                onUpdateClients={updateClients}
                onInviteCollaborator={inviteCollaborator}
                onRemoveCollaborator={removeCollaborator}
                onRemovePendingInvite={removePendingInvite}
                pastMemberOptions={pastMemberOptions}
                onSelectNote={selectNote}
                onAddMilestone={addMilestone}
                onUpdateMilestone={updateMilestone}
                onDeleteMilestone={deleteMilestone}
                onToggleAction={toggleAction}
                onAddAction={addAction}
                onDeleteAction={deleteAction}
                onUpdateAction={updateAction}
                onUpdateActionAssignee={updateActionAssignee}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
              />

              {/* Pane 3: フリーメモ一覧 */}
              <NoteListPane
                notes={activeProject.notes}
                milestones={activeProject.milestones}
                noteFolders={activeProject.noteFolders ?? []}
                selectedNoteId={selectedNoteId}
                currentUserName={user?.name ?? "自分"}
                isShared={(activeProject.projectMembers?.length ?? 0) > 0}
                onSelectNote={selectNote}
                onAddNote={addNote}
                onToggleNoteStatus={toggleNoteStatus}
                onUpdateNoteTitle={(id, title) => updateNote(id, "title", title)}
                onUpdateNotePriority={(id, priority) => updateNote(id, "priority", priority)}
                onPromoteToAction={promoteNoteToAction}
                onDeleteNote={deleteNote}
                onAddNoteFolder={addNoteFolder}
                onSelectFolder={selectFolder}
              />

              {/* Pane 4: メモフォルダ詳細・マイルストーン詳細・メモ詳細 */}
              {pane4Open && (activeFolder ? (
                  <NoteFolderDetailPane
                    key={activeFolder.id}
                    folder={activeFolder}
                    noteCount={activeProject.notes.filter((n) => n.phase === activeFolder.id).length}
                    pane4Open={pane4Open}
                    onTogglePane4={togglePane4}
                    onUpdateFolder={(updates) => updateNoteFolder(activeFolder.id, updates)}
                  />
                ) : activeMilestone ? (
                  <MilestoneDetailPane
                    key={activeMilestone.id}
                    milestone={activeMilestone}
                    actions={activeMilestoneActions}
                    pane4Open={pane4Open}
                    onTogglePane4={togglePane4}
                    onUpdateLabel={(label) => updateMilestone(activeMilestone.id, label)}
                    onUpdateDueDate={(date) => updateMilestoneDate(activeMilestone.id, date)}
                    onUpdateDescription={(description) => updateMilestoneDescription(activeMilestone.id, description)}
                  />
                ) : activeNote ? (
                  <NoteDetailPane
                    key={activeNote.id}
                    note={activeNote}
                    milestones={activeProject.milestones}
                    noteFolders={activeProject.noteFolders ?? []}
                    pane4Open={pane4Open}
                    currentUserName={user?.name ?? "自分"}
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

              {/* style で width/height を auto にして setNodeRef 要素サイズに左右されないようにする */}
              <DragOverlay dropAnimation={null} style={{ width: "auto", height: "auto" }}>
                {activeDrag ? (
                  <div className="flex w-max max-w-56 items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 text-sm shadow-xl ring-2 ring-primary/20 rotate-1 opacity-95">
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="max-w-40 truncate">
                      {activeDrag.label || (
                        activeDrag.type === "note" ? "メモ"
                        : activeDrag.type === "action" ? "タスク"
                        : "マイルストーン"
                      )}
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              左の一覧からプロジェクトを選択してください
            </div>
          )}
        </div>
        {/* ─── モバイルレイアウト (lg 未満) ─── */}
        <div className="flex lg:hidden min-h-0 flex-1 flex-col">
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* マイタスクタブ: サマリー */}
            {mobileTab === "personal" && personalTab === "summary" && (
              <ProjectSummaryPane
                projects={projects}
                activeTab={personalTab}
                onTabChange={setPersonalTab}
                onSelectProject={selectProject}
              />
            )}

            {/* マイタスクタブ: カレンダー + 未割当/タイムライン subtab */}
            {mobileTab === "personal" && personalTab === "calendar" && (
              <DndContext
                sensors={calendarSensors}
                collisionDetection={pointerWithin}
                onDragStart={handleMyTaskDragStart}
                onDragEnd={handleMyTaskDragEnd}
              >
                <div className="flex h-full flex-col">
                  <div className="basis-[432px] shrink-0 flex flex-col">
                    <CalendarPane
                      todos={calendarTodos}
                      selectedDate={selectedCalendarDate}
                      onSelectDate={(date) => {
                        setSelectedCalendarDate(date);
                        setSelectedNoteId(null);
                        setSelectedNoteProjectId(null);
                      }}
                      activeTab={personalTab}
                      onTabChange={setPersonalTab}
                      googleEvents={googleCalendarEvents}
                    />
                  </div>

                  {/* 未割当 / タイムライン subtab */}
                  <div className="flex shrink-0 border-b border-border">
                    {(["unassigned", "timeline"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setMobilePersonalSubTab(tab)}
                        className={
                          "flex-1 py-2 text-xs font-medium transition-colors " +
                          (mobilePersonalSubTab === tab
                            ? "border-b-2 border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {tab === "unassigned" ? "未割当" : "タイムライン"}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col flex-1 min-h-0">
                    {mobilePersonalSubTab === "unassigned" ? (
                      <UnassignedTaskPane
                        date={selectedCalendarDate}
                        todos={dayUnassignedTodos}
                        selectedNoteId={selectedNoteId}
                        onSelectNote={selectCalendarNote}
                        onToggle={toggleCalendarTodo}
                        onAddPersonalTodo={addPersonalTodo}
                      />
                    ) : (
                      <DayTimelinePane
                        date={selectedCalendarDate}
                        todos={dayTimelineTodos}
                        selectedNoteId={selectedNoteId}
                        workStartTime={workStartTime}
                        onWorkStartTimeChange={handleWorkStartTimeChange}
                        onSelectNote={selectCalendarNote}
                        onToggle={toggleCalendarTodo}
                        onResize={updateNoteTimeAndDuration}
                        onMoveToUnassigned={(noteId, projectId) =>
                          moveBetweenZones(noteId, projectId, "unassigned")
                        }
                      />
                    )}
                  </div>
                </div>
                <DragOverlay dropAnimation={null}>
                  {calendarActiveDrag ? (
                    <div className="max-w-48 truncate rounded-md border border-primary/30 bg-card px-2.5 py-1.5 text-xs shadow-xl ring-2 ring-primary/20">
                      {calendarActiveDrag.title || calendarActiveDrag.text || "(無題)"}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            {/* 案件タブ: サマリー一覧 */}
            {mobileTab === "projects" && mobileDetailProjectId === null && (
              <ProjectSummaryPane
                projects={projects}
                activeTab="summary"
                onTabChange={() => {}}
                onSelectProject={(id) => {
                  setMobileDetailProjectId(id);
                  setSelectedProjectId(id);
                  setMobileProjectSubTab("actions");
                  setMobileNoteView(false);
                }}
              />
            )}

            {/* 案件タブ: プロジェクト詳細 */}
            {mobileTab === "projects" && mobileDetailProjectId !== null && mobileDetailProject && (
              <DndContext
                sensors={sensors}
                collisionDetection={workspaceCollisionDetection}
                onDragStart={handleWorkspaceDragStart}
                onDragEnd={handleWorkspaceDragEnd}
              >
                <div className="flex h-full flex-col">
                  {/* 戻るヘッダー */}
                  <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                    <button
                      type="button"
                      onClick={() => setMobileDetailProjectId(null)}
                      className="flex items-center gap-0.5 text-sm text-primary"
                    >
                      <ChevronLeft className="size-4" />
                      プロジェクト一覧
                    </button>
                    <span className="ml-2 min-w-0 flex-1 truncate text-sm font-medium">
                      {mobileDetailProject.name || "無題のプロジェクト"}
                    </span>
                  </div>

                  {/* サブタブ: アクション / メモ */}
                  <div className="flex shrink-0 border-b border-border">
                    {(["actions", "notes"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setMobileProjectSubTab(tab);
                          setMobileNoteView(false);
                          setSelectedNoteId(null);
                        }}
                        className={cn(
                          "flex-1 py-2.5 text-sm font-medium transition-colors",
                          mobileProjectSubTab === tab
                            ? "border-b-2 border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tab === "actions" ? "アクション" : "メモ"}
                      </button>
                    ))}
                  </div>

                  {/* コンテンツ */}
                  <div className="flex flex-col flex-1 min-h-0">
                    {mobileProjectSubTab === "actions" && (
                      <ProjectDetailPane
                        key={mobileDetailProjectId}
                        project={mobileDetailProject}
                        allClientOptions={allActiveClientOptions}
                        allArchivedClientOptions={allArchivedClientOptions}
                        currentUserName={user?.name ?? "自分"}
                        selectedMilestoneId={selectedMilestoneId}
                        onSelectMilestone={selectMilestone}
                        onUpdateProjectName={updateProjectName}
                        onUpdateProjectDescription={updateProjectDescription}
                        onUpdateProjectStatus={updateProjectStatus}
                        onUpdateClients={updateClients}
                        onInviteCollaborator={inviteCollaborator}
                        onRemoveCollaborator={removeCollaborator}
                        onRemovePendingInvite={removePendingInvite}
                        pastMemberOptions={pastMemberOptions}
                        onSelectNote={selectNote}
                        onAddMilestone={addMilestone}
                        onUpdateMilestone={updateMilestone}
                        onDeleteMilestone={deleteMilestone}
                        onToggleAction={toggleAction}
                        onAddAction={addAction}
                        onDeleteAction={deleteAction}
                        onUpdateAction={updateAction}
                        onUpdateActionAssignee={updateActionAssignee}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        onDeleteSubtask={deleteSubtask}
                      />
                    )}
                    {mobileProjectSubTab === "notes" && !mobileNoteView && (
                      <NoteListPane
                        notes={mobileDetailProject.notes}
                        milestones={mobileDetailProject.milestones}
                        noteFolders={mobileDetailProject.noteFolders ?? []}
                        selectedNoteId={selectedNoteId}
                        currentUserName={user?.name ?? "自分"}
                        isShared={(mobileDetailProject.projectMembers?.length ?? 0) > 0}
                        onSelectNote={(id) => { selectNote(id); setMobileNoteView(true); }}
                        onAddNote={addNote}
                        onToggleNoteStatus={toggleNoteStatus}
                        onUpdateNoteTitle={(id, title) => updateNote(id, "title", title)}
                        onUpdateNotePriority={(id, priority) => updateNote(id, "priority", priority)}
                        onPromoteToAction={promoteNoteToAction}
                        onDeleteNote={deleteNote}
                        onAddNoteFolder={addNoteFolder}
                        onSelectFolder={selectFolder}
                      />
                    )}
                    {mobileProjectSubTab === "notes" && mobileNoteView && activeNote && (
                      <div className="flex h-full flex-col">
                        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                          <button
                            type="button"
                            onClick={() => { setMobileNoteView(false); setSelectedNoteId(null); }}
                            className="flex items-center gap-0.5 text-sm text-primary"
                          >
                            <ChevronLeft className="size-4" />
                            メモ一覧
                          </button>
                        </div>
                        <div className="flex flex-col flex-1 min-h-0">
                          <NoteDetailPane
                            key={activeNote.id}
                            note={activeNote}
                            milestones={mobileDetailProject.milestones}
                            noteFolders={mobileDetailProject.noteFolders ?? []}
                            pane4Open={true}
                            currentUserName={user?.name ?? "自分"}
                            onTogglePane4={() => { setMobileNoteView(false); setSelectedNoteId(null); }}
                            onUpdateNote={(field, value) => updateNote(activeNote.id, field, value)}
                            onSetNotePhase={(phase) => setNotePhase(activeNote.id, phase)}
                            onDeleteNote={() => { deleteNote(activeNote.id); setMobileNoteView(false); }}
                            onMoveToPhase={(phase) => promoteNoteToAction(activeNote.id, phase)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <DragOverlay dropAnimation={null} style={{ width: "auto", height: "auto" }}>
                  {activeDrag ? (
                    <div className="flex w-max max-w-56 items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 text-sm shadow-xl ring-2 ring-primary/20 rotate-1 opacity-95">
                      <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="max-w-40 truncate">
                        {activeDrag.label || (
                          activeDrag.type === "note" ? "メモ"
                          : activeDrag.type === "action" ? "タスク"
                          : "マイルストーン"
                        )}
                      </span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>

          {/* ボトムタブバー */}
          <nav className="flex h-16 shrink-0 border-t border-border bg-background">
            <button
              type="button"
              onClick={() => setMobileTab("personal")}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                mobileTab === "personal" ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="size-5" />
              マイタスク
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileTab("projects");
                setMobileDetailProjectId(null);
                setMobileNoteView(false);
              }}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                mobileTab === "projects" ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Briefcase className="size-5" />
              プロジェクト
            </button>
          </nav>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
