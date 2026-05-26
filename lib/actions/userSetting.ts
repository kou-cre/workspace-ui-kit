"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { DEFAULT_WORK_START_TIME, type UserSetting } from "@/lib/schema";

export async function getUserSetting(): Promise<UserSetting> {
  const session = await auth();
  if (!session?.user?.id) {
    return { workStartTime: DEFAULT_WORK_START_TIME };
  }
  const setting = await db.userSetting.findUnique({
    where: { userId: session.user.id },
  });
  return {
    workStartTime: setting?.workStartTime ?? DEFAULT_WORK_START_TIME,
  };
}

export async function updateWorkStartTime(time: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await db.userSetting.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, workStartTime: time },
    update: { workStartTime: time },
  });
  revalidatePath("/");
}
