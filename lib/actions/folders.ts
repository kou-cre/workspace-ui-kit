"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";

export async function createNoteFolder(projectId: string, label: string, preId?: string) {
  const id = preId ?? nanoid();
  const maxOrder = await db.noteFolder.aggregate({
    _max: { order: true },
    where: { projectId },
  });
  await db.noteFolder.create({
    data: {
      id,
      label,
      sort: "date-desc",
      filterKind: null,
      filterStatus: null,
      order: (maxOrder._max.order ?? -1) + 1,
      projectId,
    },
  });
  revalidatePath("/");
  return id;
}

export async function updateNoteFolder(
  id: string,
  updates: {
    label?: string;
    sort?: string;
    filterKind?: string | null;
    filterStatus?: string | null;
  },
) {
  await db.noteFolder.update({ where: { id }, data: updates });
  revalidatePath("/");
}

export async function deleteNoteFolder(id: string) {
  await db.$transaction(async (tx) => {
    await tx.note.updateMany({ where: { phase: id }, data: { phase: null } });
    await tx.noteFolder.delete({ where: { id } });
  });
  revalidatePath("/");
}
