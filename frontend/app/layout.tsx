import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stat Sightline",
  description: "MLB advanced metrics, Baseball Savant-style.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-white/10 px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">
            Stat Sightline
          </h1>
        </header>
        <main className="px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
