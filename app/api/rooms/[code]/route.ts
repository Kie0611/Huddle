import { NextResponse } from "next/server";
import { getRoomByCode, touchRoom } from "@/db/queries/rooms";

type Params = { params: Promise<{code: string}> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or expired" },
      { status: 404 }
    );
  }

  await touchRoom(room.id);

  return NextResponse.json(room);
}