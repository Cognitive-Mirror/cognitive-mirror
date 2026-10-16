import type { Metadata } from "next";
import { Funnel_Display, Funnel_Sans, Martian_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeControls";
import { DemoRoot } from "@/components/demo/DemoToolbar";

// One superfamily in two cuts, so headline and interface share their bones.
const ui = Funnel_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const display = Funnel_Display({
  variable: "--font-display",
  subsets: ["latin"],
});

const code = Martian_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Cognitive Mirror",
  description: "Capability intelligence: learning, workplace evidence and manager validation.",
};

// Runs before first paint: a saved choice wins, otherwise follow the system.
// Without it, a light-mode viewer would see the dark server render flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("cognitive-mirror-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ui.variable} ${display.variable} ${code.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <DemoRoot>{children}</DemoRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}
