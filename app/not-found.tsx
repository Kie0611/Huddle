import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-center">
      <div className="flex max-w-md flex-col items-center">
        <div className="relative size-24">
          <Image
            src="/huddle-logo.png"
            alt="Huddle"
            fill
            sizes="96px"
            className="object-contain"
            priority
          />
        </div>
        <h1 className="mt-7 font-mono text-4xl font-semibold">Page not found</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          This page does not exist, or it has already moved on.
        </p>
        <Button asChild className="mt-7">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
