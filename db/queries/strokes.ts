// db/queries/strokes.ts
import { eq, and, gte, count } from "drizzle-orm";
import { db } from "@/db";
import { strokes } from "@/db/schema";

export type Stroke = typeof strokes.$inferSelect;

export type CreateStrokeInput = {
  roomId: string;
  points: { x: number; y: number }[];
  color: string;
  thickness: number;
  authorId?: string;
};

export async function getStrokes(roomId: string): Promise<Stroke[]> {
  return db
    .select()
    .from(strokes)
    .where(eq(strokes.roomId, roomId))
    .orderBy(strokes.createdAt);
}

export async function createStroke(input: CreateStrokeInput): Promise<Stroke> {
  const [stroke] = await db
    .insert(strokes)
    .values({
      roomId: input.roomId,
      points: input.points,
      color: input.color,
      thickness: input.thickness,
      authorId: input.authorId ?? null,
    })
    .returning();

  return stroke;
}

export async function checkRateLimit(
  roomId: string,
  authorId: string,
  limitCount = 30,
  windowSeconds = 10
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000);

  const [result] = await db
    .select({ total: count() })
    .from(strokes)
    .where(
      and(
        eq(strokes.roomId, roomId),
        eq(strokes.authorId, authorId),
        gte(strokes.createdAt, since)
      )
    );

  return result.total < limitCount;
}