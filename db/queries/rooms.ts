import { and, eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { rooms } from "@/db/schema";

export type Room = typeof rooms.$inferSelect;

export async function createRoom(name: string): Promise<Room> {
  const code = nanoid(8);
  
  const [room] = await db.insert(rooms).values({ code, name }).returning();
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

export async function getActiveRoomByCode(code: string): Promise<Room | null> {
  const room = await getRoomByCode(code);
  if (!room) return null;

  const expiry = new Date(Date.now() - 60 * 60 * 1000);
  if (room.lastActiveAt >= expiry) return room;

  // Cleanup normally runs on a schedule, but an expired room must never be
  // revived in the gap between scheduled sweeps.
  await db
    .delete(rooms)
    .where(and(eq(rooms.id, room.id), lt(rooms.lastActiveAt, expiry)));

  return null;
}

export async function touchRoom(roomId: string): Promise<void> {
  await db
    .update(rooms)
    .set({ lastActiveAt: new Date() })
    .where(eq(rooms.id, roomId))
}
