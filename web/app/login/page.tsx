// /login — demo-grade entry to the Trailblaze terminal.
//
// Minimal form, terminal aesthetic. Press Enter on either field to submit.
// POSTs to /api/auth/login and follows the returned redirect on success.
// On 401 a muted error line renders below the fields. NOT production auth.

"use client";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const userRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    const username = (form.get("username") as string | null) ?? "";
    const password = (form.get("password") as string | null) ?? "";
    if (!username || !password) {
      setErr("both fields required");
      userRef.current?.focus();
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };
      if (res.ok && body.ok) {
        router.push(body.redirect ?? "/overview");
        router.refresh();
        return;
      }
      setErr(body.error === "bad_password" ? "incorrect passphrase" : "login failed");
    } catch {
      setErr("network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tb-bg p-6 font-mono">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-5 text-[13px]">
        <div className="text-sm uppercase tracking-[0.2em] text-tb-text">
          Trailblaze Analytics
        </div>
        <div className="h-px bg-tb-border" />
        <label className="flex items-center gap-3">
          <span className="shrink-0 w-28 text-tb-muted">&gt; login as:</span>
          <input
            ref={userRef}
            name="username"
            autoComplete="username"
            autoFocus
            className="flex-1 bg-transparent border-b border-tb-border px-1 py-1 outline-none text-tb-text focus:border-tb-blue"
          />
        </label>
        <label className="flex items-center gap-3">
          <span className="shrink-0 w-28 text-tb-muted">&gt; passphrase:</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="flex-1 bg-transparent border-b border-tb-border px-1 py-1 outline-none text-tb-text focus:border-tb-blue"
          />
        </label>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] uppercase tracking-wider text-tb-muted">
            press ENTER to continue
          </span>
          <button
            type="submit"
            disabled={pending}
            className="text-[11px] uppercase tracking-wider text-tb-blue hover:text-tb-text disabled:opacity-50"
          >
            continue →
          </button>
        </div>
        {err && (
          <div className="text-[11px] text-tb-danger">× {err}</div>
        )}
      </form>
    </main>
  );
}
