import { createNote, getNotes } from "@/db/queries/notes";
import { getRoomByCode, touchRoom } from "@/db/queries/rooms";
import { broadcastEvent } from "@/lib/liveblocks";
import { NextResponse } from "next/server";
import { z } from "zod";

const noteColors = ["yellow", "pink", "mint", "blue"] as const;
const noteColorSchema = z.union([
  z.enum(noteColors),
  z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a six-digit hex value"),
]);
const noteSchema = z.object({
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
  text: z.string().trim().min(1).max(280),
  color: noteColorSchema,
  authorId: z.string().uuid().optional(),
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

  const body = await req.json();
  const parsed = noteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.format() },
      { status: 400 }
    );
  }
 
  const { x, y, text, color, authorId } = parsed.data;

  const note = await createNote({
    roomId: room.id,
    x,
    y,
    text,
    color,
    authorId,
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
