/**
 * All page content lives here. Components only render what this file exports.
 *
 * `todo('…')` marks information that could not be confirmed (the public
 * LinkedIn view hides job titles, dates, skills and projects). Every todo is
 * rendered inside a dashed frame so it cannot be mistaken for real
 * content. Replace it with a plain string and the frame disappears.
 */

export interface Todo {
  todo: string;
}
export type Text = string | Todo;

export const todo = (hint: string): Todo => ({ todo: hint });
export const isTodo = (value: Text): value is Todo => typeof value !== 'string';
export const plain = (value: Text): string => (isTodo(value) ? value.todo : value);

export interface Project {
  /** Stable id, used for anchors. */
  id: string;
  title: Text;
  /** The name as it stands in the preview, with the stream running around it. */
  monogram: string;
  year: Text;
  summary: Text;
  contribution: Text;
  stack: Text[];
  result: Text;
  /** Live URL or case study. Leave as todo to hide the link. */
  href?: Text;
}

export interface Station {
  period: Text;
  role: Text;
  organisation: Text;
  place: Text;
}

export interface SkillGroup {
  label: string;
  items: Text[];
}

const linkedin = 'https://www.linkedin.com/in/umut-tufanoglu-15ab15149/';

export const site = {
  /** Confirm the domain before launch (also set in astro.config.mjs). */
  url: 'https://umuttufanoglu.dev',
  locale: 'de_DE',
  lang: 'de',

  name: { first: 'Umut', last: 'Tufanoglu', full: 'Umut Tufanoglu' },
  role: 'Digital Solutions Architect',
  location: 'Schwerte an der Ruhr',
  employer: {
    name: 'GSVI Gregor & Strozik Visual Identity',
    short: 'GSVI',
    city: 'Bochum',
  },

  seo: {
    title: 'Umut Tufanoglu – Digital Solutions Architect aus Schwerte',
    description:
      'Portfolio von Umut Tufanoglu, Digital Solutions Architect und Full-Stack-Entwickler aus Schwerte an der Ruhr: Projekte, Erfahrung, Fähigkeiten und Kontakt.',
  },

  nav: [
    { label: 'Projekte', href: '#projekte' },
    { label: 'Über mich', href: '#ueber-mich' },
    { label: 'Erfahrung', href: '#erfahrung' },
    { label: 'Kontakt', href: '#kontakt' },
  ],

  links: {
    linkedin,
    email: '28development@gmail.com' as Text,
    github: 'https://github.com/28development' as Text,
  },

  hero: {
    lead: 'Digital Solutions Architect aus Schwerte an der Ruhr. Ich baue digitale Produkte, bei denen Technik und Gestaltung zusammengehören.',
    tag: 'Full-Stack seit 2014',
    /** First year in the job, taken from LinkedIn. The hero counts the years from it. */
    since: 2014,
    coordinates: '51.44° N · 7.57° E',
    primary: { label: 'Projekte ansehen', href: '#projekte' },
    secondary: { label: 'Kontakt aufnehmen', href: '#kontakt' },
    /** Draft line built on the surname: tufan is Turkish for flood. */
    note: 'Tufan heißt Flut. Meine Arbeit ist, ihr eine Form zu geben.',
    place: 'Bei GSVI in Bochum',
  },

  projects: {
    heading: 'Ausgewählte Projekte',
    notice: 'Gestrichelt umrandet ist, was noch fehlt.',
    items: [
      {
        id: 'tosspost',
        title: 'TossPost',
        monogram: 'TossPost',
        year: 'seit 2025',
        summary:
          'Wegwerf-E-Mail, die von selbst verschwindet: eine Empfangsadresse ohne Anmeldung, die sich nach Ablauf mitsamt Nachrichten löscht. Bestätigungscodes werden erkannt, Tracking-Pixel blockiert, das Postfach wandert per QR-Code aufs Handy.',
        /** The repository has a single author. */
        contribution:
          'Mein eigenes Produkt, allein konzipiert, gestaltet und gebaut: Web-App, Mail-Empfang, REST-API, MCP-Server für KI-Agenten und iOS-App.',
        /** From the repository's composer.json, package.json and ios folder. */
        stack: ['Laravel', 'Inertia', 'React', 'TypeScript', 'Tailwind CSS', 'Laravel Reverb', 'Swift'],
        result: 'Live unter tosspost.com, mit öffentlicher API und DNS-Werkzeugen',
        href: 'https://tosspost.com',
      },
      {
        id: 'akafoe',
        title: 'Akafö',
        monogram: 'Akafö',
        year: 'seit 2024',
        summary:
          'Die digitale Plattform des Akafö, des Studierendenwerks für die Bochumer Hochschulen und die Westfälische Hochschule: Website mit Gastronomie, Studienfinanzierung, Wohnen und Events, dazu ein persönliches Dashboard und eine App für Studierende.',
        contribution:
          'IT-Lead für das gesamte Projekt bei GSVI: Architektur, Backend, Server, Frontend und Mobile-App liegen bei mir.',
        /** From the repositories of the website, the CMS, the platform and the app. */
        stack: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Payload CMS', 'PostgreSQL', 'Laravel', 'Flutter'],
        result: 'Live unter akafoe.de',
        href: 'https://www.akafoe.de',
      },
      {
        id: 'invite-studio',
        title: 'Invite Studio',
        monogram: 'Invite Studio',
        year: 'seit 2026',
        summary:
          'Digitale Einladungen mit Online-Zusage für Henna-Abende, Verlobungen, Hochzeiten und Geburtstage: animierte Vorlagen mit 3D-Effekten, ein privater Link und Zusagen, die direkt bei den Gastgebern ankommen.',
        contribution: 'Mein eigenes Produkt, komplett allein umgesetzt: Konzept, Gestaltung, Entwicklung und Betrieb.',
        /** From the repository's composer.json and package.json. */
        stack: ['Laravel', 'Inertia', 'React', 'TypeScript', 'Tailwind CSS', 'GSAP', 'Three.js', 'Stripe'],
        result: 'Live unter invitestudio.de, auf Deutsch, Türkisch und Englisch',
        href: 'https://invitestudio.de',
      },
    ] satisfies Project[] as Project[],
  },

  about: {
    heading: 'Über mich',
    paragraphs: [
      'Ich programmiere seit über zehn Jahren beruflich. In dieser Zeit habe ich in mehreren Unternehmen gearbeitet und Produkte in jeder Größe gebaut, vom kleinen Werkzeug bis zur großen Plattform.',
      'Heute bin ich bei GSVI in Bochum und leite als Lead die Entwicklung für das Akafö: Architektur, Backend, Server, Frontend und Mobile-App laufen bei mir zusammen.',
      'Gerade beschäftigt mich vor allem KI-Orchestrierung: mehrere Agenten so zu führen, dass am Ende verlässliche Software herauskommt und nicht nur schneller Code.',
      'Den Ausgleich hole ich mir im Sport, am liebsten im Kampfsport.',
    ],
    facts: [
      { label: 'Standort', value: 'Schwerte an der Ruhr' },
      { label: 'Aktuell', value: 'GSVI Gregor & Strozik Visual Identity, Bochum' },
      { label: 'Abschluss', value: 'Computer Science Expert, Software Development · Robert-Bosch-Berufskolleg, 2014–2017' },
      { label: 'Im Beruf', value: 'Seit 2014 als Full-Stack-Entwickler' },
    ],
    lists: [
      {
        label: 'Arbeitsweise',
        /** Draft principles, derived from the brief. Adjust freely. */
        items: [
          'Erst verstehen, dann bauen',
          'Details sind kein Extra',
          'Schnell laden, ruhig bewegen',
          'Code, den andere gern übernehmen',
        ] as Text[],
      },
      {
        label: 'Interessen',
        items: ['Boxen', 'Muay Thai', 'Fitness', 'Schwimmen'] as Text[],
      },
    ],
  },

  experience: {
    heading: 'Erfahrung und Fähigkeiten',
    stationsLabel: 'Stationen',
    skillsLabel: 'Fähigkeiten',
    /** Taken from LinkedIn. */
    stations: [
      { period: 'seit 2024', role: 'Digital Solutions Architect', organisation: 'GSVI Gregor & Strozik Visual Identity', place: 'Bochum' },
      { period: '2023–2024', role: 'Full-Stack Developer', organisation: 'Flixcheck', place: 'Essen' },
      { period: '2022–2023', role: 'Full Stack Engineer', organisation: 'Pflegia', place: 'Berlin, remote' },
      { period: '2021–2022', role: 'Software-Entwickler', organisation: 'adesso SE', place: 'Dortmund' },
      { period: '2020–2021', role: 'Full-Stack Developer', organisation: 'newcubator GmbH', place: 'Dortmund' },
      { period: '2019–2020', role: 'Full-Stack-Entwickler', organisation: 'Global IoT GmbH', place: '' },
      { period: '2014–2019', role: 'Full-Stack-Entwickler', organisation: 'blueBOX GmbH', place: 'Castrop-Rauxel' },
      { period: '2014–2017', role: 'Computer Science Expert, Software Development', organisation: 'Robert-Bosch-Berufskolleg', place: 'Dortmund' },
    ] satisfies Station[] as Station[],
    skills: [
      { label: 'Sprachen', items: ['TypeScript', 'JavaScript', 'PHP'] },
      { label: 'Frontend', items: ['React', 'Next.js', 'Vue.js', 'Angular'] },
      { label: 'Backend', items: ['NestJS', 'Express.js', 'Laravel', 'GraphQL', 'Apollo GraphQL'] },
      { label: 'Daten', items: ['Prisma', 'MongoDB'] },
      { label: 'Echtzeit', items: ['WebRTC', 'Socket.IO'] },
      { label: 'Arbeitsweise', items: ['Projektmanagement', 'Methoden der Software-Entwicklung', 'Kontinuierliche Verbesserung', 'Recherche', 'Englisch'] },
    ] satisfies SkillGroup[] as SkillGroup[],
  },

  contact: {
    heading: 'Lass uns sprechen',
    invitation:
      'Ob Projekt, feste Stelle oder eine kurze Frage: Ich freue mich über deine Nachricht.',
    greeting: 'Schreib mir',
  },

  legal: {
    imprint: '/impressum',
    privacy: '/datenschutz',
    /** Required in the imprint: a postal address where you can be served. */
    street: 'Märkische Straße 57' as Text,
    city: '58239' as Text,
    /** Where the site is hosted; named in the privacy notice. */
    host: 'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA' as Text,
    photographer: todo('Name der Fotografin oder des Fotografen') as Text,
    updated: 'November 2026',
  },
};

export type Site = typeof site;
