"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight, ArrowRight, Clock3, MousePointer2,
  Pencil, Plus, Share2, StickyNote,
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
    <div className="grid size-9 rotate-[-4deg] place-items-center rounded-sm bg-landing-pop font-display text-sm font-bold text-landing-ink shadow-playful">
      H
    </div>
  );
}

function WorkspaceScene() {
  return (
    <div
      className="landing-workspace relative mx-auto w-full max-w-170 rotate-[1.5deg] overflow-hidden rounded-md border-2 border-landing-ink bg-canvas text-landing-ink shadow-playful-lg"
      aria-label="Preview of a Huddle workspace"
    >
      <div className="flex h-11 items-center justify-between border-b-2 border-landing-ink bg-chrome px-3 text-[9px] font-bold sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" />
          <span className="size-2 rounded-full bg-landing-pop" />
          <span className="size-2 rounded-full bg-presence" />
        </div>
        <span>FRIDAY BRAINSTORM</span>
        <span className="text-muted-foreground">3 HERE</span>
      </div>
      <div className="dot-grid relative h-72.5 sm:h-90">
        <div className="absolute left-[7%] top-[9%] max-w-44 text-left sm:max-w-64">
          <p className="font-display text-xl font-bold leading-tight sm:text-3xl">
            How can planning feel lighter?
          </p>
          <span className="mt-2 block h-1.5 w-14 bg-landing-pop" />
        </div>
        <div className="note-yellow absolute bottom-[15%] left-[10%] flex aspect-square w-24 rotate-[-5deg] items-start p-3 font-note text-sm shadow-note sm:left-[20%] sm:w-28">
          Clear enough to start now
        </div>
        <div className="note-pink absolute right-[7%] top-[19%] flex aspect-square w-24 rotate-[4deg] items-start p-3 font-note text-sm shadow-note sm:right-[15%] sm:w-28">
          Everyone adds one idea
        </div>
        <div className="note-mint absolute bottom-[10%] right-[22%] hidden aspect-square w-24 rotate-2 items-start p-3 font-note text-sm shadow-note sm:flex">
          Decide before time runs out
        </div>
        <div className="floating-control absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 p-1.5">
          <span className="grid size-7 place-items-center"><MousePointer2 className="size-3.5" /></span>
          <span className="grid size-7 place-items-center bg-primary text-primary-foreground rounded"><Pencil className="size-3.5" /></span>
          <span className="grid size-7 place-items-center"><StickyNote className="size-3.5" /></span>
          <span className="h-5 w-px bg-border" />
          <span className="grid size-7 place-items-center rounded bg-landing-pop text-landing-ink"><Plus className="size-3.5" /></span>
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
      if (!res.ok) throw new Error();
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
    // nanoid room codes are case-sensitive, so preserve the code exactly as
    // the inviter shared it instead of normalizing it.
    const code = roomCode.trim();
    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (res.status === 404) { setError("Room not found or has expired."); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      const params = new URLSearchParams({
        name: joinName.trim() || "Guest",
        room: data.name,
      });
      router.push(`/room/${code}?${params}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (!err?.message?.includes("404")) setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="landing-page min-h-dvh overflow-hidden bg-landing-soft font-sans text-landing-ink">

      {/* Hero — dark */}
      <section id="top" className="relative bg-landing-ink text-landing-soft">
        <header className="relative z-30 mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="#top" className="flex items-center gap-3 font-display text-lg font-bold">
            <HuddleMark /> Huddle
          </a>
          <nav className="hidden items-center gap-7 text-sm sm:flex" aria-label="Landing page navigation">
            <a href="#how-it-works" className="transition-colors hover:text-landing-pop">How it works</a>
            <a href="#use-cases" className="transition-colors hover:text-landing-pop">Use cases</a>
          </nav>
          <Button size="sm" variant="landingSoft" onClick={() => { setEntryMode("join"); setError(""); }}>
            Join room
          </Button>
        </header>

        <div className="relative mx-auto grid min-h-[calc(92svh-4rem)] max-w-7xl gap-10 px-5 pb-20 pt-9 lg:min-h-[min(760px,calc(92svh-4rem))] lg:grid-cols-[0.84fr_1.16fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-12">
          <div className="relative z-20 max-w-2xl">
            <h1 className="font-display text-5xl font-bold leading-[0.98] sm:text-6xl lg:text-7xl">
              Make a mess.<br />
              <span className="text-landing-pop">Find the idea.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-landing-soft/75 sm:text-lg">
              A temporary canvas for the thoughts that need other people. Sketch, stick, react, decide — then leave the clutter behind.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="landingPop" onClick={() => { setEntryMode("create"); setError(""); }}>
                <Plus /> Create room
              </Button>
              <Button size="lg" variant="landingOutline" onClick={() => { setEntryMode("join"); setError(""); }}>
                Join with a code <ArrowRight />
              </Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-landing-soft/60">
              <Clock3 className="size-4 text-landing-pop" /> No account. Rooms clear after one quiet hour.
            </p>
          </div>

          <div className="relative z-10 pb-4 pt-3 lg:translate-x-5">
            <div className="landing-float absolute -left-2 top-0 z-20 rotate-[-8deg] rounded-sm border-2 border-landing-ink bg-landing-pop px-4 py-3 font-display text-xs font-bold text-landing-ink shadow-playful sm:-left-8 sm:top-5">
              LIVE IDEAS →
            </div>
            <WorkspaceScene />
            <div className="landing-float-delayed absolute -bottom-2 right-1 z-20 w-36 rotate-[5deg] border-2 border-landing-ink bg-landing-teal p-3 text-sm font-bold text-landing-soft shadow-playful sm:right-2.5 sm:w-44">
              &quot;Wait — that&rsquo;s the one.&quot;
            </div>
            <div className="absolute -right-4 -top-7 hidden size-20 rotate-12 place-items-center rounded-full border-2 border-landing-pop bg-landing-ink text-landing-pop sm:grid">
              <MousePointer2 className="size-8" />
            </div>
          </div>
          <a
            href="#how-it-works"
            aria-label="See how Huddle works"
            className="absolute bottom-5 left-1/2 z-20 grid size-11 -translate-x-1/2 place-items-center rounded-full border-2 border-landing-soft/40 text-landing-pop transition-transform hover:translate-y-1"
          >
            <ArrowDownRight />
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative px-5 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <p className="font-display text-xs font-bold uppercase text-landing-teal">
                From scattered to shared
              </p>
              <h2 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">
                Three moves.<br />One clear direction.
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-relaxed text-landing-ink/70 lg:justify-self-end">
              Huddle gets out of the way so your group can get into the work. Nothing to set up, nothing to maintain.
            </p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-0">
            {([
              [Plus, "01", "Open it", "Name the session and get a fresh canvas before the energy disappears.", "step-pop", "rotate-[-1deg]"],
              [Share2, "02", "Pass it", "Send one room code. Everyone arrives without creating an account.", "step-teal", "translate-y-8 rotate-[1deg]"],
              [Pencil, "03", "Shape it", "Sketch, stack notes, chat, and turn the room into a decision.", "step-ink", "translate-y-2 rotate-[-1deg]"],
            ] as const).map(([Icon, number, title, copy, style, transform]) => (
              <article
                key={title}
                className={`${style} relative min-h-72 border-2 border-landing-ink p-6 shadow-playful md:${transform}`}
              >
                <div className="flex items-start justify-between">
                  <span className="font-display text-xs font-bold">{number}</span>
                  <Icon className="size-6" />
                </div>
                <h3 className="mt-20 font-display text-2xl font-bold">{title}</h3>
                <p className="mt-4 text-sm leading-relaxed opacity-75">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="bg-landing-teal px-5 py-20 text-landing-soft sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div>
            <span className="inline-block rotate-2 bg-landing-pop px-3 py-2 font-display text-xs font-bold text-landing-ink">
              BRING THE PEOPLE
            </span>
            <h2 className="mt-6 font-display text-4xl font-bold leading-tight sm:text-5xl">
              Every conversation deserves somewhere to land.
            </h2>
            <Button className="mt-8" variant="landingPop" size="lg" onClick={() => { setEntryMode("create"); setError(""); }}>
              Start a Huddle <ArrowRight />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {(["Fast brainstorms", "Remote workshops", "Weekly planning", "Visual reviews"] as const).map((item, index) => (
              <article
                key={item}
                className={`use-tile min-h-40 border-2 border-landing-ink p-4 text-landing-ink shadow-playful sm:min-h-52 sm:p-6 ${index === 1 ? "translate-y-7" : index === 2 ? "-translate-y-2" : ""}`}
              >
                <span className="font-display text-xs font-bold">0{index + 1}</span>
                <h3 className="mt-16 font-display text-lg font-bold leading-tight sm:mt-24 sm:text-xl">{item}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="bg-landing-pop px-5 py-16 text-landing-ink lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-3xl items-start gap-4">
            <Clock3 className="mt-1 size-8 shrink-0" />
            <div>
              <p className="font-display text-xs font-bold uppercase">Temporary by design</p>
              <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                Keep the decision. Lose the digital attic.
              </h2>
            </div>
          </div>
          <Button size="lg" variant="landingDark" onClick={() => { setEntryMode("create"); setError(""); }}>
            Create room <ArrowRight />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-landing-ink px-5 py-8 text-landing-soft lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-3 font-display font-bold">
            <HuddleMark /> Huddle
          </span>
          <span className="text-landing-soft/55">Make room for the idea.</span>
        </div>
      </footer>

      {/* Entry dialog */}
      <Dialog open={entryMode !== null} onOpenChange={(open) => { if (!open) { setEntryMode(null); setError(""); } }}>
        <DialogContent className="max-w-md rounded-md border-2 border-landing-ink p-0 shadow-playful-lg overflow-visible">
          <div className="rounded-t-md border-b-2 border-landing-ink bg-landing-soft p-6">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold text-landing-ink">
                {entryMode === "join" ? "Join a room" : "Create a room"}
              </DialogTitle>
              <DialogDescription className="text-landing-ink/60">
                {entryMode === "join"
                  ? "Enter the code someone shared with you."
                  : "Set up a temporary canvas for your group."}
              </DialogDescription>
            </DialogHeader>
          </div>

          {error && (
            <p className="px-6 pt-4 text-sm text-destructive">{error}</p>
          )}

          <div className="bg-white rounded-b-md">
            {entryMode === "join" ? (
              <form onSubmit={joinRoom} className="grid gap-5 p-6 font-sans">
                <label className="grid gap-2 text-xs font-bold text-landing-ink">
                  Room code
                  <Input
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.slice(0, 8))}
                    placeholder="Enter 8-character code"
                    className="border-border rounded-md"
                    required
                  />
                </label>
                <label className="grid gap-2 text-xs font-bold text-landing-ink">
                  Your name
                  <Input
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="What should we call you?"
                    className="border-border rounded-md"
                    required
                  />
                </label>
                <Button type="submit" size="lg" variant="landingPop" className="mt-1 w-full" disabled={loading}>
                  {loading ? "Joining..." : "Join room"} <ArrowRight />
                </Button>
              </form>
            ) : (
              <form onSubmit={createRoom} className="grid gap-5 p-6 font-sans">
                <label className="grid gap-2 text-xs font-bold text-landing-ink">
                  Your name
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="What should we call you?"
                    className="border-border rounded-md"
                    required
                  />
                </label>
                <label className="grid gap-2 text-xs font-bold text-landing-ink">
                  Room name
                  <Input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Friday brainstorm"
                    className="border-border rounded-md"
                    required
                  />
                </label>
                <Button type="submit" size="lg" variant="landingPop" className="mt-1 w-full" disabled={loading}>
                  {loading ? "Creating..." : "Create room"} <ArrowRight />
                </Button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
