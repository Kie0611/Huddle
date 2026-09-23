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
  text?: string,
  color?: string
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

export async function updateNote(
  id: string,
  authorId: string,
  fields: Partial<UpdateNoteFields>
): Promise<Note | null> {
  const [note] = await db
    .update(stickyNotes)
    .set({
      text: fields.text,
      color: fields.color,
    })
    .where(
      and(
        eq(stickyNotes.id, id),
        eq(stickyNotes.authorId, authorId)
      )
    )
    .returning();
  
  return note ?? null;
}

export async function deleteNote(id: string, authorId: string): Promise<boolean> {
  const [note] = await db
    .delete(stickyNotes)
    .where(
      and(
        eq(stickyNotes.id, id),
        eq(stickyNotes.authorId, authorId)
      )
    )
    .returning();
  
  return !!note;
}