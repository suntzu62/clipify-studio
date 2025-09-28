import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const Features = lazy(() => import('./Features'));

const LazyFeatures = () => (
  <Suspense fallback={
    <section className="py-24 bg-gradient-card">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <Skeleton className="h-12 w-96 mx-auto" />
          <Skeleton className="h-6 w-[600px] mx-auto" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="p-6 border rounded-lg">
              <Skeleton className="h-16 w-16 mx-auto mb-4 rounded-xl" />
              <Skeleton className="h-6 w-32 mx-auto mb-2" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  }>
    <Features />
  </Suspense>
);

export default LazyFeatures;