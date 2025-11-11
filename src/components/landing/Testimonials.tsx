import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestimonialsProps {
  className?: string;
}

const testimonials = [
  {
    name: 'Carlos Santos',
    role: 'Creator @ YouTube',
    avatar: '',
    initials: 'CS',
    rating: 5,
    quote:
      'O Cortai revolucionou minha criação de conteúdo. Em minutos tenho vários Shorts prontos para postar!',
    stats: '+150K seguidores',
  },
  {
    name: 'Mariana Silva',
    role: 'Influencer Digital',
    avatar: '',
    initials: 'MS',
    rating: 5,
    quote:
      'Economia de tempo absurda! O que levava horas agora leva minutos. A IA identifica os melhores momentos perfeitamente.',
    stats: '+500K seguidores',
  },
  {
    name: 'Pedro Lima',
    role: 'Podcaster',
    avatar: '',
    initials: 'PL',
    rating: 5,
    quote:
      'Essencial para meu podcast. Consigo criar clipes virais de cada episódio sem esforço.',
    stats: '+2M visualizações',
  },
];

export const Testimonials = ({ className }: TestimonialsProps) => {
  return (
    <section className={cn('py-24 bg-background', className)}>
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Amado por criadores de conteúdo
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Veja o que nossos usuários dizem sobre a experiência com o Cortai
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="bg-gradient-card border-2 hover:shadow-xl transition-all duration-300"
            >
              <CardContent className="p-6 space-y-4">
                {/* Rating */}
                <div className="flex gap-1">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-warning text-warning"
                    />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-sm leading-relaxed text-foreground">
                  "{testimonial.quote}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Avatar>
                    {testimonial.avatar ? (
                      <AvatarImage
                        src={testimonial.avatar}
                        alt={testimonial.name}
                      />
                    ) : (
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {testimonial.initials}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.role}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-primary">
                    {testimonial.stats}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
