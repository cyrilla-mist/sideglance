import './styles/base.css';
import './styles/typography.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Sideglance app root is missing.');

app.innerHTML = `
  <header class="site-header">
    <a class="wordmark" href="/" aria-label="Sideglance home">Sideglance</a>
    <span class="tagline">Read between the lines.</span>
  </header>
  <main class="scaffold-page">
    <p class="eyebrow">Context translation layer for the internet</p>
    <h1>Understand more than the <span>words.</span></h1>
    <p class="intro">The formal Sideglance foundation is ready for the next implementation phase.</p>
    <div class="status-note" role="status">Scaffold only · no AI or model API connected.</div>
  </main>
`;
