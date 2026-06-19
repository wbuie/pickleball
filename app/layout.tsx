import type { Metadata } from 'next';
import { DM_Serif_Text, Mulish, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import PickleballMark from '@/components/PickleballMark';
import { createClient } from '@/lib/supabase/server';

// Fonts matched to Christ Fellowship Church's site (cfcbirmingham.org):
// DM Serif Text for display headings; Mulish as a clean geometric stand-in
// for the church's body face ("Soleil", an Adobe Typekit font).
const dmSerif = DM_Serif_Text({ variable: '--font-dm-serif', subsets: ['latin'], weight: '400' });
const mulish = Mulish({ variable: '--font-mulish', subsets: ['latin'] });
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
    <html lang="en" className={`${mulish.variable} ${dmSerif.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <Navigation user={profile} />
        <main className="flex-1">{children}</main>
        <footer className="bg-brand-900 text-brand-300 text-xs py-4 mt-auto">
          <p className="flex items-center justify-center gap-1.5">
            <PickleballMark className="w-4 h-4 text-brand-300" />
            CFC Pickleball League · Christ Fellowship Church, Birmingham
          </p>
        </footer>
      </body>
    </html>
  );
}
