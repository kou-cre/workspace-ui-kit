import { db } from "@/lib/db";

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
};

async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now + 300) {
    if (!account.refresh_token) return null;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await db.account.updateMany({
      where: { userId, provider: "google" },
      data: { access_token: data.access_token, expires_at: now + (data.expires_in as number) },
    });
    return data.access_token as string;
  }

  return account.access_token;
}

export async function fetchGoogleCalendarEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const token = await getValidAccessToken(userId);
  if (!token) return [];

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];

  const data = await res.json();
  return ((data.items ?? []) as any[])
    .filter((item) => item.status !== "cancelled")
    .map((item) => ({
      id: item.id as string,
      title: (item.summary as string | undefined) ?? "(タイトルなし)",
      start: (item.start?.date ?? item.start?.dateTime?.slice(0, 10) ?? "") as string,
      end: (item.end?.date ?? item.end?.dateTime?.slice(0, 10) ?? "") as string,
    }));
}

export async function createGoogleCalendarEvent(
  userId: string,
  title: string,
  date: string,
  description?: string,
): Promise<string | null> {
  if (!date) return null;
  const token = await getValidAccessToken(userId);
  if (!token) return null;

  const body: Record<string, unknown> = {
    summary: title || "(タイトルなし)",
    start: { date },
    end: { date },
  };
  if (description) body.description = description;

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data.id as string | undefined) ?? null;
}

export async function updateGoogleCalendarEvent(
  userId: string,
  googleEventId: string,
  title: string,
  date: string,
  description?: string,
): Promise<void> {
  if (!date) return;
  const token = await getValidAccessToken(userId);
  if (!token) return;

  const body: Record<string, unknown> = {
    summary: title || "(タイトルなし)",
    start: { date },
    end: { date },
    description: description ?? "",
  };

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function deleteGoogleCalendarEvent(
  userId: string,
  googleEventId: string,
): Promise<void> {
  const token = await getValidAccessToken(userId);
  if (!token) return;

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
}
