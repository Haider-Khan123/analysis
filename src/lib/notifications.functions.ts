import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/postgres/auth-middleware";
import { db } from "@/integrations/postgres/client.server";

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { data } = await db
      .from("notifications")
      .select("id, type, title, body, is_read, created_at, student_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { notifications: data ?? [] };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await db.from("notifications").update({ is_read: true })
      .eq("id", data.id).eq("user_id", context.userId);
    return { ok: true as const };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await db.from("notifications").update({ is_read: true })
      .eq("user_id", context.userId).eq("is_read", false);
    return { ok: true as const };
  });
