"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/provider";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const registerUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const res = await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || t.auth.registrationFailed);
      return;
    }

    setSuccess(t.auth.accountCreated);

    setTimeout(() => router.push("/login"), 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-sm bg-card rounded-xl shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t.auth.registerTitle}</h1>
          <LanguageSwitcher variant="light" />
        </div>

        <form onSubmit={registerUser} className="space-y-4">
          {/* Email */}
          <div className="flex flex-col">
            <label className="text-sm mb-1">{t.auth.email}</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          {/* Password */}
          <div className="flex flex-col">
            <label className="text-sm mb-1">{t.auth.password}</label>
            <input
              type="password"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          {/* Error message */}
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Success message */}
          {success && <p className="text-green-600 text-sm">{success}</p>}

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
          >
            {t.auth.register}
          </button>
        </form>

        <p className="text-sm text-muted-foreground mt-4 text-center">
          {t.auth.haveAccount}{" "}
          <a
            href="/login"
            className="text-primary font-medium hover:underline"
          >
            {t.auth.login}
          </a>
        </p>
      </div>
    </div>
  );
}
