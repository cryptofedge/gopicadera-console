import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go Picadera — Consola",
  description: "Pedidos, inventario y menú",
  // A staff console has no business in search results.
  robots: { index: false, follow: false },

  // So the /demo/ link previews in WhatsApp the same as the landing page.
  // Absolute URL on purpose: scrapers fetch it without a page to resolve
  // against, and Next does not apply basePath to metadata images.
  openGraph: {
    type: "website",
    siteName: "Go Picadera",
    title: "Go Picadera — Consola",
    description: "Consola de pedidos e inventario para el dueño y el personal.",
    url: "https://cryptofedge.github.io/gopicadera-console/",
    locale: "es_DO",
    images: [{
      url: "https://cryptofedge.github.io/gopicadera-console/og.jpg",
      width: 1200,
      height: 630,
      alt: "Go Picadera — consola de pedidos e inventario",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Go Picadera — Consola",
    description: "Consola de pedidos e inventario para el dueño y el personal.",
    images: ["https://cryptofedge.github.io/gopicadera-console/og.jpg"],
  },
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
