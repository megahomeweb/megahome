import Footer from '@/components/client/Footer';
import React from 'react'
import FixedCartButton from '@/components/client/FixedCartButton';
import ProspectBanner from '@/components/client/ProspectBanner';

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ProspectBanner />
      {children}
      <FixedCartButton />
      <Footer />
    </>
  )
}