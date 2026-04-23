// Splash-page email-capture form. Posts to /api/demo-request, which appends
// to documentation/demo-requests.log for now (Calendly / CRM wiring later).

"use client";
import { useState, type FormEvent } from "react";

export function DemoRequestForm() {
  const [status, setStatus] = useState<"idle" | "pending" | "sent" | "error">(
    "idle",
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "pending" || status === "sent") return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) return;
    setStatus("pending");
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex max-w-md border border-tb-border bg-tb-surface p-1"
    >
      <input
        name="email"
        type="email"
        required
        disabled={status === "sent" || status === "pending"}
        placeholder="your@email.com"
        className="flex-1 bg-transparent px-4 font-mono text-xs text-tb-text outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === "pending" || status === "sent"}
        className="bg-tb-blue px-6 py-2 text-[10px] font-bold uppercase text-tb-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "sent" ? "Thanks ✓" : status === "pending" ? "Sending…" : "Request Demo"}
      </button>
    </form>
  );
}
