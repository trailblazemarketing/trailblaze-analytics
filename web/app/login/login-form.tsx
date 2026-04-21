"use client";
import { useState, useTransition } from "react";
import { sendMagicLinkAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({
  sent,
  error,
  redirect,
}: {
  sent: boolean;
  error?: string;
  redirect?: string;
}) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="rounded-md border border-tb-success/40 bg-tb-success/10 p-3 text-xs text-tb-success">
        <strong className="font-semibold">Check your inbox.</strong> If that
        email is on the allowlist, a sign-in link is on its way.
      </div>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setLocalError(null);
          const res = await sendMagicLinkAction(fd);
          if (res?.error) setLocalError(res.error);
        })
      }
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="redirect" value={redirect ?? "/"} />
      <label className="text-xs text-tb-muted" htmlFor="email">
        Work email
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        required
        placeholder="you@trailblaze-marketing.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <Button type="submit" disabled={pending || !email}>
        {pending ? "Sending…" : "Send magic link"}
      </Button>
      {(localError || error) && (
        <div className="rounded-md border border-tb-danger/40 bg-tb-danger/10 p-2 text-xs text-tb-danger">
          {localError ?? error}
        </div>
      )}
      <p className="pt-2 text-[10px] text-tb-muted">
        Not on the allowlist? Ask Andrew to add your email.
      </p>
    </form>
  );
}
