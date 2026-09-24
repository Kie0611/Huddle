import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoomByCode } from "@/db/queries/rooms";
import { updateNote, deleteNote } from "@/db/queries/notes";

const patchSchema = z.object({
  text: z.string().min(1).max(280).optional(),
  color: z.string().length(7).optional(),
  authorId: z.string(),
});

type Params = { params: Promise<{ code: string; id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { code, id } = await params;
  const room = await getRoomByCode(code);

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
  const note = await updateNote(id, authorId, fields);

  if (!note) {
    return NextResponse.json(
      { error: "Note not found or you are not the author" },
      { status: 404 }
    );
  }

  return NextResponse.json(note);
}

export async function DELETE(req: Request, { params }: Params) {
  const { code, id } = await params;

  const authorId = new URL(req.url).searchParams.get("authorId");
  if (!authorId) {
    return NextResponse.json(
      { error: "authorId is required" },
      { status: 400 }
    );
  }

  const room = await getRoomByCode(code);
  if (!room) {
    return NextResponse.json(
      { error: "Room not found or has expired" },
      { status: 404 }
    );
  }

  const deleted = await deleteNote(id, authorId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Note not found or you are not the author" },
      { status: 404 }
    );
  }

  return new Response(null, { status: 204 });
}