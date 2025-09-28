import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const Footer = lazy(() => import('./Footer'));

const LazyFooter = () => (
  <Suspense fallback={
    <footer className="bg-muted/50 border-t">
      <div className="container mx-auto px-6 py-8">
        <Skeleton className="h-24 w-full" />
      </div>
    </footer>
  }>
    <Footer />
  </Suspense>
);

export default LazyFooter;