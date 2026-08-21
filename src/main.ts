import './styles/base.css';
import './styles/typography.css';
import type { DecodeResponse } from '../shared/contracts/decode';
import { decodeContext, DecodeClientError } from './api/decode-client';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Sideglance app root is missing.');

const fridayMerge = `Kai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nLeo: nothing. enjoy your weekend`;
let state: 'idle' | 'submitting' | 'decoded' | 'needs_context' | 'failed' = 'idle';
let inputText = '';
let additionalContext = '';
let response: DecodeResponse | undefined;

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] ?? char); }

function render() {
  const result = response?.type === 'decoded' ? `<section class="result"><h2>What's actually happening?</h2><p class="snapshot">${escapeHtml(response.snapshot)}</p><div class="signals"><h3>What gave it away?</h3>${response.signals.map((signal) => `<article><strong>${escapeHtml(signal.quote)}</strong><span>${escapeHtml(signal.category.replace('_', ' '))}</span><p>${escapeHtml(signal.explanation)}</p></article>`).join('')}</div><div class="boundary"><h3>Would this sound natural?</h3><p><b>Natural</b> — ${escapeHtml(response.usageBoundary.natural)}</p><p><b>Depends</b> — ${escapeHtml(response.usageBoundary.depends)}</p><p><b>Probably avoid</b> — ${escapeHtml(response.usageBoundary.avoid)}</p></div></section>` : response?.type === 'needs_context' ? `<section class="needs"><h2>This could mean more than one thing.</h2><p>${escapeHtml(response.missingContext)}</p><label for="additional-context">${escapeHtml(response.question)}</label><textarea id="additional-context" rows="4" placeholder="Paste the line or moment that came before…">${escapeHtml(additionalContext)}</textarea><button class="primary-button" id="decode-again" type="button">Decode again →</button></section>` : response?.type === 'failed' ? `<section class="failed" role="alert"><h2>We couldn't decode that fixture.</h2><p>${escapeHtml(response.message)}</p></section>` : '';
  app!.innerHTML = `<header class="site-header"><a class="wordmark" href="/" aria-label="Sideglance home">Sideglance</a><span class="tagline">Read between the lines.</span></header><main class="scaffold-page"><p class="eyebrow">Context translation layer for the internet</p><h1>Understand more than the <span>words.</span></h1><p class="intro">Decode the tone, implied meaning, community context, and usage boundaries behind real internet conversations.</p><section class="capture"><label for="moment">Paste something you can read — but don't quite understand.</label><textarea id="moment" rows="7" placeholder="Paste a conversation, phrase, or message…">${escapeHtml(inputText)}</textarea><div class="actions"><button class="text-button" id="try-example" type="button">Try an example →</button><button class="primary-button" id="decode" type="button" ${state === 'submitting' ? 'disabled' : ''}>${state === 'submitting' ? 'Reading…' : 'Decode Context →'}</button></div></section>${result}<div class="status-note" role="status">${state === 'submitting' ? 'Finding the signals…' : 'Fixture mode · no AI or model API connected.'}</div></main>`;
  bind();
}

function bind() {
  document.querySelector<HTMLTextAreaElement>('#moment')?.addEventListener('input', (event) => { inputText = (event.target as HTMLTextAreaElement).value; });
  document.querySelector<HTMLTextAreaElement>('#additional-context')?.addEventListener('input', (event) => { additionalContext = (event.target as HTMLTextAreaElement).value; });
  document.querySelector('#try-example')?.addEventListener('click', () => { inputText = fridayMerge; response = undefined; state = 'idle'; render(); document.querySelector<HTMLTextAreaElement>('#moment')?.focus(); });
  document.querySelector('#decode')?.addEventListener('click', () => { void submit(inputText); });
  document.querySelector('#decode-again')?.addEventListener('click', () => { void submit('fearless behavior', additionalContext); });
}

async function submit(text: string, context?: string) {
  inputText = text; additionalContext = context ?? additionalContext; state = 'submitting'; response = undefined; render();
  try { response = await decodeContext({ inputText: text, additionalContext: context }); state = response.type; }
  catch (error) { response = { type: 'failed', errorCode: 'invalid_response', message: error instanceof DecodeClientError ? error.message : 'Unexpected decode error.' }; state = 'failed'; }
  render();
}

render();
