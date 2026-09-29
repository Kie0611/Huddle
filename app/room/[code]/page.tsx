"use client";

import {
  useState, useMemo, useEffect, useRef,
  type FormEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@liveblocks/client";
import {
  ChevronDown, Copy, Download, Hand, MessageCircle,
  MousePointer2, Pencil, Plus, Redo2, Send, Share2, StickyNote,
  Undo2, Users, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RoomEvent } from "@/lib/liveblocks";

type Tool = "select" | "pan" | "draw" | "note";
type NoteColor = "yellow" | "pink" | "mint" | "blue";
type StickyNote = {
  id: string;
  text: string;
  color: NoteColor;
  x: number;
  y: number;
  rotate: number;
  authorId: string | null;
};
type Message = { id: number; author: string; text: string; time: string };
type PersistedNote = Omit<StickyNote, "rotate" | "color"> & { color: string };
type NoteDrag = {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

const liveblocksPublicKey = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;
const liveblocksClient = liveblocksPublicKey
  ? createClient({ publicApiKey: liveblocksPublicKey })
  : null;

const legacyNoteColors: Record<string, NoteColor> = {
  yellow: "yellow",
  pink: "pink",
  mint: "mint",
  blue: "blue",
  "#ffe566": "yellow",
  "#ffb3ba": "pink",
  "#b5ead7": "mint",
  "#b5d5ea": "blue",
};

function toNoteColor(color: unknown): NoteColor {
  if (typeof color !== "string") return "yellow";
  return legacyNoteColors[color.toLowerCase()] ?? "yellow";
}

function toStickyNote(note: PersistedNote, rotate = Math.random() * 4 - 2): StickyNote {
  return {
    ...note,
    color: toNoteColor(note.color),
    rotate,
  };
}

function clampNotePosition(position: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, Math.round(position)));
}

function Logo() {
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary font-mono text-lg font-bold text-primary-foreground">
      H
    </div>
  );
}

