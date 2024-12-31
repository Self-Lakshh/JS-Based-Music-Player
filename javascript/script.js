import { PlayerUI } from './ui.js';

document.addEventListener("DOMContentLoaded", () => {
  PlayerUI.init().catch(err => {
    console.error("Failed to initialize PlayerUI:", err);
  });
});
