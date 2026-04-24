// /profile — every logged-in user. Edit own profile fields, swap
// avatar, change password. Single client component; fetches /api/auth/me
// on mount, POSTs actions to /api/profile and /api/profile/upload-picture.

"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Me = {
  username: string;
  role: string;
  state: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  profile_picture_path: string | null;
};

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.ok ? r.json() : null).then((j) => {
      if (j?.ok) setMe(j);
    });
  }, []);

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!me) return;
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update",
        first_name: f.get("first_name"),
        last_name: f.get("last_name"),
        email: f.get("email"),
        company: f.get("company"),
      }),
    });
    setStatus(res.ok ? "saved" : "save failed");
    if (res.ok) {
      const r2 = await fetch("/api/auth/me").then((r) => r.json());
      if (r2.ok) setMe(r2);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/upload-picture", { method: "POST", body: fd });
    if (res.ok) {
      const j = await res.json();
      setMe((m) => (m ? { ...m, profile_picture_path: j.profile_picture_path } : m));
    } else {
      setStatus("upload failed");
    }
  }

  async function resetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = String(f.get("current_password") ?? "");
    const next = String(f.get("new_password") ?? "");
    const confirm = String(f.get("confirm_password") ?? "");
    if (!current || !next) { setPwStatus("both fields required"); return; }
    if (next !== confirm) { setPwStatus("new passwords don't match"); return; }
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset_password", current_password: current, new_password: next }),
    });
    const j = await res.json().catch(() => ({}));
    setPwStatus(res.ok ? "password updated" : j.error === "bad_current_password" ? "incorrect current password" : "update failed");
    if (res.ok) (e.currentTarget as HTMLFormElement).reset();
  }

  if (!me) return <div className="p-6 text-[11px] text-tb-muted">loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-6 text-[13px]">
      <h1 className="text-lg font-semibold text-tb-text">Your profile</h1>

      <div className="flex items-center gap-4 rounded-md border border-tb-border bg-tb-surface p-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-tb-border bg-tb-bg">
          {me.profile_picture_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.profile_picture_path} alt="avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-xs text-tb-muted">
              {me.username.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="font-mono text-[11px] text-tb-muted">@{me.username}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-tb-muted">
            {me.state} · {me.role}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
        <button onClick={() => fileRef.current?.click()} className="rounded border border-tb-border px-3 py-1 text-[11px] text-tb-text hover:border-tb-blue">
          change avatar
        </button>
      </div>

      <form onSubmit={saveProfile} className="space-y-3 rounded-md border border-tb-border bg-tb-surface p-4">
        <Field label="first name" name="first_name" defaultValue={me.first_name ?? ""} />
        <Field label="last name" name="last_name" defaultValue={me.last_name ?? ""} />
        <Field label="email" name="email" type="email" defaultValue={me.email ?? ""} />
        <Field label="company" name="company" defaultValue={me.company ?? ""} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-tb-muted">{status ?? ""}</span>
          <button type="submit" className="rounded border border-tb-blue bg-tb-blue/10 px-4 py-1 text-[11px] text-tb-blue hover:bg-tb-blue hover:text-tb-bg">
            save changes
          </button>
        </div>
      </form>

      <form onSubmit={resetPassword} className="space-y-3 rounded-md border border-tb-border bg-tb-surface p-4">
        <div className="text-[10px] uppercase tracking-wider text-tb-muted">change password</div>
        <Field label="current password" name="current_password" type="password" />
        <Field label="new password" name="new_password" type="password" />
        <Field label="confirm new" name="confirm_password" type="password" />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-tb-muted">{pwStatus ?? ""}</span>
          <button type="submit" className="rounded border border-tb-blue bg-tb-blue/10 px-4 py-1 text-[11px] text-tb-blue hover:bg-tb-blue hover:text-tb-bg">
            update password
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, type = "text", defaultValue = "" }: { label: string; name: string; type?: string; defaultValue?: string }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-[10px] uppercase tracking-wider text-tb-muted">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue}
        className="flex-1 border-b border-tb-border bg-transparent px-1 py-1 font-mono text-tb-text outline-none focus:border-tb-blue" />
    </label>
  );
}
