import '@fontsource/lilita-one'; // display face (bundled, no CDN)
import '@fontsource-variable/nunito'; // body face
import './style.css';
import './core/input'; // registers input listeners on import
import { startGame } from './game/loop';

/* =========================================================================
   BOOMERANG BUFFET — an original arena brawler homage to the boomerang
   party-fighter genre. Cute food fighters fling returning boomerangs that
   bounce off walls and slice opponents. Grab power-ups, dash, and parry.
   Last snack standing wins.
   ========================================================================= */

// Kick the webfonts into loading — canvas text doesn't trigger font fetches
// on its own. The menus redraw every frame, so they swap in when ready.
if ('fonts' in document) {
  document.fonts.load('80px "Lilita One"');
  document.fonts.load('700 20px "Nunito Variable"');
}

startGame();
