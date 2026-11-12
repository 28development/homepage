/**
 * The portrait. Both files are crops of src/assets/portrait/umut-tufanoglu-original.jpg
 * (the original stays out of /public so it is not published).
 *
 *   public/images/umut-tufanoglu-portrait.jpg   4:5, head to hands (About section)
 *   public/images/umut-tufanoglu-avatar.jpg     1:1, the face (header and contact)
 *
 * Remove a file and its place on the page disappears at the next build.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the project root: in a build this module is bundled, so its own location says nothing.
const inPublic = (path: string) => existsSync(join(process.cwd(), 'public', path));

export const portrait = inPublic('images/umut-tufanoglu-portrait.jpg')
  ? {
      src: '/images/umut-tufanoglu-portrait.jpg',
      width: 800,
      height: 1000,
      alt: 'Umut Tufanoglu sitzt im Gespräch, in weißem T-Shirt, den Blick zur Seite',
    }
  : null;

export const avatar = inPublic('images/umut-tufanoglu-avatar.jpg')
  ? { src: '/images/umut-tufanoglu-avatar.jpg', size: 400 }
  : null;
