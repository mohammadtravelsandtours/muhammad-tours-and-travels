import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { SiteFooter } from '@/components/site-footer';
import { AiChatWidget } from '@/components/ai-chat-widget';
import './globals.css';

export const metadata: Metadata = {
  title: 'Muhammad Tours and Travels',
  description:
    'Your journey, our priority. One search, every fare — flights, hotels, and visas across South & Southeast Asia and the Gulf.',
  // Favicon/app icon come from the file-based convention instead
  // (src/app/favicon.ico + src/app/icon.png), which Next.js picks up
  // automatically — no explicit `icons` entry needed here.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <div className="flex-1 flex flex-col">{children}</div>
          <SiteFooter />
          <AiChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
