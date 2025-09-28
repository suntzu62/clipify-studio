import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const Pricing = lazy(() => import('./Pricing'));

const LazyPricing = () => (
  <Suspense fallback={
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <Skeleton className="h-12 w-60 mx-auto" />
          <Skeleton className="h-6 w-[400px] mx-auto" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-8 border rounded-lg">
              <Skeleton className="h-8 w-24 mb-4" />
              <Skeleton className="h-12 w-32 mb-6" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  }>
    <Pricing />
  </Suspense>
);

export default LazyPricing;