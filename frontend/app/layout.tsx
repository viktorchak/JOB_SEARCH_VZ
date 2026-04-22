import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Search Assistant",
  description: "Live job discovery, scoring, and action dashboard."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

