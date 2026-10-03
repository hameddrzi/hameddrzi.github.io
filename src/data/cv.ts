// Single source of truth for all site content (EN + IT).
// Source: cv_en.tex / cv_it.tex (Oct 2026). Edit here, the whole site updates.

export type Lang = 'en' | 'it';
export const langs: Lang[] = ['en', 'it'];

type L = { en: string; it: string };
const t = (en: string, it: string): L => ({ en, it });

export const profile = {
  name: 'Hamed Darzi',
  firstName: 'Hamed',
  lastName: 'Darzi',
  role: t('Software Engineer', 'Software Engineer'),
  focus: t('Frontend & Mobile', 'Frontend & Mobile'),
  stackLine: 'React · React Native · TypeScript',
  location: t('Turin, Italy', 'Torino, Italia'),
  email: 'drzi.hamed@gmail.com',
  linkedin: 'https://www.linkedin.com/in/hamed-darzi-a8526b32a',
  github: 'https://github.com/hameddrzi',
  site: 'https://hameddrzi.github.io',
  photo: '/img/hamed.png',
  cvPdf: { en: '/cv/Hamed_Darzi_CV_EN.pdf', it: '/cv/Hamed_Darzi_CV_IT.pdf' },
  summary: t(
    'Software Engineer at a Turin startup, building full-stack web platforms in production with React, Next.js, TypeScript and PostgreSQL — and, in my own time, React Native apps with on-device AI. I come from UI design, so I care about interfaces that are clear, accessible (WCAG) and pleasant to use. Computer Science student at the University of Turin.',
    "Software Engineer in una startup di Torino: sviluppo piattaforme web full-stack in produzione con React, Next.js, TypeScript e PostgreSQL, e nel tempo libero app mobile in React Native con AI on-device. Vengo dal design UI, quindi curo interfacce chiare, accessibili (WCAG) e piacevoli da usare. Studente di Informatica all'Università di Torino.",
  ),
  // Short punchy lines for the hero / about (derived from the summary, no invented facts)
  pillars: [
    t('Production web platforms', 'Piattaforme web in produzione'),
    t('Mobile apps with on-device AI', 'App mobile con AI on-device'),
    t('A designer’s eye for UI', 'Occhio da designer per la UI'),
  ],
};

export type Role = { title: L; period: L; bullets: L[] };
export type Job = { company: string; place: L; roles: Role[]; stack: string[] };

export const experience: Job[] = [
  {
    company: 'Pindar Digital Dynamics S.r.l.',
    place: t('Turin · hybrid', 'Torino · ibrido'),
    stack: ['React', 'Next.js', 'TypeScript', 'Refine', 'AdminJS', 'Ant Design', 'Hasura GraphQL', 'PostgreSQL', 'Redis', 'Brevo', 'FFmpeg', 'Husky'],
    roles: [
      {
        title: t('Software Engineer', 'Software Engineer'),
        period: t('Jul 2026 – present', 'lug 2026 – oggi'),
        bullets: [
          t('Built a company CRM with React, AdminJS and Refine: data models, dashboards and internal tools.', 'Sviluppo di un CRM aziendale con React, AdminJS e Refine: modelli dati, dashboard e strumenti interni.'),
          t('Event-driven notification system: microservices that react to database events and send personalized emails through Brevo.', 'Sistema di notifiche event-driven: microservizi che reagiscono agli eventi del database e inviano email personalizzate con Brevo.'),
          t('Added Redis caching to cut the platform’s response times.', 'Caching con Redis per ridurre i tempi di risposta della piattaforma.'),
          t('Built P2Cam Studio, an FFmpeg-based web video editor, and a music streaming platform (pre-launch) with Next.js, PostgreSQL (Neon) and the Spotify and YouTube APIs.', 'P2Cam Studio, piattaforma web di video editing basata su FFmpeg, e una piattaforma di music streaming (pre-lancio) con Next.js, PostgreSQL (Neon) e API di Spotify e YouTube.'),
        ],
      },
      {
        title: t('Software Engineer – Intern', 'Software Engineer – Stage'),
        period: t('Nov 2025 – Jun 2026', 'nov 2025 – giu 2026'),
        bullets: [
          t('Back-office in React 18 and strict TypeScript with Refine and Ant Design that replaced manual database work for non-technical admins (47+ PostgreSQL tables via Hasura GraphQL).', 'Back-office in React 18 e TypeScript (strict) con Refine e Ant Design, che ha sostituito le operazioni manuali sul database per utenti non tecnici (47+ tabelle PostgreSQL via Hasura GraphQL).'),
          t('Advanced tables with filters, sorting and bulk actions, real-time updates via GraphQL subscriptions, CSV/Excel/JSON export.', 'Tabelle avanzate con filtri, ordinamento e azioni massive, aggiornamenti real-time con GraphQL subscriptions, export CSV/Excel/JSON.'),
          t('E2E tests on critical user flows and pre-commit checks with Husky (lint, formatting, tests).', 'Test E2E sui flussi critici e controlli pre-commit con Husky (lint, formattazione, test).'),
        ],
      },
    ],
  },
  {
    company: 'Xphoto',
    place: t('Tehran, Iran', 'Teheran, Iran'),
    stack: ['UI Design', 'Icon Design', 'Photoshop', 'After Effects'],
    roles: [
      {
        title: t('Application Designer (part-time)', 'Application Designer (part-time)'),
        period: t('Feb 2019 – Nov 2021', 'feb 2019 – nov 2021'),
        bullets: [
          t('UI, icons and launch animations for the PhotoKit photo-editing app (Google Play), using Photoshop and After Effects.', "UI, icone e animazioni di avvio per l'app di photo editing PhotoKit (Google Play), con Photoshop e After Effects."),
        ],
      },
    ],
  },
];

