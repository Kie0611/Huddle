"use client";

import {
  useState, useMemo, useEffect, useRef, useCallback,
  type FormEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@liveblocks/client";
import {
  Copy, Download, Hand, MessageCircle,
  Eraser, Eye, EyeOff, MousePointer2, Pencil, Plus, Redo2, Send, Share2, StickyNote,
  LogOut, Undo2, Users, X, ZoomIn, ZoomOut,
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
type Message = { id: string; author: string; text: string; time: string };
type PersistedNote = Omit<StickyNote, "rotate" | "color"> & { color: string };
type Point = { x: number; y: number };
type CanvasStroke = {
  id: string;
  roomId: string;
  points: Point[];
  color: string;
  thickness: number;
  authorId: string | null;
  createdAt: string;
};
type ActiveStroke = {
  pointerId: number;
  stroke: CanvasStroke;
};
type BoardPan = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};
type RealtimeRoom = {
  broadcastEvent: (event: RoomEvent) => void;
};
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

const boardWidth = 1920;
const boardHeight = 1080;
const defaultBrushColor = "#3a2060";
const minBrushThickness = 4;
const maxBrushThickness = 20;
const defaultBrushPercent = 35;
const brushPalette: Record<NoteColor, string> = {
  yellow: "#d97706",
  pink: "#db2777",
  mint: "#059669",
  blue: "#2563eb",
};
const noteExportColors: Record<NoteColor, string> = {
  yellow: "#ffe9b0",
  pink: "#ffd3e4",
  mint: "#d3f2e3",
  blue: "#d9ccfb",
};

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

function toInitials(personName: string): string {
  return personName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "G";
}

function toCanvasStroke(stroke: CanvasStroke): CanvasStroke {
  return {
    ...stroke,
    points: stroke.points.filter(
      (point): point is Point =>
        Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ),
  };
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: CanvasStroke,
  eraserFill?: string
) {
  const [firstPoint, ...remainingPoints] = stroke.points;
  if (!firstPoint) return;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.thickness;
  context.globalCompositeOperation =
    stroke.color === "eraser" && !eraserFill ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color === "eraser" ? eraserFill ?? "#000000" : stroke.color;
  context.fillStyle = context.strokeStyle;
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (const point of remainingPoints) {
    context.lineTo(point.x, point.y);
  }

  if (remainingPoints.length === 0) {
    context.arc(firstPoint.x, firstPoint.y, stroke.thickness / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.stroke();
  }
  context.restore();
}

function Logo({ className = "size-9", sizes = "36px" }: { className?: string; sizes?: string }) {
  return (
    <span className={cn("relative block shrink-0", className)} aria-hidden="true">
      <Image
        src="/huddle-logo.png"
        alt=""
        fill
        sizes={sizes}
        className="object-contain"
        priority
      />
    </span>
  );
}

function EmptyRoomState({ expired }: { expired: boolean }) {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-center">
      <div className="flex max-w-md flex-col items-center">
        <Logo className="size-24" sizes="96px" />
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
  const router = useRouter();
  const name = searchParams.get("name") ?? "Guest";
  const roomName = searchParams.get("room") ?? "Untitled huddle";
  const normalizedCode = code;

  const [roomStatus, setRoomStatus] = useState<"loading" | "active" | "notfound" | "expired">("loading");
  const [tool, setTool] = useState<Tool>("draw");
  const [noteColor, setNoteColor] = useState<NoteColor>("yellow");
  const [brushColor, setBrushColor] = useState(defaultBrushColor);
  const [brushPercent, setBrushPercent] = useState(defaultBrushPercent);
  const [brushSizeOpen, setBrushSizeOpen] = useState(false);
  const [brushCursorActive, setBrushCursorActive] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [zoom, setZoom] = useState(100);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const [showNotes, setShowNotes] = useState(true);
  const [undoneStrokes, setUndoneStrokes] = useState<CanvasStroke[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [copied, setCopied] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [otherParticipantNames, setOtherParticipantNames] = useState<string[]>([]);
  const [presenceNotice, setPresenceNotice] = useState<string | null>(null);
  const [brushSizePanelPosition, setBrushSizePanelPosition] = useState<{ left: number; top: number } | null>(null);
  const brushThickness = Math.round(
    minBrushThickness + ((maxBrushThickness - minBrushThickness) * brushPercent) / 100
  );
  const brushTipSize = 8 + (20 * brushPercent) / 100;
  const noteDragRef = useRef<NoteDrag | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAreaRef = useRef<HTMLElement | null>(null);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const boardPanRef = useRef<BoardPan | null>(null);
  const liveRoomRef = useRef<RealtimeRoom | null>(null);
  const previousOthersRef = useRef<Map<string, string> | null>(null);
  const brushSizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const brushCursorRef = useRef<HTMLDivElement | null>(null);
  const brushCursorPositionRef = useRef<Point | null>(null);

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

  const liveblocksClient = useMemo(
    () => createClient({
      authEndpoint: async (room) => {
        const response = await fetch("/api/liveblocks-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, userId: sessionId, name }),
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      },
      badgeLocation: "top-left",
    }),
    [name, sessionId]
  );
  const participantNames = [name, ...otherParticipantNames];

  const leaveCanvas = () => {
    router.push("/");
  };

  const toggleBrushSize = () => {
    setBrushSizePanelPosition(null);
    setBrushSizeOpen((open) => !open);
  };

  const saveRequest = async (input: RequestInfo | URL, init?: RequestInit) => {
    setPendingSaves((pending) => pending + 1);
    try {
      return await fetch(input, init);
    } finally {
      setPendingSaves((pending) => Math.max(0, pending - 1));
    }
  };

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

        setMinutesLeft(Math.ceil((60 * 60 * 1000 - diff) / 60000));
        setLastActivityAt(Date.now() - diff);
        setRoomStatus("active");
      } catch {
        setRoomStatus("notfound");
      }
    }
    validate();
  }, [normalizedCode]);

  useEffect(() => {
    if (roomStatus !== "active" || lastActivityAt === null) return;

    const updateCountdown = () => {
      const remaining = lastActivityAt + 60 * 60 * 1000 - Date.now();
      if (remaining <= 0) {
        setMinutesLeft(0);
        setRoomStatus("expired");
        return;
      }
      setMinutesLeft(Math.ceil(remaining / 60000));
    };

    const interval = window.setInterval(updateCountdown, 10_000);
    return () => window.clearInterval(interval);
  }, [lastActivityAt, roomStatus]);

  useEffect(() => {
    if (!presenceNotice) return;

    const timeout = window.setTimeout(() => setPresenceNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [presenceNotice]);

  useEffect(() => {
    if (!brushSizeOpen) return;

    const updateBrushSizePanelPosition = () => {
      const button = brushSizeButtonRef.current;
      if (!button) return;

      const bounds = button.getBoundingClientRect();
      setBrushSizePanelPosition({
        left: bounds.left + bounds.width / 2,
        top: bounds.top - 8,
      });
    };

    updateBrushSizePanelPosition();
    window.addEventListener("resize", updateBrushSizePanelPosition);
    window.addEventListener("scroll", updateBrushSizePanelPosition, true);

    return () => {
      window.removeEventListener("resize", updateBrushSizePanelPosition);
      window.removeEventListener("scroll", updateBrushSizePanelPosition, true);
    };
  }, [brushSizeOpen]);

  // Load the persisted board before realtime events arrive.
  useEffect(() => {
    if (roomStatus !== "active") return;
    async function loadData() {
      try {
        const [notesResponse, strokesResponse] = await Promise.all([
          fetch(`/api/rooms/${normalizedCode}/notes`),
          fetch(`/api/rooms/${normalizedCode}/strokes`),
        ]);

        if (notesResponse.ok) {
          const data: PersistedNote[] = await notesResponse.json();
          const loadedNotes = data.map((note) => toStickyNote(note));
          setNotes((current) => {
            const currentById = new Map(current.map((note) => [note.id, note]));
            const loadedIds = new Set(loadedNotes.map((note) => note.id));

            return [
              ...loadedNotes.map((note) => currentById.get(note.id) ?? note),
              ...current.filter((note) => !loadedIds.has(note.id)),
            ];
          });
        }
        if (strokesResponse.ok) {
          const data: CanvasStroke[] = await strokesResponse.json();
          const loadedStrokes = data.map(toCanvasStroke);
          setStrokes((current) => {
            const currentById = new Map(current.map((stroke) => [stroke.id, stroke]));
            const loadedIds = new Set(loadedStrokes.map((stroke) => stroke.id));

            return [
              ...loadedStrokes.map((stroke) => currentById.get(stroke.id) ?? stroke),
              ...current.filter((stroke) => !loadedIds.has(stroke.id)),
            ];
          });
        }
      } catch {}
    }
    loadData();
  }, [roomStatus, normalizedCode]);

  useEffect(() => {
    if (roomStatus !== "active") return;

    previousOthersRef.current = null;

    const { room, leave } = liveblocksClient.enterRoom<
      Record<string, never>,
      Record<string, never>,
      RoomEvent
    >(
      normalizedCode,
      { initialPresence: {} }
    );
    liveRoomRef.current = room;

    const unsubscribe = room.subscribe("event", ({ event }) => {
      if (event.type === "stroke:create") {
        setLastActivityAt(Date.now());
        const incoming = toCanvasStroke(event.stroke);
        setStrokes((previous) =>
          previous.some((stroke) => stroke.id === incoming.id)
            ? previous
            : [...previous, incoming]
        );
      }

      if (event.type === "stroke:delete") {
        setLastActivityAt(Date.now());
        setStrokes((previous) =>
          previous.filter((stroke) => stroke.id !== event.stroke.id)
        );
      }

      if (event.type === "note:create" || event.type === "note:update") {
        setLastActivityAt(Date.now());
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
        setLastActivityAt(Date.now());
        setNotes((prev) => prev.filter((note) => note.id !== event.note.id));
      }

      if (event.type === "chat:message") {
        setLastActivityAt(Date.now());
        const incoming: Message = {
          id: `${event.message.authorId}-${event.message.sentAt}`,
          author: event.message.author,
          text: event.message.text,
          time: new Date(event.message.sentAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((previous) =>
          previous.some((message) => message.id === incoming.id)
            ? previous
            : [...previous, incoming]
        );
      }
    });
    const unsubscribeOthers = room.subscribe("others", (others) => {
      const currentOthers = new Map(
        others.map((other) => {
          const participantName = other.info?.name;
          const displayName =
            typeof participantName === "string" && participantName.trim()
              ? participantName
              : "Guest";
          return [String(other.connectionId), displayName] as const;
        })
      );
      const previousOthers = previousOthersRef.current;

      if (previousOthers) {
        const joinedNames = [...currentOthers.entries()]
          .filter(([connectionId]) => !previousOthers.has(connectionId))
          .map(([, participantName]) => participantName);
        const leftNames = [...previousOthers.entries()]
          .filter(([connectionId]) => !currentOthers.has(connectionId))
          .map(([, participantName]) => participantName);

        if (joinedNames.length > 0) {
          setPresenceNotice(
            joinedNames.length === 1
              ? `${joinedNames[0]} joined the canvas`
              : `${joinedNames.length} people joined the canvas`
          );
        } else if (leftNames.length > 0) {
          setPresenceNotice(
            leftNames.length === 1
              ? `${leftNames[0]} left the canvas`
              : `${leftNames.length} people left the canvas`
          );
        }
      }

      previousOthersRef.current = currentOthers;
      setParticipantCount(others.length + 1);
      setOtherParticipantNames([...currentOthers.values()]);
    });

    return () => {
      unsubscribe();
      unsubscribeOthers();
      if (liveRoomRef.current === room) liveRoomRef.current = null;
      previousOthersRef.current = null;
      leave();
    };
  }, [roomStatus, normalizedCode, liveblocksClient]);

  const renderCanvas = useCallback((preview?: CanvasStroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!canvas.clientWidth || !canvas.clientHeight) return;

    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * pixelRatio);
    const height = Math.round(canvas.clientHeight * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(width / boardWidth, 0, 0, height / boardHeight, 0, 0);
    context.clearRect(0, 0, boardWidth, boardHeight);
    strokes.forEach((stroke) => drawStroke(context, stroke));
    if (preview) drawStroke(context, preview);
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderCanvas();
    const observer = new ResizeObserver(() => renderCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderCanvas, roomStatus]);

  const toBoardPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;

    return {
      x: Math.min(boardWidth, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * boardWidth)),
      y: Math.min(boardHeight, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * boardHeight)),
    };
  };

  const updateBrushCursor = useCallback(
    (clientX: number, clientY: number, show = true) => {
      brushCursorPositionRef.current = { x: clientX, y: clientY };

      const cursor = brushCursorRef.current;
      const canvas = canvasRef.current;
      if (!cursor || !canvas) return;

      const bounds = canvas.getBoundingClientRect();
      const areaBounds = canvasAreaRef.current?.getBoundingClientRect();
      const screenScale = bounds.width > 0 ? bounds.width / boardWidth : 1;
      const size = Math.max(8, brushThickness * screenScale);
      cursor.style.left = `${clientX - (areaBounds?.left ?? 0)}px`;
      cursor.style.top = `${clientY - (areaBounds?.top ?? 0)}px`;
      cursor.style.width = `${size}px`;
      cursor.style.height = `${size}px`;
      if (show) cursor.style.opacity = "1";
    },
    [brushThickness]
  );

  useEffect(() => {
    const position = brushCursorPositionRef.current;
    if (!position || !brushCursorRef.current) return;
    updateBrushCursor(position.x, position.y, false);
  }, [boardPan.x, boardPan.y, brushThickness, updateBrushCursor, zoom]);

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool !== "draw" || event.button !== 0) return;
    const point = toBoardPoint(event);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: CanvasStroke = {
      id: `pending-${event.pointerId}`,
      roomId: normalizedCode,
      points: [point],
      color: isErasing ? "eraser" : brushColor,
      thickness: brushThickness,
      authorId: sessionId,
      createdAt: new Date().toISOString(),
    };
    activeStrokeRef.current = { pointerId: event.pointerId, stroke };
    renderCanvas(stroke);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = toBoardPoint(event);
    if (!point) return;

    const previous = active.stroke.points.at(-1);
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1) return;
    active.stroke.points.push(point);
    renderCanvas(active.stroke);
  };

  const finishStroke = async (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeStrokeRef.current = null;

    try {
      const response = await saveRequest(`/api/rooms/${normalizedCode}/strokes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: active.stroke.points,
          color: active.stroke.color,
          thickness: active.stroke.thickness,
          authorId: sessionId,
        }),
      });
      if (!response.ok) throw new Error(await response.text());

      const saved: CanvasStroke = toCanvasStroke(await response.json());
      setStrokes((previous) =>
        previous.some((stroke) => stroke.id === saved.id)
          ? previous
          : [...previous, saved]
      );
      setUndoneStrokes([]);
      setLastActivityAt(() => Date.now());
    } catch (error) {
      console.error("Could not save drawing:", error);
      renderCanvas();
    }
  };

  const cancelStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activeStrokeRef.current = null;
    renderCanvas();
  };

  const startPan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool !== "pan" || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    boardPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: boardPan.x,
      startY: boardPan.y,
    };
  };

  const continuePan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = boardPanRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setBoardPan({
      x: active.startX + event.clientX - active.startClientX,
      y: active.startY + event.clientY - active.startClientY,
    });
  };

  const finishPan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = boardPanRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    boardPanRef.current = null;
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "draw") {
      setBrushCursorActive(true);
      updateBrushCursor(event.clientX, event.clientY);
      startStroke(event);
    }
    if (tool === "pan") startPan(event);
    if (tool === "note") {
      const point = toBoardPoint(event);
      if (point) void addNote(point);
    }
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "draw") {
      setBrushCursorActive(true);
      updateBrushCursor(event.clientX, event.clientY);
      continueStroke(event);
    }
    if (tool === "pan") continuePan(event);
  };

  const handleCanvasPointerEnter = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "draw") {
      setBrushCursorActive(true);
      updateBrushCursor(event.clientX, event.clientY);
    }
  };

  const handleCanvasPointerLeave = () => {
    setBrushCursorActive(false);
    if (brushCursorRef.current) brushCursorRef.current.style.opacity = "0";
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "draw") void finishStroke(event);
    if (tool === "pan") finishPan(event);
  };

  const handleCanvasPointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "draw") cancelStroke(event);
    if (tool === "pan") finishPan(event);
  };

  const addNote = async (point?: Point) => {
    const draft = {
      text: "New thought",
      color: noteColor,
      x: point
        ? clampNotePosition((point.x / boardWidth) * 100, 85)
        : Math.round(40 + Math.random() * 20),
      y: point
        ? clampNotePosition((point.y / boardHeight) * 100, 80)
        : Math.round(30 + Math.random() * 20),
      rotate: Math.random() * 4 - 2,
    };

    try {
      const res = await saveRequest(`/api/rooms/${normalizedCode}/notes`, {
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
      setLastActivityAt(() => Date.now());
    } catch (error) {
      console.error("Could not create note:", error);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const res = await saveRequest(`/api/rooms/${normalizedCode}/notes/${id}?authorId=${sessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      setNotes((prev) => prev.filter((note) => note.id !== id));
      setSelectedNoteId((selectedId) => selectedId === id ? null : selectedId);
      setLastActivityAt(Date.now());
    } catch (error) {
      console.error("Could not delete note:", error);
    }
  };

  const saveNotePosition = async (drag: NoteDrag) => {
    try {
      const res = await saveRequest(`/api/rooms/${normalizedCode}/notes/${drag.id}`, {
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
      setLastActivityAt(() => Date.now());
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
      const res = await saveRequest(`/api/rooms/${normalizedCode}/notes/${id}`, {
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
      setLastActivityAt(() => Date.now());
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

  const undoLastStroke = async () => {
    const stroke = [...strokes]
      .reverse()
      .find((candidate) => candidate.authorId === sessionId);
    if (!stroke) return;

    try {
      const response = await saveRequest(
        `/api/rooms/${normalizedCode}/strokes/${stroke.id}?authorId=${sessionId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error(await response.text());

      setStrokes((previous) => previous.filter((candidate) => candidate.id !== stroke.id));
      setUndoneStrokes((previous) => [...previous, stroke]);
      setLastActivityAt(Date.now());
    } catch (error) {
      console.error("Could not undo drawing:", error);
    }
  };

  const redoLastStroke = async () => {
    const stroke = undoneStrokes.at(-1);
    if (!stroke) return;

    try {
      const response = await saveRequest(`/api/rooms/${normalizedCode}/strokes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: stroke.points,
          color: stroke.color,
          thickness: stroke.thickness,
          authorId: sessionId,
        }),
      });
      if (!response.ok) throw new Error(await response.text());

      const saved = toCanvasStroke(await response.json() as CanvasStroke);
      setStrokes((previous) =>
        previous.some((candidate) => candidate.id === saved.id)
          ? previous
          : [...previous, saved]
      );
      setUndoneStrokes((previous) => previous.slice(0, -1));
      setLastActivityAt(Date.now());
    } catch (error) {
      console.error("Could not redo drawing:", error);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPng = (includeNotes: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = boardWidth;
    canvas.height = boardHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#faf6ff";
    context.fillRect(0, 0, boardWidth, boardHeight);
    strokes.forEach((stroke) => drawStroke(context, stroke, "#faf6ff"));

    if (includeNotes) {
      const noteWidth = 260;
      const noteHeight = 260;
      for (const note of notes) {
        const x = (note.x / 100) * boardWidth;
        const y = (note.y / 100) * boardHeight;
        context.save();
        context.translate(x + noteWidth / 2, y + noteHeight / 2);
        context.rotate((note.rotate * Math.PI) / 180);
        context.fillStyle = noteExportColors[note.color];
        context.fillRect(-noteWidth / 2, -noteHeight / 2, noteWidth, noteHeight);
        context.fillStyle = "#3a2060";
        context.font = "28px Kalam, cursive";
        context.textBaseline = "top";

        const words = note.text.split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (context.measureText(candidate).width > noteWidth - 40 && line) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        if (line) lines.push(line);
        lines.slice(0, 7).forEach((line, index) => {
          context.fillText(line, -noteWidth / 2 + 20, -noteHeight / 2 + 32 + index * 34);
        });
        context.restore();
      }
    }

    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${roomName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "huddle"}${includeNotes ? "-with-notes" : ""}.png`);
      }
    }, "image/png");
  };

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    const now = new Date();
    const chatMessage = {
      authorId: sessionId,
      author: name,
      text: clean,
      sentAt: now.toISOString(),
    };
    setMessages((prev) => [
      ...prev,
      {
        id: `${chatMessage.authorId}-${chatMessage.sentAt}`,
        author: chatMessage.author,
        text: chatMessage.text,
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    try {
      liveRoomRef.current?.broadcastEvent({ type: "chat:message", message: chatMessage });
    } catch (error) {
      console.error("Could not send chat message:", error);
    }
    setLastActivityAt(Date.now());
    void saveRequest(`/api/rooms/${normalizedCode}`).catch(() => undefined);
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
            </div>
            <p className="text-[11px] text-muted-foreground">
              {pendingSaves > 0 ? "Saving..." : "✓ Saved"}
            </p>
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
          <div className="flex -space-x-2">
            {participantNames.slice(0, 3).map((participantName, index) => (
              <span
                key={`${participantName}-${index}`}
                title={participantName}
                className={cn(
                  "grid size-8 place-items-center rounded-full border-2 border-chrome text-[10px] font-bold text-white",
                  ["bg-avatar-one", "bg-avatar-two", "bg-avatar-three"][index]
                )}
              >
                {toInitials(participantName)}
              </span>
            ))}
            {participantNames.length > 3 && (
              <span className="grid size-8 place-items-center rounded-full border-2 border-chrome bg-primary text-[10px] font-bold text-primary-foreground">
                +{participantNames.length - 3}
              </span>
            )}
          </div>

          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Share2 /> <span className="hidden sm:inline">Invite</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={leaveCanvas}
            aria-label="Leave canvas"
            title="Leave canvas"
          >
            <LogOut /> <span className="hidden lg:inline">Leave</span>
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

      {presenceNotice && (
        <div
          className="pointer-events-none absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full border border-border bg-chrome/95 px-4 py-2 text-xs font-semibold text-foreground shadow-paper"
          role="status"
          aria-live="polite"
        >
          {presenceNotice}
        </div>
      )}

      {/* Canvas area */}
      <section
        ref={canvasAreaRef}
        className="dot-grid relative h-[calc(100dvh-4rem)] overflow-hidden"
        aria-label="Collaborative canvas"
      >
        <div className="canvas-board-frame">
          <div
            className="absolute inset-0 origin-center transition-transform duration-200"
            style={{
              transform: `translate(${boardPan.x}px, ${boardPan.y}px) scale(${zoom / 100})`,
            }}
          >
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 size-full touch-none",
            tool === "draw"
              ? brushCursorActive ? "cursor-none" : "cursor-crosshair"
              : tool === "pan"
                ? "cursor-grab"
                : tool === "note"
                  ? "cursor-copy"
                  : "pointer-events-none"
          )}
          aria-label="Drawing surface"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerEnter={handleCanvasPointerEnter}
          onPointerLeave={handleCanvasPointerLeave}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
        />

        {/* Notes layer */}
        {showNotes && (
        <div
          className="pointer-events-none absolute inset-0"
        >
          {notes.map((note) => (
            <article
              key={note.id}
              className={cn(
                "pointer-events-auto group absolute flex aspect-square w-40 items-start p-5 font-note text-base leading-snug shadow-note transition-transform",
                tool === "pan" && "pointer-events-none",
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
                value={noteDrafts[note.id] ?? note.text}
                placeholder="Write something..."
                readOnly={note.authorId !== sessionId}
                onFocus={() => setSelectedNoteId(note.id)}
                onChange={(event) => {
                  if (note.authorId !== sessionId) return;
                  const draftText = event.currentTarget.value;
                  setNoteDrafts((drafts) => ({
                    ...drafts,
                    [note.id]: draftText,
                  }));
                }}
                onBlur={async (e) => {
                  const newText = e.currentTarget.value.trim();

                  if (!newText || newText === note.text) {
                    setNoteDrafts((drafts) => {
                      const nextDrafts = { ...drafts };
                      delete nextDrafts[note.id];
                      return nextDrafts;
                    });
                    return;
                  }

                  try {
                    const res = await saveRequest(
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
                    setLastActivityAt(Date.now());
                    setNoteDrafts((drafts) => {
                      const nextDrafts = { ...drafts };
                      delete nextDrafts[note.id];
                      return nextDrafts;
                    });
                  } catch (error) {
                    console.error("Could not save note:", error);
                    setNoteDrafts((drafts) => {
                      const nextDrafts = { ...drafts };
                      delete nextDrafts[note.id];
                      return nextDrafts;
                    });
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
        )}
          </div>
        </div>

        {tool === "draw" && (
          <div
            ref={brushCursorRef}
            className={cn(
              "pointer-events-none absolute z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-current",
              isErasing ? "bg-transparent" : "bg-current/10"
            )}
            style={{
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              opacity: 0,
              color: isErasing ? "var(--foreground)" : brushColor,
            }}
            aria-hidden="true"
          >
            {!isErasing && (
              <span className="font-mono text-xs font-bold leading-none">+</span>
            )}
          </div>
        )}

        {/* Zoom controls — bottom left */}
        <div className="floating-control absolute bottom-20 left-3 flex items-center gap-0 p-0.5 md:bottom-6 md:left-4 md:gap-1 md:p-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 md:size-9"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(60, z - 10))}
          >
            <ZoomOut />
          </Button>
          <span className="hidden w-11 text-center text-xs font-semibold md:block">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 md:size-9"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(160, z + 10))}
          >
            <ZoomIn />
          </Button>
        </div>

        {/* Main toolbar — bottom center */}
        <div className="floating-control absolute bottom-5 left-1/2 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0 overflow-x-auto p-1 md:bottom-6 md:w-auto md:max-w-none md:gap-1 md:p-1.5">
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
              className="size-7 shrink-0 md:size-9"
              aria-label={label}
              title={label}
              onClick={() => {
                setTool(value);
                if (value !== "draw") {
                  setBrushSizeOpen(false);
                  setBrushSizePanelPosition(null);
                  setBrushCursorActive(false);
                }
              }}
            >
              <Icon />
            </Button>
          ))}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border md:mx-1 md:h-6" />
          <div
            className="flex gap-0 px-0.5 md:gap-1 md:px-1"
            aria-label={tool === "draw" ? "Brush color" : "Note color"}
          >
            {(["yellow", "pink", "mint", "blue"] as NoteColor[]).map((c) => (
              <button
                key={c}
                aria-label={`${c} ${tool === "draw" ? "ink" : "note"}`}
                title={`${c} ${tool === "draw" ? "ink" : "note"}`}
                onClick={() => {
                  if (tool === "draw") {
                    setBrushColor(brushPalette[c]);
                    setIsErasing(false);
                  } else {
                    setNoteColor(c);
                    if (selectedNoteId) void updateNoteColor(selectedNoteId, c);
                  }
                }}
                className={cn(
                  "size-4 shrink-0 rounded-full border-2 border-chrome ring-offset-1 ring-offset-chrome transition-transform active:scale-95 md:size-5 md:ring-offset-2",
                  `swatch-${c}`,
                  (tool === "draw"
                    ? brushColor === brushPalette[c] && !isErasing
                    : noteColor === c) && "ring-2 ring-ring"
                )}
              />
            ))}
          </div>
          {tool === "draw" && (
            <>
              <div className="flex items-center gap-0 px-0.5 md:gap-1 md:px-1" aria-label="Brush size">
                <Button
                  ref={brushSizeButtonRef}
                  variant={brushSizeOpen ? "toolActive" : "ghost"}
                  size="icon"
                  className="size-7 shrink-0 md:size-9"
                  aria-expanded={brushSizeOpen}
                  aria-controls="brush-size-panel"
                  aria-label={`${isErasing ? "Eraser" : "Brush"} size ${brushPercent}%`}
                  title={`${isErasing ? "Eraser" : "Brush"} size ${brushPercent}%`}
                  onClick={toggleBrushSize}
                >
                  <span
                    className={cn(
                      "relative grid place-items-center rounded-full transition-all",
                      isErasing ? "border-2 border-current" : "bg-current"
                    )}
                    style={{ width: brushTipSize, height: brushTipSize }}
                    aria-hidden="true"
                  />
                </Button>
              </div>
              <Button
                variant={isErasing ? "toolActive" : "ghost"}
                size="icon"
                className="size-7 shrink-0 md:size-9"
                aria-label="Eraser"
                title="Eraser"
                onClick={() => setIsErasing((active) => !active)}
              >
                <Eraser />
              </Button>
            </>
          )}
          <Button className="size-7 shrink-0 md:size-9" size="icon" onClick={() => void addNote()} aria-label="Add sticky note">
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 md:size-9"
            aria-label={showNotes ? "Hide sticky notes" : "Show sticky notes"}
            title={showNotes ? "Hide sticky notes" : "Show sticky notes"}
            onClick={() => setShowNotes((visible) => !visible)}
          >
            {showNotes ? <EyeOff /> : <Eye />}
          </Button>
        </div>

        {/* Right controls — bottom right */}
        <div className="floating-control absolute bottom-5 right-3 hidden items-center gap-1 p-1.5 md:bottom-6 md:right-4 md:flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo your last drawing"
            title="Undo your last drawing"
            disabled={!strokes.some((stroke) => stroke.authorId === sessionId)}
            onClick={() => void undoLastStroke()}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo your last drawing"
            title="Redo your last drawing"
            disabled={undoneStrokes.length === 0}
            onClick={() => void redoLastStroke()}
          >
            <Redo2 />
          </Button>
          <span className="mx-1 h-6 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Export board"
            title="Export board"
            onClick={() => setExportOpen(true)}
          >
            <Download />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${participantCount} ${participantCount === 1 ? "person" : "people"} in room`}
            title={`${participantCount} ${participantCount === 1 ? "person" : "people"} in room`}
            onClick={() => setPeopleOpen(true)}
          >
            <Users />
          </Button>
          <Button
            variant={chatOpen ? "toolActive" : "ghost"}
            size="icon"
            aria-label="Open chat"
            onClick={() => setChatOpen((v) => !v)}
          >
            <MessageCircle />
          </Button>
        </div>

        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent className="max-w-sm rounded-lg border-0 p-7 shadow-paper">
            <DialogHeader>
              <DialogTitle className="font-mono text-2xl">Export huddle</DialogTitle>
              <DialogDescription>
                Save the board before this temporary room disappears.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button onClick={() => exportPng(false)}>Board as PNG</Button>
              <Button onClick={() => exportPng(true)}>Board and notes as PNG</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={peopleOpen} onOpenChange={setPeopleOpen}>
          <DialogContent className="max-w-sm rounded-lg border-0 p-7 shadow-paper">
            <DialogHeader>
              <DialogTitle className="font-mono text-2xl">In this huddle</DialogTitle>
              <DialogDescription>
                Presence updates live while this room is open.
              </DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2">
              <li className="flex items-center justify-between rounded-md bg-secondary p-3 text-sm">
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">You</span>
              </li>
              {otherParticipantNames.map((participantName, index) => (
                <li
                  key={`${participantName}-${index}`}
                  className="rounded-md bg-secondary p-3 text-sm"
                >
                  {participantName}
                </li>
              ))}
              {participantCount === 1 && (
                <li className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  Invite someone when you’re ready.
                </li>
              )}
            </ul>
          </DialogContent>
        </Dialog>

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

      {tool === "draw" && brushSizeOpen && brushSizePanelPosition && typeof document !== "undefined" &&
        createPortal(
          <div
            id="brush-size-panel"
            className="floating-control fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-2 whitespace-nowrap px-3 py-2"
            style={{
              left: brushSizePanelPosition.left,
              top: brushSizePanelPosition.top,
            }}
            role="group"
            aria-label="Brush size percentage"
          >
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={brushPercent}
              onChange={(event) => setBrushPercent(Number(event.currentTarget.value))}
              aria-label={`${isErasing ? "Eraser" : "Brush"} size ${brushPercent}%`}
              aria-valuetext={`${brushPercent}%`}
              title={`${isErasing ? "Eraser" : "Brush"} size ${brushPercent}%`}
              className="h-2 w-24 cursor-pointer accent-primary"
            />
            <span className="w-8 text-right text-[10px] font-semibold tabular-nums">
              {brushPercent}%
            </span>
          </div>,
          document.body
        )}
    </main>
  );
}