function EmptyRoomState({ expired }: { expired: boolean }) {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-center">
      <div className="flex max-w-md flex-col items-center">
        <Logo />
        <h1 className="mt-7 font-mono text-4xl font-semibold">
          {expired ? "This room has expired" : "Room not found"}
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {expired
            ? "Huddle rooms auto-delete after 1 hour of inactivity."
            : "Double-check the code, or ask whoever shared it to send a new one."}
        </p>
        <Button className="mt-7" onClick={() => router.push("/")}>
          {expired ? "Create a new room" : "Go home"}
        </Button>
      </div>
    </main>
  );
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const name = searchParams.get("name") ?? "Guest";
  const roomName = searchParams.get("room") ?? "Untitled huddle";
  const normalizedCode = code;

  const [roomStatus, setRoomStatus] = useState<"loading" | "active" | "notfound" | "expired">("loading");
  const [tool, setTool] = useState<Tool>("draw");
  const [noteColor, setNoteColor] = useState<NoteColor>("yellow");
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [zoom, setZoom] = useState(100);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [copied, setCopied] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const noteDragRef = useRef<NoteDrag | null>(null);

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "guest";
    const key = `session-${normalizedCode}`;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  }, [normalizedCode]);

  const inviteUrl = useMemo(
    () => `${typeof window !== "undefined" ? window.location.origin : ""}/room/${normalizedCode}`,
    [normalizedCode]
  );

  // Validate room on load
  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`/api/rooms/${normalizedCode}`);
        if (res.status === 404) {
          setRoomStatus("notfound");
          return;
        }
        if (!res.ok) {
          setRoomStatus("notfound");
          return;
        }
        const room = await res.json();

        // Check expiry
        const lastActive = new Date(room.lastActiveAt).getTime();
        const diff = Date.now() - lastActive;
        if (diff > 60 * 60 * 1000) {
          setRoomStatus("expired");
          return;
        }

        setMinutesLeft(Math.max(0, Math.floor((60 * 60 * 1000 - diff) / 60000)));
        setRoomStatus("active");
      } catch {
        setRoomStatus("notfound");
      }
    }
    validate();
  }, [normalizedCode]);

  // Load existing strokes and notes
  useEffect(() => {
    if (roomStatus !== "active") return;
    async function loadData() {
      try {
        const res = await fetch(`/api/rooms/${normalizedCode}/notes`);
        if (res.ok) {
          const data: PersistedNote[] = await res.json();
          setNotes(data.map((note) => toStickyNote(note)));
        }
      } catch {}
    }
    loadData();
  }, [roomStatus, normalizedCode]);

  useEffect(() => {
    if (roomStatus !== "active" || !liveblocksClient) return;

    const { room, leave } = liveblocksClient.enterRoom<
      Record<string, never>,
      Record<string, never>,
      RoomEvent
    >(
      normalizedCode,
      { initialPresence: {} }
    );

    const unsubscribe = room.subscribe("event", ({ event }) => {
      if (event.type === "note:create" || event.type === "note:update") {
        const incoming = toStickyNote(event.note);

        setNotes((prev) => {
          const existing = prev.find((note) => note.id === incoming.id);
          if (!existing) return [...prev, incoming];

          return prev.map((note) =>
            note.id === incoming.id
              ? { ...incoming, rotate: note.rotate }
              : note
          );
        });
      }

      if (event.type === "note:delete") {
        setNotes((prev) => prev.filter((note) => note.id !== event.note.id));
      }
    });

    return () => {
      unsubscribe();
      leave();
    };
  }, [roomStatus, normalizedCode]);

  const addNote = async () => {
    const draft = {
      text: "New thought",
      color: noteColor,
      x: Math.round(40 + Math.random() * 20),
      y: Math.round(30 + Math.random() * 20),
      rotate: Math.random() * 4 - 2,
    };

    try {
      const res = await fetch(`/api/rooms/${normalizedCode}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: draft.x,
          y: draft.y,
          text: draft.text,
          color: draft.color,
          authorId: sessionId,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const saved: PersistedNote = await res.json();
      const newNote = toStickyNote(saved, draft.rotate);

      setNotes((prev) =>
        prev.some((note) => note.id === newNote.id)
          ? prev
          : [...prev, newNote]
      );
    } catch (error) {
      console.error("Could not create note:", error);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/rooms/${normalizedCode}/notes/${id}?authorId=${sessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      setNotes((prev) => prev.filter((note) => note.id !== id));
      setSelectedNoteId((selectedId) => selectedId === id ? null : selectedId);
    } catch (error) {
      console.error("Could not delete note:", error);
    }
  };

  const saveNotePosition = async (drag: NoteDrag) => {
    try {
      const res = await fetch(`/api/rooms/${normalizedCode}/notes/${drag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: drag.x,
          y: drag.y,
          authorId: sessionId,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const saved: PersistedNote = await res.json();
      setNotes((prev) =>
        prev.map((note) =>
          note.id === drag.id
            ? { ...note, x: saved.x, y: saved.y }
            : note
        )
      );
    } catch (error) {
      console.error("Could not move note:", error);
      setNotes((prev) =>
        prev.map((note) =>
          note.id === drag.id
            ? { ...note, x: drag.startX, y: drag.startY }
            : note
        )
      );
    }
  };

  const updateNoteColor = async (id: string, color: NoteColor) => {
    const note = notes.find((candidate) => candidate.id === id);
    if (!note || note.authorId !== sessionId || note.color === color) return;

    try {
      const res = await fetch(`/api/rooms/${normalizedCode}/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color, authorId: sessionId }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const saved: PersistedNote = await res.json();
      setNotes((prev) =>
        prev.map((candidate) =>
          candidate.id === id
            ? { ...candidate, color: toNoteColor(saved.color) }
            : candidate
        )
      );
    } catch (error) {
      console.error("Could not change note color:", error);
    }
  };

  const startNoteDrag = (
    event: ReactPointerEvent<HTMLElement>,
    note: StickyNote
  ) => {
    if (note.authorId !== sessionId || event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("textarea, button")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNoteId(note.id);
    noteDragRef.current = {
      id: note.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: note.x,
      startY: note.y,
      x: note.x,
      y: note.y,
    };
  };

  const moveNote = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = noteDragRef.current;
    const board = event.currentTarget.parentElement;
    if (!drag || drag.pointerId !== event.pointerId || !board) return;

    const bounds = board.getBoundingClientRect();
    const noteBounds = event.currentTarget.getBoundingClientRect();
    const maxX = Math.max(0, 100 - (noteBounds.width / bounds.width) * 100);
    const maxY = Math.max(0, 100 - (noteBounds.height / bounds.height) * 100);
    const x = clampNotePosition(
      drag.startX + ((event.clientX - drag.startClientX) / bounds.width) * 100,
      maxX
    );
    const y = clampNotePosition(
      drag.startY + ((event.clientY - drag.startClientY) / bounds.height) * 100,
      maxY
    );

    drag.x = x;
    drag.y = y;
    setNotes((prev) =>
      prev.map((note) => note.id === drag.id ? { ...note, x, y } : note)
    );
  };

  const finishNoteDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = noteDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    noteDragRef.current = null;

    if (drag.x !== drag.startX || drag.y !== drag.startY) {
      void saveNotePosition(drag);
    }
  };

  const cancelNoteDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = noteDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    noteDragRef.current = null;
    setNotes((prev) =>
      prev.map((note) =>
        note.id === drag.id
          ? { ...note, x: drag.startX, y: drag.startY }
          : note
      )
    );
  };

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    const now = new Date();
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        author: name,
        text: clean,
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setMessage("");
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (roomStatus === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Joining room...</p>
      </main>
    );
  }
  if (roomStatus === "expired") return <EmptyRoomState expired />;
  if (roomStatus === "notfound") return <EmptyRoomState expired={false} />;

  return (
    <main className="relative h-dvh overflow-hidden bg-canvas text-foreground">
      {/* Top bar */}
      <header className="relative z-20 flex h-16 items-center justify-between border-b border-border/70 bg-chrome px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h1 className="truncate font-mono text-base font-semibold md:text-lg">
                {roomName}
              </h1>
              <ChevronDown className="size-4 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">✓ Saved</p>
          </div>
        </div>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs font-semibold text-muted-foreground md:flex">
          <span className="size-2 rounded-full bg-presence" />
          ROOM {normalizedCode}
        </div>

        <div className="flex items-center gap-2">
          {minutesLeft !== null && (
            <span className="hidden text-xs text-muted-foreground lg:inline">
              Expires in {minutesLeft} min
            </span>
          )}
          <div className="hidden -space-x-2 sm:flex">
            {[
              ["bg-avatar-one", name.slice(0, 2).toUpperCase()],
            ].map(([bg, initials]) => (
              <span
                key={initials}
                className={cn(
                  "grid size-8 place-items-center rounded-full border-2 border-chrome text-[10px] font-bold text-white",
                  bg
                )}
              >
                {initials}
              </span>
            ))}
          </div>

          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Share2 /> <span className="hidden sm:inline">Invite</span>
          </Button>

          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent className="max-w-sm rounded-lg border-0 p-7 shadow-paper">
              <DialogHeader className="items-center text-center">
                <DialogTitle className="font-mono text-2xl">{roomName}</DialogTitle>
                <DialogDescription>
                  Scan to join this temporary room.
                </DialogDescription>
              </DialogHeader>
              <div className="mx-auto rounded-lg bg-qr p-4">
                <QRCodeSVG value={inviteUrl} size={180} />
              </div>
              <p className="text-center font-mono text-2xl font-bold tracking-[0.14em]">
                {normalizedCode}
              </p>
              <Button onClick={copyInvite} className="w-full">
                <Copy /> {copied ? "Link copied!" : "Copy link"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Canvas area */}
      <section
        className="dot-grid relative h-[calc(100dvh-4rem)] overflow-hidden"
        aria-label="Collaborative canvas"
      >
        {/* Notes layer */}
        <div
          className="absolute inset-0 origin-center transition-transform duration-200"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          {notes.map((note) => (
            <article
              key={note.id}
              className={cn(
                "group absolute flex aspect-square w-32 items-start p-4 font-note text-base leading-snug shadow-note transition-transform md:w-40 md:p-5",
                `note-${note.color}`
              )}
              style={{
                left: `${note.x}%`,
                top: `${note.y}%`,
                transform: `rotate(${note.rotate}deg)`,
              }}
              onPointerDown={(event) => startNoteDrag(event, note)}
              onPointerMove={moveNote}
              onPointerUp={finishNoteDrag}
              onPointerCancel={cancelNoteDrag}
            >
              <span
                className="absolute left-1/2 top-0 h-3 w-12 -translate-x-1/2 bg-note-tape"
                aria-hidden="true"
              />
              <textarea
                className="h-full w-full resize-none bg-transparent font-note text-sm leading-snug outline-none placeholder:text-current/50"
                defaultValue={note.text}
                placeholder="Write something..."
                readOnly={note.authorId !== sessionId}
                onFocus={() => setSelectedNoteId(note.id)}
                onBlur={async (e) => {
                  const newText = e.currentTarget.value.trim();

                  if (!newText || newText === note.text) return;

                  try {
                    const res = await fetch(
                      `/api/rooms/${normalizedCode}/notes/${note.id}`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          text: newText,
                          authorId: sessionId,
                        }),
                      }
                    );

                    if (!res.ok) {
                      throw new Error(await res.text());
                    }

                    const saved = await res.json();

                    setNotes((prev) =>
                      prev.map((n) =>
                        n.id === note.id ? { ...n, text: saved.text } : n
                      )
                    );
                  } catch (error) {
                    console.error("Could not save note:", error);
                    e.currentTarget.value = note.text;
                  }
                }}
              />
              {note.authorId === sessionId && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete note"
                  onClick={() => deleteNote(note.id)}
                  className="absolute right-1 top-1 size-7 opacity-0 shadow-none group-hover:opacity-100"
                >
                  <X />
                </Button>
              )}
            </article>
          ))}
        </div>

        {/* Zoom controls — bottom left */}
        <div className="floating-control absolute bottom-5 left-3 flex items-center gap-1 p-1.5 md:bottom-6 md:left-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(60, z - 10))}
          >
            <ZoomOut />
          </Button>
          <span className="w-11 text-center text-xs font-semibold">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(160, z + 10))}
          >
            <ZoomIn />
          </Button>
        </div>

        {/* Main toolbar — bottom center */}
        <div className="floating-control absolute bottom-5 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto p-1.5 md:bottom-6">
          {(
            [
              ["select", MousePointer2, "Select"],
              ["pan", Hand, "Pan"],
              ["draw", Pencil, "Draw"],
              ["note", StickyNote, "Sticky note"],
            ] as const
          ).map(([value, Icon, label]) => (
            <Button
              key={value}
              variant={tool === value ? "toolActive" : "ghost"}
              size="icon"
              aria-label={label}
              title={label}
              onClick={() => setTool(value)}
            >
              <Icon />
            </Button>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <div className="flex gap-1 px-1" aria-label="Note color">
            {(["yellow", "pink", "mint", "blue"] as NoteColor[]).map((c) => (
              <button
                key={c}
                aria-label={`${c} note`}
                onClick={() => {
                  setNoteColor(c);
                  if (selectedNoteId) void updateNoteColor(selectedNoteId, c);
                }}
                className={cn(
                  "size-5 shrink-0 rounded-full border-2 border-chrome ring-offset-2 ring-offset-chrome transition-transform active:scale-95",
                  `swatch-${c}`,
                  noteColor === c && "ring-2 ring-ring"
                )}
              />
            ))}
          </div>
          <Button size="icon" onClick={addNote} aria-label="Add sticky note">
            <Plus />
          </Button>
        </div>

        {/* Right controls — bottom right */}
        <div className="floating-control absolute bottom-5 right-3 hidden items-center gap-1 p-1.5 md:bottom-6 md:right-4 md:flex">
          <Button variant="ghost" size="icon" aria-label="Undo"><Undo2 /></Button>
          <Button variant="ghost" size="icon" aria-label="Redo"><Redo2 /></Button>
          <span className="mx-1 h-6 w-px bg-border" />
          <Button variant="ghost" size="icon" aria-label="Download"><Download /></Button>
          <Button variant="ghost" size="icon" aria-label="People"><Users /></Button>
          <Button
            variant={chatOpen ? "toolActive" : "ghost"}
            size="icon"
            aria-label="Open chat"
            onClick={() => setChatOpen((v) => !v)}
          >
            <MessageCircle />
          </Button>
        </div>

        {/* Mobile chat button */}
        <Button
          variant={chatOpen ? "toolActive" : "secondary"}
          size="icon"
          aria-label="Open chat"
          className="absolute bottom-20 right-3 shadow-soft md:hidden"
          onClick={() => setChatOpen((v) => !v)}
        >
          <MessageCircle />
        </Button>
      </section>

      {/* Chat panel */}
      <aside
        className={cn(
          "absolute bottom-0 right-0 top-16 z-30 flex w-full max-w-[320px] flex-col border-l border-border bg-chrome shadow-paper transition-transform duration-300",
          chatOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!chatOpen}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-mono text-xl font-semibold">Room chat</h2>
            <p className="text-xs text-muted-foreground">
              Messages disappear on refresh
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close chat"
            onClick={() => setChatOpen(false)}
          >
            <X />
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="m-auto max-w-55 text-center">
              <MessageCircle className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Chat is ephemeral. Say hello while everyone is here.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="rounded-md bg-secondary p-3">
                <p className="text-xs font-semibold">
                  {m.author}{" "}
                  <span className="font-normal text-muted-foreground">{m.time}</span>
                </p>
                <p className="mt-1 text-sm">{m.text}</p>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={sendMessage}
          className="flex gap-2 border-t border-border p-3"
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message"
            aria-label="Chat message"
          />
          <Button size="icon" type="submit" aria-label="Send message">
            <Send />
          </Button>
        </form>
      </aside>
    </main>
  );
}
