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

// Compact version for grid layouts
export const ClipCardSkeletonCompact = ({ index }: ClipCardSkeletonProps) => {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Video Thumbnail with shimmer */}
        <AspectRatio ratio={9/16} className="relative overflow-hidden bg-muted">
          {/* Shimmer effect */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          {/* Loading indicator */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
            <div className="w-12 h-12 rounded-full bg-muted-foreground/20 animate-pulse flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-24 mx-auto" />
              <Skeleton className="h-2 w-32 mx-auto" />
            </div>
          </div>
        </AspectRatio>

        {/* Compact info */}
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-1">
            <Skeleton className="h-3 w-12 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
