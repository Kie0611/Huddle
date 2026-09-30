import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteStroke } from "@/db/queries/strokes";
import { getActiveRoomByCode, touchRoom } from "@/db/queries/rooms";
import { broadcastEvent } from "@/lib/liveblocks";

const idSchema = z.string().uuid();

type Params = { params: Promise<{ code: string; id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { code, id } = await params;
  const parsedId = idSchema.safeParse(id);
  const parsedAuthorId = idSchema.safeParse(
    new URL(req.url).searchParams.get("authorId")
  );

  if (!parsedId.success || !parsedAuthorId.success) {
    return NextResponse.json(
      { error: "A valid stroke ID and authorId are required" },
      { status: 400 }
    );
  }

  const room = await getActiveRoomByCode(code);
  if (!room) {
    return NextResponse.json({ error: "Room not found or has expired" }, { status: 404 });
  }

  const deleted = await deleteStroke({
    id: parsedId.data,
    roomId: room.id,
    authorId: parsedAuthorId.data,
  });
  if (!deleted) {
    return NextResponse.json(
      { error: "Stroke not found or you are not the author" },
      { status: 404 }
    );
  }

  await touchRoom(room.id);
  await broadcastEvent(code, { type: "stroke:delete", stroke: { id } });
  return new Response(null, { status: 204 });
}
