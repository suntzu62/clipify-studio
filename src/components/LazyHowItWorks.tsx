import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const HowItWorks = lazy(() => import('./HowItWorks'));

const LazyHowItWorks = () => (
  <Suspense fallback={
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <Skeleton className="h-12 w-80 mx-auto" />
          <Skeleton className="h-6 w-[500px] mx-auto" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-6 border rounded-lg text-center">
              <Skeleton className="h-16 w-16 mx-auto mb-4 rounded-xl" />
              <Skeleton className="h-6 w-24 mx-auto mb-2" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  }>
    <HowItWorks />
  </Suspense>
);

export default LazyHowItWorks;