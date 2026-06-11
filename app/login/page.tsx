"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function LoginPage() {
  const callbackUrl = "/dashboard";
  const t = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Fix: refresh CSRF token + force-clear fields after logout
  useEffect(() => {
    fetch("/api/auth/csrf");

    // Always start empty even if browser has saved credentials
    setEmail("");
    setPassword("");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (res?.error) {
      setError(t.auth.invalidCredentials);
      return;
    }

    window.location.href = callbackUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">

      {/* 🔥 Trick Chrome into autofilling this fake form instead */}
      <form className="hidden">
        <input type="text" name="fake-user" autoComplete="username" />
        <input type="password" name="fake-pass" autoComplete="current-password" />
      </form>

      <div className="w-full max-w-sm bg-card rounded-xl shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t.auth.loginTitle}</h1>
          <LanguageSwitcher variant="light" />
        </div>

        <form onSubmit={submit} className="space-y-4" autoComplete="off">

          <div className="flex flex-col">
            <label className="text-sm mb-1">{t.auth.email}</label>
            <input
              type="email"
              autoComplete="off"       // ⬅ prevent browser stored email autofill
              name="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm mb-1">{t.auth.password}</label>
            <input
              type="password"
              autoComplete="new-password"   // ⬅ strongest option to block autofill
              name="password"
              value={password}
              placeholder="••••••"
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
          >
            {t.auth.login}
          </button>
        </form>
      </div>
    </div>
  );
}
