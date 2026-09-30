import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveRoomByCode } from "@/db/queries/rooms";
import { liveblocks } from "@/lib/liveblocks";

const requestSchema = z.object({
  room: z.string().min(1).max(12),
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const room = await getActiveRoomByCode(parsed.data.room);
  if (!room) {
    return NextResponse.json({ error: "Room not found or has expired" }, { status: 404 });
  }

  const session = liveblocks.prepareSession(parsed.data.userId, {
    userInfo: { name: parsed.data.name },
  });
  session.allow(room.code, ["*:write"]);
  const authorization = await session.authorize();

  return new Response(authorization.body, {
    status: authorization.status,
    headers: { "Content-Type": "application/json" },
  });
}
