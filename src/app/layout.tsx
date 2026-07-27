import type { Metadata } from "next";
import "./globals.css";
import { archivo, geistMono, geistSans, plexMono } from "./fonts/fonts";
import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: "Storefront",
  description: "Non-custodial Bitcoin checkout storefront",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${plexMono.variable}`}
    >
      <body>
        {/* No Header/Footer here: the storefront and admin have different
            chrome, so each route group renders its own in its layout. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
