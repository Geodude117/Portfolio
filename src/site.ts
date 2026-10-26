// Edit these to change your name, intro and links across the whole site.
export const SITE = {
  name: 'Geovan',
  title: 'Geovan — Developer',
  role: 'Application Developer Team Leader',
  intro:
    'I build .NET applications by day and native iOS apps by night. This is where I write about what I build, what broke, and what I learned fixing it.',
  description:
    'Portfolio and articles by Geovan — .NET developer, team lead and SwiftUI hobbyist.',
  github: 'https://github.com/Geodude117',
  linkedin: '', // add your LinkedIn URL to show it in the footer
  email: '', // add an email address to show a contact link
};

/** Prefix a path with the site's base path (needed for GitHub Pages). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
