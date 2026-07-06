import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const haiku = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/haiku' }),
  schema: z.object({
    lines: z.array(z.string().min(1)).length(3),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    order: z.number().int(),
  }),
});

export const collections = { haiku };
