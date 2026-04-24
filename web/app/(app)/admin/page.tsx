// /admin — admin-only user management. Middleware gates the route; this
// page fetches /api/admin/users and exposes create/edit/reset/delete
// actions. Single client component to keep the fix-class at 1 file.

"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type User = {
  id: string;
  username: string;
  role: string;
  state: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  created_at: string;
  last_login_at: string | null;
};

const STATES = ["dormant", "subscription", "admin"] as const;
const ROLES = ["user", "admin"] as const;

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/users");
    if (!res.ok) { setError("failed to load users"); return; }
    const j = await res.json();
    setUsers(j.users ?? []);
  }
  useEffect(() => { refresh(); }, []);

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries([...f.entries()].filter(([, v]) => v));
    const res = await fetch("/api/admin/users", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "create failed"); return; }
    setShowCreate(false); setError(null); await refresh();
  }
  async function patchUser(id: string, patch: Record<string, string | null>) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH",
      headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) { setError("update failed"); return false; }
    await refresh(); return true;
  }
  async function deleteUser(id: string, username: string) {
    if (!confirm(`Delete ${username}?`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "delete failed"); return; }
    await refresh();
  }

  return (
    <div className="space-y-4 px-6 py-4 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <div className="mt-1 flex gap-3 text-[11px]">
            <span className="border-b-2 border-tb-blue pb-0.5 text-tb-text">Users</span>
            <Link href="/admin/analytics" className="text-tb-muted hover:text-tb-text">Analytics</Link>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="rounded border border-tb-blue bg-tb-blue/10 px-3 py-1.5 text-[11px] text-tb-blue hover:bg-tb-blue hover:text-tb-bg">
          new user
        </button>
      </div>
      {error && <div className="rounded border border-tb-danger/40 bg-tb-danger/10 px-3 py-2 text-[11px] text-tb-danger">{error}</div>}

      <div className="overflow-x-auto rounded-md border border-tb-border bg-tb-surface">
        <table className="w-full text-[12px]">
          <thead className="border-b border-tb-border bg-tb-bg/40 text-[10px] uppercase tracking-wider text-tb-muted">
            <tr>
              {["Username","Name","Email","Role","State","Last login","Created","Actions"].map((h) => (
                <th key={h} className="px-3 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/60">
            {users.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-tb-muted">no users</td></tr>}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-tb-border/30">
                <td className="px-3 py-2 font-mono">{u.username}</td>
                <td className="px-3 py-2">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-3 py-2 text-tb-muted">{u.email ?? "—"}</td>
                <td className="px-3 py-2"><Chip text={u.role} color={u.role === "admin" ? "beacon" : "muted"} /></td>
                <td className="px-3 py-2"><Chip text={u.state} color="muted" /></td>
                <td className="px-3 py-2 font-mono text-[10px] text-tb-muted">{u.last_login_at?.slice(0, 19).replace("T"," ") ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-tb-muted">{u.created_at.slice(0, 10)}</td>
                <td className="px-3 py-2 space-x-2 text-[10px]">
                  <button onClick={() => setEditing(u)} className="text-tb-blue hover:underline">edit</button>
                  <button onClick={() => setResetting(u)} className="text-tb-blue hover:underline">reset pw</button>
                  <button onClick={() => deleteUser(u.id, u.username)} className="text-tb-danger hover:underline">delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal title="Create user" onClose={() => setShowCreate(false)}>
          <form onSubmit={createUser} className="space-y-2">
            <Input name="username" label="username" required />
            <Input name="password" label="password" type="password" required />
            <Input name="email" label="email" type="email" />
            <Input name="first_name" label="first name" />
            <Input name="last_name" label="last name" />
            <Select name="role" label="role" options={[...ROLES]} defaultValue="user" />
            <Select name="state" label="state" options={[...STATES]} defaultValue="dormant" />
            <button type="submit" className="mt-2 w-full rounded border border-tb-blue bg-tb-blue/10 py-1.5 text-[11px] text-tb-blue hover:bg-tb-blue hover:text-tb-bg">create</button>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.username}`} onClose={() => setEditing(null)}>
          <form onSubmit={async (e) => { e.preventDefault();
            const f = new FormData(e.currentTarget);
            const patch = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
            if (await patchUser(editing.id, patch)) setEditing(null);
          }} className="space-y-2">
            <Input name="first_name" label="first name" defaultValue={editing.first_name ?? ""} />
            <Input name="last_name" label="last name" defaultValue={editing.last_name ?? ""} />
            <Input name="email" label="email" type="email" defaultValue={editing.email ?? ""} />
            <Input name="company" label="company" defaultValue={editing.company ?? ""} />
            <Select name="role" label="role" options={[...ROLES]} defaultValue={editing.role} />
            <Select name="state" label="state" options={[...STATES]} defaultValue={editing.state} />
            <button type="submit" className="mt-2 w-full rounded border border-tb-blue bg-tb-blue/10 py-1.5 text-[11px] text-tb-blue hover:bg-tb-blue hover:text-tb-bg">save</button>
          </form>
        </Modal>
      )}

      {resetting && (
        <Modal title={`Reset password: ${resetting.username}`} onClose={() => setResetting(null)}>
          <form onSubmit={async (e) => { e.preventDefault();
            const f = new FormData(e.currentTarget);
            const pw = String(f.get("new_password") ?? "");
            if (!pw) return;
            if (await patchUser(resetting.id, { new_password: pw })) setResetting(null);
          }} className="space-y-2">
            <Input name="new_password" label="new password" type="password" required />
            <button type="submit" className="mt-2 w-full rounded border border-tb-blue bg-tb-blue/10 py-1.5 text-[11px] text-tb-blue hover:bg-tb-blue hover:text-tb-bg">reset</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Chip({ text, color }: { text: string; color: "beacon" | "muted" }) {
  const cls = color === "beacon"
    ? "bg-tb-beacon/20 text-tb-beacon border-tb-beacon/40"
    : "bg-tb-border/40 text-tb-muted border-tb-border";
  return <span className={"rounded border px-2 py-0.5 text-[10px] uppercase " + cls}>{text}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-md border border-tb-border bg-tb-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">{title}</h3>
          <button onClick={onClose} className="text-[11px] text-tb-muted hover:text-tb-text">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, name, type = "text", defaultValue = "", required = false }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-tb-muted">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required}
        className="flex-1 border-b border-tb-border bg-transparent px-1 py-1 font-mono text-tb-text outline-none focus:border-tb-blue" />
    </label>
  );
}

function Select({ label, name, options, defaultValue }: { label: string; name: string; options: string[]; defaultValue?: string }) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-tb-muted">{label}</span>
      <select name={name} defaultValue={defaultValue}
        className="flex-1 rounded border border-tb-border bg-tb-bg px-2 py-1 font-mono text-tb-text outline-none focus:border-tb-blue">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
