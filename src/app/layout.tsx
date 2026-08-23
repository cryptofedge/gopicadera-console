import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go Picadera — Consola",
  description: "Pedidos, inventario y menú",
  // A staff console has no business in search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
