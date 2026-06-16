import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { createClient } from '@/lib/supabase/server';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PickleBracket – Pickleball Tournament Management',
  description: 'Host and manage pickleball tournaments with beautiful brackets',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = data;
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <Navigation user={profile} />
        <main className="flex-1">{children}</main>
        <footer className="bg-green-900 text-green-300 text-center text-xs py-4 mt-auto">
          <p>PickleBracket — Built for the love of the game 🥒</p>
        </footer>
      </body>
    </html>
  );
}
