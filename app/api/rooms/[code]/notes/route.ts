import { createNote, getNotes } from "@/db/queries/notes";
import { getRoomByCode, touchRoom } from "@/db/queries/rooms";
import { broadcastEvent } from "@/lib/liveblocks";
import { NextResponse } from "next/server";
import z from "zod";

const noteSchema = z.object({
  x: z.number(),
  y: z.number(),
  text: z.string().min(1).max(280),
  color: z.string().length(7),
  authorId: z.string().optional()
});

type Params = { params: Promise<{code: string}> }

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or expired" },
      { status: 404 }
    );
  }

  const notes = await getNotes(room.id);

  return NextResponse.json(notes);
}

export async function POST(req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or expired" },
      { status: 404 }
    );
  }

  const body = req.json();
  const parsed = noteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.format() },
      { status: 400 }
    );
  }
 
  const { x, y, text, color, authorId } = parsed.data;
  const effectiveAuthorId = authorId ?? "anonymous";

  const note = await createNote({
    roomId: room.id,
    x,
    y,
    text,
    color,
    authorId: effectiveAuthorId
  });

  await touchRoom(room.id)

  await broadcastEvent(code, {
    type: "note:create",
    note: {
      ...note,
      createdAt: note.createdAt.toISOString(),
    },
  });

  return NextResponse.json(note, { status: 201 })
}