import { cn } from '@/lib/utils';

interface LogoStripProps {
  className?: string;
}

export const LogoStrip = ({ className }: LogoStripProps) => {
  const logos = [
    { name: 'TechCrunch', width: 'w-32' },
    { name: 'Product Hunt', width: 'w-28' },
    { name: 'Forbes', width: 'w-24' },
    { name: 'Wired', width: 'w-20' },
    { name: 'The Verge', width: 'w-32' },
  ];

  return (
    <section className={cn('py-12 border-y bg-gradient-subtle', className)}>
      <div className="container mx-auto px-6">
        <p className="text-center text-sm font-medium text-muted-foreground mb-8">
          Confiado por criadores de conteúdo em todo o mundo
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-60">
          {logos.map((logo) => (
            <div
              key={logo.name}
              className={cn(
                'h-8 bg-gray-300 rounded',
                logo.width,
                'hover:opacity-100 transition-opacity'
              )}
              title={logo.name}
            >
              <span className="sr-only">{logo.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
