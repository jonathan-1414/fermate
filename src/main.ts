import './style.css';
import { moduleFromSearch } from './modules';
import { startApp } from './ui/app';
import { startFullApp } from './ui/appFull';
import { startFileTest } from './ui/fileTest';

const module = moduleFromSearch(location.search);
const root = document.querySelector<HTMLDivElement>('#app')!;

// The music font must be loaded before VexFlow measures and draws.
// The full version has its own input (overwriting, see CLAUDE.md section 5).
// TEMPORARY (…/?dateitest): test page for the file picker on the iPad, see fileTest.ts.
if (new URLSearchParams(location.search).has('dateitest')) startFileTest(root);
else document.fonts.load('30px Bravura').then(() => (module.overwrite ? startFullApp : startApp)(root, module));
