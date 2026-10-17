// Teste de integração: executa teste-camera.html no jsdom, com câmera e canvas simulados.
// Requer: npm install jsdom
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { renderizar, H_REAL, aposLances, inicial } = require('./sintetico.js');

const dir = __dirname;
const lerScript = f => `<script>${fs.readFileSync(path.join(dir, f), 'utf8')}</script>`;
let html = fs.readFileSync(path.join(dir, 'teste-camera.html'), 'utf8');
html = html.replace('<script src="regras.js"></script>', lerScript('regras.js'))
  .replace('<script src="leitura.js"></script>', lerScript('leitura.js'))
  .replace('<script src="visao.js"></script>', lerScript('visao.js'));

const esperar = ms => new Promise(r => setTimeout(r, ms));

function criarContexto(canvas) {
  const buf = () => {
    if (!canvas.__buf || canvas.__buf.length !== canvas.width * canvas.height * 4) {
      canvas.__buf = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    }
    return canvas.__buf;
  };
  const noop = () => {};
  return {
    drawImage(src) {
      if (src && src.tagName === 'VIDEO') canvas.__buf = new Uint8ClampedArray(canvas.ownerDocument.defaultView.__frame.data);
    },
    getImageData(x, y, w, h) {
      return new (canvas.ownerDocument.defaultView.ImageData)(new Uint8ClampedArray(buf()), canvas.width, canvas.height);
    },
    putImageData(img) { canvas.__buf = new Uint8ClampedArray(img.data); },
    clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
    stroke: noop, fill: noop, arc: noop, fillText: noop, strokeText: noop
  };
}

function abrirPagina(frameInicial) {
  const dom = new JSDOM(html, {
    url: 'https://exemplo.test/xadrez/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
      Object.defineProperty(window.navigator, 'mediaDevices', {
        value: { getUserMedia: async () => ({ getTracks: () => [] }) }, configurable: true
      });
      Object.defineProperty(window.HTMLVideoElement.prototype, 'videoWidth', { get: () => 640 });
      Object.defineProperty(window.HTMLVideoElement.prototype, 'videoHeight', { get: () => 480 });
      Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', { get: () => 4 });
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.HTMLCanvasElement.prototype.getContext = function () {
        if (!this.__ctx) this.__ctx = criarContexto(this);
        return this.__ctx;
      };
      window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
        return { left: 0, top: 0, width: this.width, height: this.height };
      };
    }
  });
  dom.window.__frame = frameInicial;
  return dom;
}

test('página: ligar câmera, marcar cantos, aprender posição inicial e registrar o lance e4', async () => {
  const frame = renderizar({ H_real: H_REAL, posicao: inicial(), semente: 1 });
  const dom = abrirPagina(frame);
  const w = dom.window, doc = w.document;
  const $ = id => doc.getElementById(id);
  const clicar = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const clicarNoPonto = (x, y) => $('overlay').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));

  try {
    // 1. Câmera
    clicar($('btnLigar'));
    await esperar(50);
    assert.match($('msg').textContent, /Câmera ligada/);

    // 2. Cantos: a8, h8, h1, a1 (pixels do tabuleiro do cenário)
    clicar($('btnCapturar'));
    for (const [x, y] of [[118, 62], [522, 84], [560, 418], [88, 402]]) clicarNoPonto(x, y);
    assert.equal($('btnAprender').disabled, false, 'o botão de aprender deve liberar depois dos 4 cantos');

    // 3. Aprender posição inicial (8 quadros, a cada 250 ms)
    clicar($('btnAprender'));
    await esperar(2600);
    assert.match($('msg').textContent, /aprendida/, 'msg: ' + $('msg').textContent);
    assert.equal($('btnIniciarPartida').disabled, false);

    // 4. Iniciar partida
    clicar($('btnIniciarPartida'));
    assert.match($('msg').textContent, /Partida iniciada/);

    // 5. Jogar e4 diante da câmera
    w.__frame = renderizar({ H_real: H_REAL, posicao: aposLances([['e2', 'e4']]), semente: 7 });
    await esperar(2600);
    assert.match($('msg').textContent, /Lance registrado: e4/, 'msg: ' + $('msg').textContent);
    assert.match($('lances').textContent, /e4/);
    assert.match($('fen').textContent, /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b /);
  } finally {
    w.close();
  }
});

test('página: posição que não é a inicial não deixa iniciar a partida', async () => {
  const frame = renderizar({ H_real: H_REAL, posicao: inicial(), semente: 1 });
  const dom = abrirPagina(frame);
  const w = dom.window, doc = w.document;
  const $ = id => doc.getElementById(id);
  const clicar = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const clicarNoPonto = (x, y) => $('overlay').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  try {
    clicar($('btnLigar'));
    await esperar(50);
    clicar($('btnCapturar'));
    for (const [x, y] of [[118, 62], [522, 84], [560, 418], [88, 402]]) clicarNoPonto(x, y);
    clicar($('btnAprender'));
    await esperar(2600);
    // Depois de aprender, o tabuleiro físico é mudado: peão de e2 some.
    w.__frame = renderizar({ H_real: H_REAL, posicao: aposLances([['e2', 'e4']]).map((l, i) => l), semente: 3 });
    clicar($('btnIniciarPartida'));
    assert.match($('msg').textContent, /não está na posição inicial/);
    assert.match($('msg').textContent, /e2|e4/);
  } finally {
    w.close();
  }
});
