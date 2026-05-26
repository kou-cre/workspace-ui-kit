"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "@/lib/google-calendar";

type NoteInput = {
  id: string;
  date: string;
  endDate?: string;
  time?: string;
  duration?: number;
  kind: string;
  status: string;
  phase?: string | null;
  priority?: string;
  isAction?: boolean;
  done?: boolean;
  title?: string;
  text: string;
  assignee?: string;
  createdBy?: string;
};

export async function createNote(projectId: string, note: NoteInput) {
  const maxOrder = await db.note.aggregate({
    _max: { order: true },
    where: { projectId },
  });
  await db.note.create({
    data: {
      id: note.id,
      date: note.date,
      endDate: note.endDate ?? "",
      time: note.time ?? "",
      duration: note.duration ?? 0,
      kind: note.kind,
      status: note.status,
      phase: note.phase ?? null,
      priority: note.priority ?? "normal",
      isAction: note.isAction ?? false,
      done: note.done ?? false,
      title: note.title ?? "",
      text: note.text,
      assignee: note.assignee ?? "",
      createdBy: note.createdBy ?? "",
      order: (maxOrder._max.order ?? -1) + 1,
      projectId,
    },
  });

  if (note.isAction && note.date) {
    const session = await auth();
    if (session?.user?.id) {
      const googleEventId = await createGoogleCalendarEvent(
        session.user.id,
        note.title ?? "",
        note.date,
        note.text || undefined,
      );
      if (googleEventId) {
        await db.note.update({ where: { id: note.id }, data: { googleEventId } });
      }
    }
  }

  revalidatePath("/");
}

export async function updateNote(
  id: string,
  field: string,
  value: string | number | boolean | null,
) {
  await db.note.update({ where: { id }, data: { [field]: value } });

  if (field === "title" || field === "date" || field === "text") {
    const note = await db.note.findUnique({ where: { id } });
    if (note?.isAction) {
      const session = await auth();
      if (session?.user?.id) {
        const title = field === "title" ? String(value ?? "") : note.title;
        const date = field === "date" ? String(value ?? "") : note.date;
        const text = field === "text" ? String(value ?? "") : note.text;

        if (note.googleEventId) {
          if (date) {
            await updateGoogleCalendarEvent(session.user.id, note.googleEventId, title, date, text || undefined);
          } else {
            await deleteGoogleCalendarEvent(session.user.id, note.googleEventId);
            await db.note.update({ where: { id }, data: { googleEventId: null } });
          }
        } else if (date) {
          const googleEventId = await createGoogleCalendarEvent(session.user.id, title, date, text || undefined);
          if (googleEventId) {
            await db.note.update({ where: { id }, data: { googleEventId } });
          }
        }
      }
    }
  }

  revalidatePath("/");
}

export async function deleteNote(id: string) {
  const note = await db.note.findUnique({ where: { id } });
  if (note?.googleEventId) {
    const session = await auth();
    if (session?.user?.id) {
      await deleteGoogleCalendarEvent(session.user.id, note.googleEventId);
    }
  }
  await db.note.delete({ where: { id } });
  revalidatePath("/");
}

export async function reorderNotes(projectId: string, phase: string | null, orderedIds: string[]) {
  await db.$transaction(
    orderedIds.map((id, i) =>
      db.note.update({ where: { id }, data: { order: i } }),
    ),
  );
  revalidatePath("/");
}

/**
 * 日付スコープでタスクの並びを更新する。複数プロジェクトを横断するマイタスクのタイムライン用。
 * - 各 id の order を 0..N で書き換える
 * - 別日付のタスクをドラッグしてきた場合に対応するため、date も更新する
 */
export async function reorderTimelineNotes(date: string, orderedIds: string[]) {
  await db.$transaction(
    orderedIds.map((id, i) =>
      db.note.update({ where: { id }, data: { order: i, date } }),
    ),
  );
  revalidatePath("/");
}

export async function createSubtask(noteId: string, text: string, preId?: string) {
  const id = preId ?? nanoid();
  const maxOrder = await db.subtask.aggregate({
    _max: { order: true },
    where: { noteId },
  });
  await db.subtask.create({
    data: {
      id,
      text,
      done: false,
      order: (maxOrder._max.order ?? -1) + 1,
      noteId,
    },
  });
  revalidatePath("/");
  return id;
}

export async function updateSubtask(
  id: string,
  field: "text" | "done",
  value: string | boolean,
) {
  await db.subtask.update({ where: { id }, data: { [field]: value } });
  revalidatePath("/");
}

export async function deleteSubtask(id: string) {
  await db.subtask.delete({ where: { id } });
  revalidatePath("/");
}
