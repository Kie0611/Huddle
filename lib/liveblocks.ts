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

export async function broadcastEvent(
  roomCode: string,
  event: RoomEvent
): Promise<void> {
  await liveblocks.broadcastEvent(roomCode, event);
}