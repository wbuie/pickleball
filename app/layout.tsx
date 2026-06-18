import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { createClient } from '@/lib/supabase/server';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CFC Pickleball League – Christ Fellowship Church',
  description: 'Pickleball tournaments hosted by Christ Fellowship Church, Birmingham. Register, build brackets, and play.',
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
        <footer className="bg-brand-900 text-brand-300 text-center text-xs py-4 mt-auto">
          <p>CFC Pickleball League · Christ Fellowship Church, Birmingham 🥒</p>
        </footer>
      </body>
    </html>
  );
}
