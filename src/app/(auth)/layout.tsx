import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

/** Auth pages sit inside the storefront's chrome — they're reached from it
 * and return to it. This layout exists because Header/Footer moved out of
 * the root layout when admin gained its own shell. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
