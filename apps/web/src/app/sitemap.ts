import type { MetadataRoute } from 'next';

const PUBLIC_ROUTES = [
  '',
  '/search',
  '/hotels',
  '/hajj-umrah',
  '/packages',
  '/visas',
  '/manpower',
  '/about',
  '/contact',
  '/manage-booking',
  '/policies',
  '/login',
  '/register',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://muhammadtravels.com').replace(/\/$/, '');
  return PUBLIC_ROUTES.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));
}
