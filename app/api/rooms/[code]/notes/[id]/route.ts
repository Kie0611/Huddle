import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveRoomByCode, touchRoom } from "@/db/queries/rooms";
import { updateNote, deleteNote } from "@/db/queries/notes";
import { broadcastEvent } from "@/lib/liveblocks";

const noteColors = ["yellow", "pink", "mint", "blue"] as const;
const noteColorSchema = z.union([
  z.enum(noteColors),
  z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a six-digit hex value"),
]);
const patchSchema = z.object({
  text: z.string().trim().min(1).max(280).optional(),
  color: noteColorSchema.optional(),
  x: z.number().int().min(0).max(100).optional(),
  y: z.number().int().min(0).max(100).optional(),
  authorId: z.string().uuid(),
}).refine(
  ({ text, color, x, y }) =>
    text !== undefined || color !== undefined || x !== undefined || y !== undefined,
  { message: "Provide text, color, or position to update" }
).refine(
  ({ x, y }) => (x === undefined) === (y === undefined),
  { message: "Provide both x and y when moving a note" }
);

const noteIdSchema = z.string().uuid();

type Params = { params: Promise<{ code: string; id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { code, id } = await params;
  const parsedId = noteIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
  }

  const room = await getActiveRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or has expired" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.format() },
      { status: 400 }
    );
  }

  const { authorId, ...fields } = parsed.data;
  const note = await updateNote({
    id: parsedId.data,
    roomId: room.id,
    authorId,
    fields,
  });

  if (!note) {
    return NextResponse.json(
      { error: "Note not found or you are not the author" },
      { status: 404 }
    );
  }

  await broadcastEvent(code, {
    type: "note:update",
    note: {
      ...note,
      createdAt: note.createdAt.toISOString(),
    },
  });

  await touchRoom(room.id);

  return NextResponse.json(note);
}

export async function DELETE(req: Request, { params }: Params) {
  const { code, id } = await params;
  const parsedId = noteIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
  }

  const authorId = new URL(req.url).searchParams.get("authorId");
  const parsedAuthorId = z.string().uuid().safeParse(authorId);
  if (!parsedAuthorId.success) {
    return NextResponse.json(
      { error: "A valid authorId is required" },
      { status: 400 }
    );
  }

  const room = await getActiveRoomByCode(code);
  if (!room) {
    return NextResponse.json(
      { error: "Room not found or has expired" },
      { status: 404 }
    );
  }

  const deleted = await deleteNote({
    id: parsedId.data,
    roomId: room.id,
    authorId: parsedAuthorId.data,
  });
  if (!deleted) {
    return NextResponse.json(
      { error: "Note not found or you are not the author" },
      { status: 404 }
    );
  }

  await touchRoom(room.id);

  await broadcastEvent(code, { type: "note:delete", note: { id } });

  return new Response(null, { status: 204 });
}
