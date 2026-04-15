# Hamed Darzi — Portfolio

Sito portfolio in [Astro](https://astro.build). Dark, cinematic, particle‑driven.

## Sviluppo locale

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # output in ./dist
npm run preview
```

## Modificare i contenuti

Tutto il testo (bio, esperienze, progetti, skill, contatti) sta in
[`src/data/cv.ts`](src/data/cv.ts). Modifica quel file e l'intero sito si
aggiorna.

Il PDF del CV linkato dalla nav sta in `public/cv.pdf`.

## Deploy su GitHub Pages

1. Crea su GitHub il repo `hameddrzi.github.io` (user site → servirà la root).
2. Nella pagina del repo, `Settings → Pages → Build and deployment → Source`:
   scegli **GitHub Actions**.
3. Push del contenuto della cartella `portfolio/` sul branch `main`.

```bash
cd portfolio
git init
git add .
git commit -m "initial portfolio"
git branch -M main
git remote add origin https://github.com/hameddrzi/hameddrzi.github.io.git
git push -u origin main
```

Il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
costruisce con `npm run build` e pubblica `dist/`. Dopo ~1 minuto il sito
sarà live su `https://hameddrzi.github.io`.

### Project site (repo diverso, es. `portfolio`)

Se il repo NON si chiama `hameddrzi.github.io` ma ad esempio `portfolio`,
modifica [`astro.config.mjs`](astro.config.mjs):

```js
site: 'https://hameddrzi.github.io',
base: '/portfolio',
```

## Struttura

```
src/
├── components/   # Hero, About, Experience, Projects, Skills, Contact, Nav, Cursor
├── data/cv.ts    # single source of truth per tutti i contenuti
├── layouts/      # shell HTML + reveal-on-scroll
├── pages/        # index.astro
└── styles/       # global.css (design tokens, tipografia)
public/
├── cv.pdf        # scaricabile dalla nav
└── .nojekyll
```

## Design & ispirazioni

- **Hero**: canvas con ~migliaia di particelle che formano "HAMED" e
  reagiscono al mouse (muovi per spostarle, click per un'esplosione).
  Ispirato a [Particulate].
- **Timeline esperienze**: linea sfumata purple→yellow→green→blue stile
  gradient CodePen.
- **Projects**: path SVG dashed scroll-driven (offset animato in base allo
  scroll) che attraversa le card. Ispirato a UI2.
- **Cursor**: follower con `mix-blend-mode: difference`.
- **Fonts**: Inter (UI), Space Grotesk (display), Source Code Pro (mono).

## Accessibilità

- Contrasti AA+, focus ring visibile, `prefers-reduced-motion` rispettato dove
  le animazioni sono decorative (particle canvas opzionale, cursor nascosto
  su touch).
- Struttura semantica `<section>`, landmark, ordine tab corretto.