// Hard numbers taken verbatim from the CV — safe to use as big stats.
export const stats = [
  { value: 47, suffix: '+', label: t('PostgreSQL tables behind one back-office', 'tabelle PostgreSQL dietro un back-office') },
  { value: 103, suffix: '', label: t('tests in CookWhat', 'test in CookWhat') },
  { value: 3, suffix: '', label: t('languages transcribed on-device', 'lingue trascritte on-device') },
  { value: 1, suffix: 's', label: t('heart-rate sample interval over BLE', 'intervallo campioni battito via BLE') },
];

export type ProjectKey = 'voice' | 'cookwhat' | 'heart' | 'medcheck';
export type Project = {
  key: ProjectKey; // also the GL form name
  index: string;
  name: string;
  tagline: L;
  description: L;
  stack: string[];
  facts: L[];
  link?: string;
  images?: string[];
  accent: string; // per-project accent color
};

export const projects: Project[] = [
  {
    key: 'voice',
    index: '01',
    name: 'Voice',
    tagline: t('On-device speech-to-text', 'Speech-to-text on-device'),
    description: t(
      'Voice-notes app that transcribes Italian, English and Persian entirely on the phone, with no server: a live transcript while recording and a final time-coded transcript.',
      'App di note vocali che trascrive italiano, inglese e persiano interamente sul telefono, senza server: trascrizione live durante la registrazione e trascrizione finale con timestamp.',
    ),
    stack: ['React Native', 'TypeScript', 'Whisper'],
    facts: [t('IT · EN · FA', 'IT · EN · FA'), t('0 servers', '0 server'), t('Live + time-coded', 'Live + timestamp')],
    link: 'https://github.com/hameddrzi/speech_to_text_App',
    images: ['/img/projects/voice-1.jpg', '/img/projects/voice-2.jpg', '/img/projects/voice-3.jpg'],
    accent: '#7cf7ff',
  },
  {
    key: 'cookwhat',
    index: '02',
    name: 'CookWhat',
    tagline: t('AI recipe app', 'Ricette con AI'),
    description: t(
      "Suggests what to cook from what's in your fridge; 65 offline recipes, Cook Mode and meal planning. AI key and quota kept server-side (Edge Functions), migrated from Firebase to Supabase, 103 tests.",
      'Suggerisce cosa cucinare con ciò che hai in frigo; 65 ricette offline, Cook Mode e piano pasti. Chiave AI e quota solo lato server (Edge Functions), migrazione da Firebase a Supabase, 103 test.',
    ),
    stack: ['React Native', 'Supabase', 'Google Gemini'],
    facts: [t('65 offline recipes', '65 ricette offline'), t('103 tests', '103 test'), t('Firebase → Supabase', 'Firebase → Supabase')],
    accent: '#ffb547',
  },
  {
    key: 'heart',
    index: '03',
    name: 'Pulse',
    tagline: t('Real-time heart rate from a Galaxy Watch', 'Battito in tempo reale da Galaxy Watch'),
    description: t(
      'Smartwatch app that sends the heart rate to the phone every second over Bluetooth Low Energy (GATT), with about 2 s of delay, even in the background.',
      'App per smartwatch che invia il battito ogni secondo al telefono via Bluetooth Low Energy (GATT), con circa 2 s di ritardo, anche in background.',
    ),
    stack: ['Kotlin', 'Wear OS', 'BLE'],
    facts: [t('1 Hz stream', 'Flusso 1 Hz'), t('~2 s latency', '~2 s di ritardo'), t('Runs in background', 'Anche in background')],
    accent: '#ff4d6d',
  },
  {
    key: 'medcheck',
    index: '04',
    name: 'MedCheck',
    tagline: t('Healthcare booking · university project', 'Prenotazioni sanitarie · progetto universitario'),
    description: t(
      'Mobile-first web app with a guided questionnaire, a doctor map with filters and a full booking flow, designed around HCI principles and WCAG.',
      'Web app mobile-first con questionario guidato, mappa dei medici con filtri e prenotazione completa, progettata secondo principi HCI e WCAG.',
    ),
    stack: ['React', 'TypeScript', 'Spring Boot'],
    facts: [t('Mobile-first', 'Mobile-first'), t('HCI + WCAG', 'HCI + WCAG'), t('Map + filters', 'Mappa + filtri')],
    link: 'https://github.com/hameddrzi/MedChek',
    accent: '#8b7bff',
  },
];

