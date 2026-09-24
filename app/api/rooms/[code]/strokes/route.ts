import { NextResponse } from "next/server";
import { z } from "zod";
import { getRoomByCode, touchRoom } from "@/db/queries/rooms";
import { getStrokes, createStroke, checkRateLimit } from "@/db/queries/strokes";

const strokeSchema = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
  color: z.union([z.string().length(7), z.literal("eraser")]),
  thickness: z.number().int().min(1).max(20),
  authorId: z.string().optional(),
})

type Params = { params: Promise<{code: string}> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or has expired" },
      { status: 404 }
    );
  }

  const strokes = await getStrokes(room.id);
  return NextResponse.json(strokes);
}

export async function POST(req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or has expired" },
      { status: 404 }
    );
  }

  const body = req.body;
  const parsed = strokeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.format() },
      { status: 400 }
    );
  }

  const { points, color, thickness, authorId } = parsed.data;
  const effectiveAuthorId = authorId ?? "anonymous";

  const allowed = await checkRateLimit(room.id, effectiveAuthorId);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  const stroke = await createStroke({
    roomId: room.id,
    points,
    color,
    thickness,
    authorId: effectiveAuthorId
  });

  await touchRoom(room.id);

  return NextResponse.json(stroke, { status: 201 })
}