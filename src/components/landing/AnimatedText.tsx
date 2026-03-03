import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedTextProps {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  staggerDelay?: number;
  delay?: number;
  highlightWords?: Record<string, string>;
  once?: boolean;
}

const containerVariants = {
  hidden: {},
  visible: (staggerDelay: number) => ({
    transition: {
      staggerChildren: staggerDelay,
    },
  }),
};

const wordVariants = {
  hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export function AnimatedText({
  text,
  className,
  as: Tag = 'h2',
  staggerDelay = 0.06,
  delay = 0,
  highlightWords = {},
  once = true,
}: AnimatedTextProps) {
  const words = text.split(' ');
  const MotionTag = motion.create(Tag);

  return (
    <MotionTag
      className={cn('flex flex-wrap justify-center gap-x-[0.3em]', className)}
      variants={containerVariants}
      custom={staggerDelay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-50px' }}
      transition={{ delayChildren: delay }}
    >
      {words.map((word, i) => {
        const highlightClass = highlightWords[word] || '';
        return (
          <motion.span
            key={`${word}-${i}`}
            variants={wordVariants}
            className={cn('inline-block', highlightClass)}
          >
            {word}
          </motion.span>
        );
      })}
    </MotionTag>
  );
}
