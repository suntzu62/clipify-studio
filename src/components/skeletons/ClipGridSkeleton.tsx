import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface ClipGridSkeletonProps {
  count?: number;
}

export const ClipGridSkeleton = ({ count = 6 }: ClipGridSkeletonProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="overflow-hidden animate-pulse">
          <CardContent className="p-0">
            {/* Thumbnail */}
            <div className="aspect-[9/16] relative bg-muted">
              <div className="absolute inset-0 flex items-center justify-center">
                <Skeleton className="w-16 h-16 rounded-full" />
              </div>
              {/* Badge */}
              <div className="absolute top-3 right-3">
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Title */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>

              {/* Hashtags */}
              <div className="flex gap-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
