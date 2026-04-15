// Centralized CV data — modificalo qui e si aggiorna ovunque nel sito.

export const profile = {
  name: 'Hamed Darzi',
  firstName: 'Hamed',
  lastName: 'Darzi',
  role: 'Web Developer',
  location: 'Torino, Italia',
  birth: '05 gennaio 1999',
  email: 'drzi.hamed@gmail.com',
  linkedin: 'https://linkedin.com/in/hamed-darzi-a8526b32a',
  github: 'https://github.com/hameddrzi',
  unsplash: 'https://unsplash.com',
  cvPdf: '/cv.pdf',
  tagline: 'Costruisco interfacce che non sembrano interfacce.',
  bio: `Sono Hamed Darzi, studente di Informatica presso l'Università di Torino.
Il mio interesse per questo campo nasce dalla passione per la risoluzione dei problemi
e dal desiderio di capire come funzionano le cose in profondità.
Mi considero una persona curiosa e comunicativa: mi piace confrontarmi con gli altri
e scambiare idee con persone di età e background diversi.
Amo viaggiare e conoscere nuove realtà culturali. Nel tempo libero mi dedico alla fotografia,
condividendo alcuni dei miei scatti su Unsplash.`,
};

export type Experience = {
  role: string;
  company: string;
  location: string;
  from: string;
  to: string;
  bullets: string[];
  stack: string[];
};

export const experiences: Experience[] = [
  {
    role: 'Frontend Web Developer (Stage)',
    company: 'Pindar Digital Dynamics S.R.L.',
    location: 'Torino, Italia',
    from: 'Novembre 2025',
    to: 'Marzo 2026',
    bullets: [
      'Sviluppo di una dashboard amministrativa scalabile per la gestione di dati e workflow interni, con focus su performance e usabilità per utenti non tecnici.',
      'Implementazione di interfacce responsive e user-friendly, sostituendo procedure manuali su database con flussi digitali efficienti.',
      'Realizzazione di funzionalità CRUD, tabelle avanzate con filtri dinamici e aggiornamenti real-time tramite GraphQL subscriptions.',
      'Scrittura di test E2E per la validazione dei flussi utente critici.',
      'Adozione di Husky (Git hooks) per automazione di linting, formatting ed esecuzione test pre-commit.',
      'Focus su qualità del codice tramite strict typing, code review e best practice frontend.',
    ],
    stack: ['React 18', 'TypeScript', 'Refine.dev', 'Ant Design', 'Hasura GraphQL', 'PostgreSQL', 'Husky', 'E2E testing'],
  },
  {
    role: 'Application Designer',
    company: 'XPhoto',
    location: 'Teheran, Iran',
    from: 'Febbraio 2019',
    to: 'Novembre 2021',
    bullets: [
      'Progettazione di componenti UI e asset grafici per applicazioni di photo editing orientate alla personalizzazione.',
      'Creazione di icone in-app coerenti con l\'identità visiva del prodotto.',
      'Realizzazione di animazioni per logo e schermate di avvio per migliorare engagement e impatto visivo.',
      'Collaborazione alla definizione dello stile visuale con Adobe Photoshop e After Effects.',
    ],
    stack: ['UI Design', 'Icon Design', 'Adobe Photoshop', 'After Effects', 'Motion Graphics'],
  },
];

export type Project = {
  name: string;
  kind: string;
  period?: string;
  description: string;
  stack: string[];
  link?: { url: string; label: string };
  icon: 'code' | 'health' | 'figma' | 'spark';
};

export const projects: Project[] = [
  {
    name: 'MedCheck',
    kind: 'Web Application · Progetto Accademico',
    description: `Piattaforma web responsive e mobile-first per la prenotazione sanitaria, sviluppata con React + Vite e Spring Boot REST API. Questionari medici guidati, ricerca medici con mappe interattive, filtri dinamici e flusso di prenotazione completo. Applicati principi HCI, linee guida WCAG e gestione privacy-aware dei dati.`,
    stack: ['React', 'Vite', 'Spring Boot', 'REST API', 'Capacitor', 'WCAG', 'HCI'],
    link: { url: 'https://github.com/hameddrzi/MedChek', label: 'github.com/hameddrzi/MedChek' },
    icon: 'health',
  },
  {
    name: 'Scuole Affiliate UniTo',
    kind: 'UX Research & Design',
    period: 'Settembre 2025 – Dicembre 2025',
    description: `Analisi di usabilità del sito istituzionale dell'Università di Torino tramite personas ed euristiche di Nielsen. Identificazione di criticità UX e accessibilità con focus su genitori, utenti anziani e persone con disabilità. Progettazione di un sito web dedicato conforme alle linee guida WCAG (A, AA, AAA), con struttura informativa di 5 pagine.`,
    stack: ['Figma', 'UX Research', 'WCAG', 'Information Architecture'],
    link: { url: '#', label: 'Progetto su Figma' },
    icon: 'figma',
  },
];

export const skills = {
  Programmazione: ['JavaScript', 'TypeScript', 'HTML5', 'CSS3', 'Java', 'C'],
  'Framework & librerie': ['React', 'Spring Boot', 'React Native', 'Angular'],
  'Backend & database': ['REST API', 'PostgreSQL', 'Database design'],
  'UI/UX': ['UI Design', 'UX Principles', 'Accessibility (WCAG)'],
  Strumenti: ['Figma', 'Photoshop', 'GitHub', 'Postman'],
};

export const education = [
  {
    title: 'Laurea in Scienze e Tecnologie Informatiche',
    place: 'Università di Torino',
    period: '2023 – oggi',
    location: 'Torino, Italia',
    note: 'Programmazione in C, Algoritmi e Strutture Dati, TDD, Software Engineering (Unified Process, Agile), Database (3NF, BCNF), Tecnologie Web (JavaScript, React, TypeScript, Spring Boot).',
  },
  {
    title: 'Post-diploma Tecnico',
    place: 'Università di Azad',
    period: '2016 – 2019',
    location: 'Teheran, Iran',
    note: 'Ciclo completo di sviluppo prodotto, analisi dei mercati target e posizionamento efficace.',
  },
];

export const certifications = [
  { issuer: 'Meta / Coursera', name: 'React Native' },
  { issuer: 'Meta / Coursera', name: 'JavaScript' },
  { issuer: 'Meta / Coursera', name: 'Version Control (Git & GitHub)' },
  { issuer: 'Coursera', name: 'Principles of UX/UI Design' },
];

export const languages = [
  { name: 'Persiano', level: 'Madrelingua' },
  { name: 'Italiano', level: 'B2' },
  { name: 'Inglese', level: 'B1' },
];
