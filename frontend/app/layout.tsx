import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "HSE AI Dashboard",
  description: "AI-аналитика системы охраны труда КМГ-Кумколь",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen bg-slate-900 text-slate-100">
        <Sidebar />
        <main className="flex-1 ml-64 p-6 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
