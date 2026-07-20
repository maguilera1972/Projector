import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/db/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(user.id),
    countUnreadNotifications(user.id),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const marked = await markAllNotificationsRead(user.id);
  const unreadCount = await countUnreadNotifications(user.id);

  return NextResponse.json({ marked, unreadCount });
}
