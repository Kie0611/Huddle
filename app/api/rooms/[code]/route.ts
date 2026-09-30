import { NextResponse } from "next/server";
import { getActiveRoomByCode, touchRoom } from "@/db/queries/rooms";
import { ensureLiveblocksRoom } from "@/lib/liveblocks";

type Params = { params: Promise<{code: string}> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getActiveRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or expired" },
      { status: 404 }
    );
  }

  await touchRoom(room.id);
  await ensureLiveblocksRoom(room.code);

  return NextResponse.json({ ...room, lastActiveAt: new Date() });
}
