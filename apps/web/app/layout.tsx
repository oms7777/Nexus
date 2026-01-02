// apps/web/app/layout.tsx
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";

import "@workspace/ui/globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@workspace/ui/components/sonner";
import { RepsAvailabilityBar } from "@/modules/dashboard/ui/components/reps-availability-bar";

// ✅ NEW: top-right reps widget

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
        <ClerkProvider
          appearance={{
            variables: { colorPrimary: "#3C82F6" },
          }}
        >
          <Providers>
            <Toaster />

            {/* ✅ App shell only when signed in */}
            <SignedIn>
              <div className="min-h-screen bg-background">
                {/* Top bar */}
                <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
                  <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4">
                    {/* Left: keep minimal (tu peux remplacer par ton brand/breadcrumb) */}
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold tracking-tight">
                        Inboundless
                      </div>
                    </div>

                    {/* Right: reps avatars + my availability toggle */}
                    <RepsAvailabilityBar />
                  </div>
                </header>

                {/* Main content */}
                <main className="mx-auto max-w-[1400px] px-4 py-6">
                  {children}
                </main>
              </div>
            </SignedIn>

            {/* ✅ No shell for signed out pages */}
            <SignedOut>{children}</SignedOut>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
