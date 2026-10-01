import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kariakoo — Business Management',
  description: 'Point of sale, inventory, and purchasing for Kariakoo Market businesses',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
