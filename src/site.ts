// Edit these to change your name, intro and links across the whole site.
export const SITE = {
  name: 'Geovan',
  title: 'Geovan — Developer',
  role: 'Application Developer Team Leader',
  intro:
    'I lead an application development team in the financial debt services sector, building and supporting the systems that keep a busy call centre running smoothly.',
  // Shown under the intro on the home page, one string per paragraph.
  about: [
    "My day-to-day work centres on .NET, RavenDB and FICO's Debt Manager platform, where I focus on delivering reliable, practical solutions and helping my team grow along the way.",
    "I'm currently completing a Level 4 QA AI & Automation Practitioner apprenticeship, exploring how AI and automation can improve quality, efficiency and the way teams work. I'm especially interested in turning new technology into real, usable improvements rather than hype.",
  ],
  description:
    'Portfolio and technical write-ups by Geovan — application development team leader working with .NET, RavenDB and FICO Debt Manager.',
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
