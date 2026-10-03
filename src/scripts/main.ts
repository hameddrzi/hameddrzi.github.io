// Entry point. OWNER: lead. Each agent exposes ONE init function; do not import section scripts here
// (section components carry their own <script> tags).
import { initApp } from './app';      // Agent "shell": lenis, scrolltrigger, preloader, cursor, fx
import { initGL } from './gl';        // Agent "gl": persistent particle world

initApp();
initGL(document.getElementById('gl') as HTMLCanvasElement);
