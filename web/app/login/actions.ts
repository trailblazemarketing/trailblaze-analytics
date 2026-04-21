"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/allowlist";

export async function sendMagicLinkAction(
  formData: FormData,
): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "").trim();
  const redirectPath = String(formData.get("redirect") ?? "/") || "/";

  if (!email) return { error: "Enter an email address." };
  if (!isEmailAllowed(email)) {
    // Generic message — don't leak allowlist membership.
    return {
      error: "That address isn't authorized. Contact Andrew for access.",
    };
  }

  const supabase = createSupabaseServerClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      shouldCreateUser: true,
    },
  });

  if (error) return { error: error.message };

  redirect(`/login?sent=1&redirect=${encodeURIComponent(redirectPath)}`);
}

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
