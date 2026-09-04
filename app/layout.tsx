import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Recommendation Algorithm Sandbox',
  description: 'Prototype for testing the questionnaire-based program recommendation algorithm.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
