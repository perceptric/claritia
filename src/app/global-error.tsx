"use client";

// A crash in the root layout itself: the same screen, with its own html and body, since the layout didn't render.
import "./globals.css";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-full font-sans antialiased">
        <ErrorScreen {...props} />
      </body>
    </html>
  );
}
