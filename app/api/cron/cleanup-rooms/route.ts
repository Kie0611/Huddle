import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { rooms } from "@/db/schema";

export async function POST() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const deleted = await db
    .delete(rooms)
    .where(lt(rooms.lastActiveAt, oneHourAgo))
    .returning({ id: rooms.id, code: rooms.code });

  console.log(`Cleanup: deleted ${deleted.length} expired rooms`);

  return NextResponse.json({
    deleted: deleted.length,
    rooms: deleted,
  });
}