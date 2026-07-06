import { getCollection, type CollectionEntry } from 'astro:content';

export type Haiku = CollectionEntry<'haiku'>;

export async function getSortedHaiku(): Promise<Haiku[]> {
  const all = await getCollection('haiku');
  return all.sort((a, b) => b.data.order - a.data.order);
}

export async function getFeaturedHaiku(): Promise<Haiku> {
  const [mostRecent] = await getSortedHaiku();
  return mostRecent;
}

export function formatHaikuDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month} · ${day} · ${year}`;
}
