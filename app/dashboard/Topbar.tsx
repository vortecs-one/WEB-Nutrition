"use client";

import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";

function formatSpanishDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function Topbar() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "";
  const userName = session?.user?.name ?? userEmail.split("@")[0] ?? "Usuario";
  const initial = (userName[0] ?? "U").toUpperCase();

  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-slate-200 bg-slate-900 text-slate-50">
      
      {/* Left: logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold">
          5C
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-sm">NutritionAI</div>
          <div className="text-[11px] text-slate-300">Estandar</div>
        </div>
      </div>

      {/* Center: date */}
      <div className="hidden md:block text-xs text-slate-300">
        {formatSpanishDate()}
      </div>

      {/* Right: user + logout */}
      <div className="flex items-center gap-3">

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold">
            {initial}
          </div>
          <div className="hidden sm:flex flex-col text-right leading-tight">
            <span className="text-xs font-medium">{userName}</span>
            <span className="text-[11px] text-slate-300 truncate max-w-[160px]">
              {userEmail}
            </span>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="bg-red-600/90 hover:bg-red-700 text-xs px-3 py-1 rounded-full flex items-center gap-1 transition"
        >
          ⏻ Cerrar sesión
        </button>
      </div>

    </header>
  );
}
