import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = { title: process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM", description: "Self-hosted WhatsApp CRM powered by WPPConnect" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.theme==='dark'||(!localStorage.theme&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}` }} /></head>
      <body className="antialiased"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
