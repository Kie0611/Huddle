import { NextResponse } from "next/server";
import { z } from "zod";
import { createRoom } from "@/db/queries/rooms";

const createRoomSchema = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = createRoomSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.format() },
      { status: 400 }
    );
  }

  const room = await createRoom(parsed.data.name);
  return NextResponse.json({ code: room.code, name: room.name }, { status: 201 });
}