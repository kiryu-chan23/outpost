import { render } from 'preact';
import 'chessground/assets/chessground.base.css';
import './styles/app.css';
import './styles/pieces.css';
import { App } from './app.jsx';
import { initGames } from './lib/store.js';

// Games load from IndexedDB first, so lists and insights are complete on the first render.
initGames()
  .catch(() => {})
  .finally(() => render(<App />, document.getElementById('app')));
