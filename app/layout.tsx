import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "./SessionProvider"; // ⬅️ add this
import { I18nProvider } from "@/lib/i18n/provider";
import { getCurrentLocale } from "@/lib/i18n/server";
import { RoleProvider } from "@/lib/role/provider";
import { getCurrentRole } from "@/lib/role/server";
import { ThemeProvider } from "@/lib/theme/provider";
import { getCurrentTheme } from "@/lib/theme/server";
import { themeMeta } from "@/lib/theme/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "V-Healthy",
  description:
    "Track calories, meals, water and glucose with a public-domain storybook companion.",
};

export async function generateViewport(): Promise<Viewport> {
  const meta = themeMeta[await getCurrentTheme()];
  return {
    themeColor: meta.background,
    colorScheme: meta.colorScheme,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getCurrentLocale();
  const role = await getCurrentRole();
  const theme = await getCurrentTheme();

  return (
    <html
      lang={locale}
      className={`${themeMeta[theme].htmlClass} bg-background`}
      style={{ colorScheme: themeMeta[theme].colorScheme }}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider locale={locale}>
          <ThemeProvider theme={theme}>
            <RoleProvider role={role}>
              <AuthSessionProvider>
                {children}
              </AuthSessionProvider>
            </RoleProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
