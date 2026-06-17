// lib/platform.ts
//
// System platform identifier sent to the Thruxion "humans" API.
//
// Registration STORES this value and login REQUIRES it, so every user created
// from this web app is scoped to the "app-thruxion" platform. It is a shared
// constant (safe on both server and client) so the login request and the
// register flow always agree on the same value.
//
// Override with NEXT_PUBLIC_THRUXION_PLATFORM if this app is ever rebranded
// for another platform.
export const PLATFORM =
  process.env.NEXT_PUBLIC_THRUXION_PLATFORM ?? "app-thruxion";
