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
  const capture = !response ? `<main class="scaffold-page capture-page"><div class="capture-layout"><div class="hero-copy"><p class="eyebrow">A closer look at internet language</p><h1>Understand more than the <span>words.</span></h1><p class="intro">Decode the tone, implied meaning, community context, and usage boundaries behind real internet conversations.</p><p class="annotation">For the moments you can read —<br />but still don't quite get.</p></div><section class="capture"><label for="moment">Paste something you can read — but don't quite understand.</label><textarea id="moment" rows="7" placeholder="Paste a conversation, phrase, or message…">${escapeHtml(inputText)}</textarea><div class="actions"><button class="text-button" id="try-example" type="button">Try an example →</button><button class="primary-button" id="decode" type="button" ${state === 'submitting' ? 'disabled' : ''}>${state === 'submitting' ? 'Reading…' : 'Decode Context →'}</button></div></section></div>${state === 'submitting' ? '<p class="loading-note" role="status">Finding the signals…</p>' : ''}</main>` : '';
  const result = response?.type === 'decoded' ? `<main class="decode-page"><p class="eyebrow">A Sideglance note</p><h1>What's actually happening?</h1><p class="snapshot">${escapeHtml(response.snapshot)}</p><section class="evidence-flow"><h2>What gave it away?</h2>${response.signals.map((signal, index) => `<article><div class="signal-meta"><span>Signal ${String(index + 1).padStart(2, '0')}</span><small>${escapeHtml(signal.category.replace('_', ' '))}</small></div><blockquote>“${escapeHtml(signal.quote)}”</blockquote><p>${escapeHtml(signal.explanation)}</p><em>${index === 0 ? 'notice this' : index === 1 ? 'tone shift' : 'read the ending'}</em></article>`).join('')}</section><section class="boundary"><h2>Would this sound natural?</h2><p><b>Natural</b><span>${escapeHtml(response.usageBoundary.natural)}</span></p><p><b>Depends</b><span>${escapeHtml(response.usageBoundary.depends)}</span></p><p><b>Probably avoid</b><span>${escapeHtml(response.usageBoundary.avoid)}</span></p></section></main>` : response?.type === 'needs_context' ? `<main class="decode-page needs"><p class="eyebrow">A Sideglance note</p><h1>Need a little more context.</h1><p class="snapshot">${escapeHtml(response.missingContext)}</p><section class="context-request"><label for="additional-context">${escapeHtml(response.question)}</label><textarea id="additional-context" rows="4" placeholder="Paste the line or moment that came before…">${escapeHtml(additionalContext)}</textarea><button class="primary-button" id="decode-again" type="button">Decode again →</button></section></main>` : response?.type === 'failed' ? `<main class="decode-page failed" role="alert"><p class="eyebrow">A Sideglance note</p><h1>We couldn't decode that fixture.</h1><p>${escapeHtml(response.message)}</p></main>` : '';
  const devNote = import.meta.env.DEV ? '<div class="dev-only" aria-hidden="true">localhost · fixture mode</div>' : '';
  app!.innerHTML = `<header class="site-header"><a class="wordmark" href="/" aria-label="Sideglance home">Sideglance</a><span class="tagline">Read between the lines.</span></header>${capture}${result}${devNote}`;
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
