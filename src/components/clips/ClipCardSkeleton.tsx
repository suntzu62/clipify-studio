import { Card, CardContent } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ClipCardSkeletonProps {
  index?: number;
  className?: string;
}

export const ClipCardSkeleton = ({ index, className }: ClipCardSkeletonProps) => {
  return (
    <Card className={cn("overflow-hidden animate-pulse", className)}>
      <CardContent className="p-0">
        {/* Video Thumbnail Skeleton with Shimmer */}
        <AspectRatio ratio={9/16} className="bg-muted relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-foreground/10 to-muted animate-shimmer bg-[length:200%_100%]" />

          {/* Play Icon Skeleton */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-background/20 backdrop-blur-sm" />
          </div>

          {/* Index Badge */}
          {index !== undefined && (
            <div className="absolute top-2 left-2">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-2 right-2">
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </AspectRatio>

        {/* Content Skeleton */}
        <div className="p-4 space-y-3">
          {/* Title */}
          <Skeleton className="h-5 w-3/4" />

          {/* Description */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>

          {/* Hashtags */}
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Social Media Buttons */}
          <div className="grid grid-cols-4 gap-2">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Compact horizontal version matching new ClipCardPro layout
export const ClipCardSkeletonCompact = ({ index }: ClipCardSkeletonProps) => {
  return (
    <Card className="overflow-hidden bg-[#12121a] border border-white/10">
      <CardContent className="p-0">
        <div className="flex flex-row h-[220px]">
          {/* Left: Thumbnail skeleton */}
          <div className="relative w-[130px] flex-shrink-0 overflow-hidden bg-muted">
            <div className="absolute inset-0">
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            </div>
            {/* Score skeleton */}
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          </div>

          {/* Right: Content skeleton */}
          <div className="flex-1 flex flex-col justify-between p-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-full" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-6 w-14 rounded-md" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 flex-1 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
