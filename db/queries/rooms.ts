import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { rooms } from "@/db/schema";

export type Room = typeof rooms.$inferSelect;

export async function createRoom(): Promise<Room> {
  const code = nanoid(8);

  const [room] = await db.insert(rooms).values({ code }).returning();
  return room;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, code))
    .limit(1)

  return room ?? null;
}

export async function touchRoom(roomId: string): Promise<void> {
  await db
    .update(rooms)
    .set({ lastActiveAt: new Date() })
    .where(eq(rooms.id, roomId))
}