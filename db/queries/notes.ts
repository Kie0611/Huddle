import { and, asc, eq } from "drizzle-orm";
import { db } from "..";
import { stickyNotes } from "../schema"

export type Note = typeof stickyNotes.$inferSelect;

export type CreateNoteInput = {
  roomId: string,
  x: number,
  y: number,
  text: string,
  color: string,
  authorId?: string,
}

export type UpdateNoteFields = {
  text?: string;
  color?: string;
  x?: number;
  y?: number;
}

export type UpdateNoteInput = {
  id: string,
  roomId: string,
  authorId: string,
  fields: UpdateNoteFields,
}

export type DeleteNoteInput = {
  id: string,
  roomId: string,
  authorId: string,
}

export async function getNotes(roomId: string): Promise<Note[]> {
  return db
    .select()
    .from(stickyNotes)
    .where(eq(stickyNotes.roomId, roomId))
    .orderBy(asc(stickyNotes.createdAt))
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const [note] = await db
    .insert(stickyNotes)
    .values({
      roomId: input.roomId,
      x: input.x,
      y: input.y,
      text: input.text,
      color: input.color,
      authorId: input.authorId ?? null,
    })
    .returning()

  return note;
}

export async function updateNote(input: UpdateNoteInput): Promise<Note | null> {
  const [note] = await db
    .update(stickyNotes)
    .set({
      text: input.fields.text,
      color: input.fields.color,
      x: input.fields.x,
      y: input.fields.y,
    })
    .where(
      and(
        eq(stickyNotes.id, input.id),
        eq(stickyNotes.roomId, input.roomId),
        eq(stickyNotes.authorId, input.authorId)
      )
    )
    .returning();
  
  return note ?? null;
}

export async function deleteNote(input: DeleteNoteInput): Promise<boolean> {
  const [note] = await db
    .delete(stickyNotes)
    .where(
      and(
        eq(stickyNotes.id, input.id),
        eq(stickyNotes.roomId, input.roomId),
        eq(stickyNotes.authorId, input.authorId)
      )
    )
    .returning();
  
  return !!note;
}
