"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function createMilestone(projectId: string, id: string, label: string) {
  const maxOrder = await db.milestone.aggregate({
    _max: { order: true },
    where: { projectId },
  });
  await db.milestone.create({
    data: {
      id,
      label,
      dueDate: null,
      description: "",
      order: (maxOrder._max.order ?? -1) + 1,
      projectId,
    },
  });
  revalidatePath("/");
}

export async function updateMilestone(
  id: string,
  field: "label" | "dueDate" | "description",
  value: string | null,
) {
  await db.milestone.update({ where: { id }, data: { [field]: value } });
  revalidatePath("/");
}

export async function deleteMilestone(id: string) {
  await db.$transaction(async (tx) => {
    await tx.note.updateMany({ where: { phase: id }, data: { phase: null } });
    await tx.milestone.delete({ where: { id } });
  });
  revalidatePath("/");
}

export async function reorderMilestones(projectId: string, orderedIds: string[]) {
  await db.$transaction(
    orderedIds.map((id, i) =>
      db.milestone.update({ where: { id }, data: { order: i } }),
    ),
  );
  revalidatePath("/");
}
