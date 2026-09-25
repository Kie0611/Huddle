"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Clock3, MousePointer2, Pencil,
  Plus, Share2, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type EntryMode = "create" | "join" | null;

function HuddleMark() {
  return (
    <div className="grid size-8 place-items-center rounded-sm bg-primary font-mono text-sm font-bold text-primary-foreground">
      H
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="relative mx-auto mt-12 w-full max-w-5xl overflow-hidden rounded-md border border-border bg-canvas shadow-paper">
      <div className="flex h-11 items-center justify-between border-b border-border bg-chrome px-3 text-[10px] md:px-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-destructive" />
          <span className="size-2 rounded-full" style={{ background: "var(--avatar-one)" }} />
          <span className="size-2 rounded-full bg-presence" />
        </div>
        <span className="font-semibold">FRIDAY BRAINSTORM</span>
        <span className="text-muted-foreground">3 HERE</span>
      </div>
      <div className="dot-grid relative h-85 md:h-120">
        <div className="absolute left-[6%] top-[11%] max-w-56 text-left md:max-w-72">
          <p className="font-note text-lg font-bold leading-snug md:text-3xl">
            How can planning feel lighter?
          </p>
          <span className="mt-2 block h-1 w-12 bg-accent" />
        </div>
        <div className="note-yellow absolute left-[12%] top-[46%] flex aspect-square w-24 -rotate-2 items-start p-3 font-note text-sm shadow-note md:left-[20%] md:top-[42%] md:w-32 md:p-4 md:text-base">
          Clear enough to start now
        </div>
        <div className="note-pink absolute right-[8%] top-[24%] flex aspect-square w-24 rotate-2 items-start p-3 font-note text-sm shadow-note md:right-[20%] md:w-36 md:p-4 md:text-base">
          Everyone adds one idea
        </div>
        <div className="note-mint absolute bottom-[9%] left-[52%] flex aspect-square w-24 -rotate-1 items-start p-3 font-note text-sm shadow-note md:w-36 md:p-4 md:text-base">
          Decide before the timer ends
        </div>
        <div className="floating-control absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 p-1.5">
          <span className="grid size-7 place-items-center">
            <MousePointer2 className="size-3.5" />
          </span>
          <span className="grid size-7 place-items-center bg-accent text-accent-foreground rounded">
            <Pencil className="size-3.5" />
          </span>
          <span className="grid size-7 place-items-center">
            <StickyNote className="size-3.5" />
          </span>
          <span className="h-5 w-px bg-border" />
          <span className="grid size-7 place-items-center bg-primary text-primary-foreground rounded">
            <Plus className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HuddleHome() {
  const router = useRouter();
  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [createName, setCreateName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName.trim() }),
      });

      if (!res.ok) throw new Error("Failed to create room");

      const { code } = await res.json();
      const params = new URLSearchParams({
        name: createName.trim() || "Guest",
        room: roomName.trim() || "Untitled huddle",
      });
      router.push(`/room/${code}?${params}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const code = roomCode.trim().toUpperCase();

    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (res.status === 404) {
        setError("Room not found or has expired.");
        return;
      }
      if (!res.ok) throw new Error("Failed to join room");

      const data = await res.json();
      const params = new URLSearchParams({
        name: joinName.trim() || "Guest",
        room: data.name,
      });
      router.push(`/room/${code}?${params}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <header className="border-b border-border bg-chrome">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-7">
          <div className="flex items-center gap-2.5 font-mono text-sm font-bold">
            <HuddleMark /> Huddle
          </div>
          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">how it works</a>
            <a href="#use-cases" className="hover:text-foreground">use cases</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEntryMode("join"); setError(""); }}>
              Join
            </Button>
            <Button size="sm" onClick={() => { setEntryMode("create"); setError(""); }}>
              <Plus /> Create room
            </Button>
          </div>
        </div>
      </header>

      <section id="top" className="grid-bg px-4 pb-20 pt-20 text-center md:pb-28 md:pt-28">
        <p className="text-xs font-bold uppercase text-accent-ink md:text-sm">
          TEMPORARY COLLABORATIVE CANVAS
        </p>
        <h1 className="mx-auto mt-5 max-w-4xl font-mono text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Think together. Keep only what matters.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Open a room, share the code, and work visually. No accounts and no permanent clutter.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => { setEntryMode("create"); setError(""); }}>
            <Plus /> Create room
          </Button>
          <Button size="lg" variant="outline" onClick={() => { setEntryMode("join"); setError(""); }}>
            Join room <ArrowRight />
          </Button>
        </div>
        <WorkspacePreview />
      </section>

      <section id="how-it-works" className="border-y border-border bg-chrome px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-lg font-mono text-3xl font-bold md:text-4xl">
            From blank canvas to shared direction.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
            {[
              [Plus, "Create", "Name the room and open a fresh canvas in seconds."],
              [Share2, "Share", "Send the room code. Teammates join without an account."],
              [Pencil, "Work", "Sketch, add notes, chat, and decide while the room is active."],
            ].map(([Icon, title, copy]) => {
              const StepIcon = Icon as typeof Plus;
              return (
                <article key={title as string} className="bg-background p-6 text-left md:p-8">
                  <StepIcon className="size-5 text-accent-ink" />
                  <h3 className="mt-8 font-mono text-xl font-bold">{title as string}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="use-cases" className="px-4 py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[0.8fr_1.2fr] md:items-start">
          <div>
            <h2 className="font-mono text-3xl font-bold md:text-4xl">
              Useful whenever the conversation needs a surface.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Start quickly, work together, then let the room clear itself.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Fast brainstorms", "Remote workshops", "Weekly planning", "Visual reviews"].map((item, index) => (
              <article
                key={item}
                className={`min-h-36 rounded-md border border-border p-5 ${
                  index === 0 || index === 3 ? "bg-accent text-accent-foreground" : "bg-chrome"
                }`}
              >
                <span className={`text-[10px] font-bold ${index === 0 || index === 3 ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
                  0{index + 1}
                </span>
                <h3 className="mt-12 font-mono text-lg font-bold">{item}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary px-4 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex gap-4">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-accent-ink" />
            <div>
              <h2 className="font-mono text-lg font-bold">Built to disappear.</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Rooms auto-delete after one hour of inactivity.
              </p>
            </div>
          </div>
          <Button onClick={() => { setEntryMode("create"); setError(""); }}>
            Create room <ArrowRight />
          </Button>
        </div>
      </section>

      <footer className="bg-chrome px-4 py-7 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="flex items-center gap-2 font-bold text-foreground">
            <HuddleMark /> Huddle
          </span>
          <span>Temporary by design.</span>
        </div>
      </footer>

      <Dialog open={entryMode !== null} onOpenChange={(open) => { if (!open) { setEntryMode(null); setError(""); } }}>
        <DialogContent className="max-w-md rounded-md p-0 shadow-paper">
          <div className="border-b border-border p-6">
            <DialogHeader>
              <DialogTitle className="font-mono text-2xl font-bold">
                {entryMode === "join" ? "Join a room" : "Create a room"}
              </DialogTitle>
              <DialogDescription>
                {entryMode === "join"
                  ? "Enter the code someone shared with you."
                  : "Set up a temporary canvas for your group."}
              </DialogDescription>
            </DialogHeader>
          </div>

          {error && (
            <p className="px-6 pt-4 text-sm text-destructive">{error}</p>
          )}

          {entryMode === "join" ? (
            <form onSubmit={joinRoom} className="grid gap-5 p-6 pt-2">
              <label className="grid gap-2 text-xs font-bold">
                Room code
                <Input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.slice(0, 8))}
                  placeholder="ENTER 8-CHARACTER CODE"
                  className="uppercase"
                  required
                />
              </label>
              <label className="grid gap-2 text-xs font-bold">
                Your name
                <Input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="What should we call you?"
                  required
                />
              </label>
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
                {loading ? "Joining..." : "Join room"} <ArrowRight />
              </Button>
            </form>
          ) : (
            <form onSubmit={createRoom} className="grid gap-5 p-6 pt-2">
              <label className="grid gap-2 text-xs font-bold">
                Your name
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="What should we call you?"
                  required
                />
              </label>
              <label className="grid gap-2 text-xs font-bold">
                Room name
                <Input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Friday brainstorm"
                  required
                />
              </label>
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
                {loading ? "Creating..." : "Create room"} <ArrowRight />
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}