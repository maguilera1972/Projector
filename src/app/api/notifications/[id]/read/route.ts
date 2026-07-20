import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  countUnreadNotifications,
  markNotificationRead,
} from "@/lib/db/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const notification = await markNotificationRead(id, user.id);

  if (!notification) {
    return NextResponse.json(
      { error: "Notification introuvable." },
      { status: 404 },
    );
  }

  const unreadCount = await countUnreadNotifications(user.id);
  return NextResponse.json({ notification, unreadCount });
}
