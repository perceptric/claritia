import type { Metadata } from "next";
import { connection } from "next/server";
import { ClientApp } from "@/components/app/ClientApp";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Claritia", robots: { index: false } };

// The app's theme before the first paint: the saved choice, else the computer's.
const THEME = `try{var t=localStorage.getItem("claritia:theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default async function AppPage() {
  // Read settings when the page is requested, so changes on Render apply without a rebuild.
  await connection();
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_PUBLISHABLE_KEY"].filter(Boolean) as string[];

  if (missing.length) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-card p-8">
          <Logo />
          <h1 className="serif text-[28px]">Connect Supabase</h1>
          <p className="text-sm text-muted">Add these in Render under Environment, then redeploy:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {missing.map((m) => (
              <li key={m}>
                <code className="font-mono">{m}</code>
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME }} />
      <ClientApp config={{ url, key }} />
    </>
  );
}
