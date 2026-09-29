import { Liveblocks } from "@liveblocks/node";

export const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

type NoteShape = {
  id: string;
  roomId: string;
  x: number;
  y: number;
  text: string;
  color: string;
  authorId: string | null;
  createdAt: string;
};

export type StrokeEvent = {
  type: "stroke:create";
  stroke: {
    id: string;
    roomId: string;
    points: { x: number; y: number }[];
    color: string;
    thickness: number;
    authorId: string | null;
    createdAt: string;
  };
};

export type NoteEvent =
  | { type: "note:create"; note: NoteShape }
  | { type: "note:update"; note: NoteShape }
  | { type: "note:delete"; note: { id: string } };

export type ChatEvent = {
  type: "chat:message";
  message: {
    authorId: string;
    text: string;
    sentAt: string;
  };
};

export type RoomEvent = StrokeEvent | NoteEvent | ChatEvent;

export async function ensureLiveblocksRoom(roomCode: string): Promise<boolean> {
  try {
    await liveblocks.upsertRoom(roomCode, {
      update: { defaultAccesses: ["*:write"] },
      create: { defaultAccesses: ["*:write"] },
    });
    return true;
  } catch (error) {
    console.warn(`Liveblocks room provisioning failed for ${roomCode}`, error);
    return false;
  }
}

export async function broadcastEvent(
  roomCode: string,
  event: RoomEvent
): Promise<boolean> {
  try {
    await liveblocks.broadcastEvent(roomCode, event);
    return true;
  } catch (initialError) {
    try {
      // Huddle creates its Postgres room before its Liveblocks room. If this
      // is the first board event, create the matching realtime room and retry.
      const roomReady = await ensureLiveblocksRoom(roomCode);
      if (!roomReady) return false;
      await liveblocks.broadcastEvent(roomCode, event);
      return true;
    } catch (retryError) {
      // Saving board content must not fail just because the optional realtime
      // service is unavailable.
      console.warn(`Liveblocks broadcast failed for room ${roomCode}`, {
        initialError,
        retryError,
      });
      return false;
    }
  }
}