export const skills: { group: L; items: string[] }[] = [
  { group: t('Frontend', 'Frontend'), items: ['React', 'Next.js', 'TypeScript', 'JavaScript', 'HTML5', 'CSS3', 'Refine', 'Ant Design'] },
  { group: t('Mobile', 'Mobile'), items: ['React Native', 'Expo', 'Kotlin', 'Wear OS', 'Bluetooth LE'] },
  { group: t('Backend & data', 'Backend e dati'), items: ['REST APIs', 'GraphQL (Hasura)', 'PostgreSQL', 'Supabase', 'Redis', 'Spring Boot'] },
  { group: t('Tools & practices', 'Strumenti e metodi'), items: ['Git / GitHub', 'E2E testing', 'Husky', 'Agile', 'Figma', 'Brevo', 'FFmpeg'] },
];

export const education = [
  {
    title: t('BSc in Computer Science', 'Laurea triennale in Informatica'),
    place: t('University of Turin', 'Università degli Studi di Torino'),
    period: t('2023 – present', '2023 – in corso'),
    note: t(
      'Algorithms and data structures, Databases, Software engineering (Agile, TDD), Web technologies.',
      'Algoritmi e strutture dati, Basi di dati, Ingegneria del software (Agile, TDD), Tecnologie web.',
    ),
  },
  {
    title: t('Post-secondary technical diploma, Arts', 'Diploma tecnico post-secondario, Arti'),
    place: t('Islamic Azad University, Tehran', 'Islamic Azad University, Teheran'),
    period: t('2016 – 2019', '2016 – 2019'),
    note: t('', ''),
  },
];

export const certifications = ['Meta React Native', 'Meta JavaScript', 'Meta Version Control (Git)', 'Principles of UX/UI Design'];

export const languages = [
  { name: t('Persian', 'Persiano'), level: t('Native', 'Madrelingua'), value: 1 },
  { name: t('Italian', 'Italiano'), level: 'B2', value: 0.75 },
  { name: t('English', 'Inglese'), level: 'B1', value: 0.6 },
];

// UI strings
export const ui = {
  nav: {
    about: t('About', 'Chi sono'),
    work: t('Experience', 'Esperienza'),
    projects: t('Projects', 'Progetti'),
    skills: t('Skills', 'Competenze'),
    contact: t('Contact', 'Contatti'),
  },
  downloadCv: t('Download CV', 'Scarica CV'),
  scroll: t('Scroll', 'Scorri'),
  available: t('Open to new opportunities', 'Aperto a nuove opportunità'),
  sayHello: t('Let’s build something', 'Costruiamo qualcosa'),
  copyEmail: t('Copy email', 'Copia email'),
  copied: t('Copied', 'Copiato'),
  viewCode: t('View code', 'Vedi codice'),
  education: t('Education', 'Formazione'),
  certifications: t('Certifications', 'Certificazioni'),
  languages: t('Languages', 'Lingue'),
  present: t('present', 'oggi'),
  rights: t('Designed & built by Hamed Darzi', 'Progettato e sviluppato da Hamed Darzi'),
};

// helper: pick a localized value
export const tr = (v: L | string, lang: Lang): string => (typeof v === 'string' ? v : v[lang]);
