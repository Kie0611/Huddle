import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveRoomByCode, touchRoom } from "@/db/queries/rooms";
import { getStrokes, createStroke, checkRateLimit } from "@/db/queries/strokes";
import { broadcastEvent } from "@/lib/liveblocks";

const strokeSchema = z.object({
  points: z.array(
    z.object({
      x: z.number().min(0).max(1920),
      y: z.number().min(0).max(1080),
    })
  ).min(1).max(2_000),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal("eraser")]),
  thickness: z.number().int().min(1).max(20),
  authorId: z.string().uuid(),
});

type Params = { params: Promise<{code: string}> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const room = await getActiveRoomByCode(code);

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
  const room = await getActiveRoomByCode(code);

  if (!room) {
    return NextResponse.json(
      { error: "Room not found or has expired" },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = strokeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.format() },
      { status: 400 }
    );
  }

  const { points, color, thickness, authorId } = parsed.data;

  const allowed = await checkRateLimit(room.id, authorId);
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
    authorId,
  });

  await touchRoom(room.id);

  await broadcastEvent(code, {
    type: "stroke:create",
    stroke: {
      ...stroke,
      points: stroke.points as { x: number; y: number }[],
      createdAt: stroke.createdAt.toISOString(),
    },
  });

  return NextResponse.json(stroke, { status: 201 })
}
