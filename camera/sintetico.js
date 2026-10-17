// Gera imagens sintéticas de um tabuleiro em perspectiva, para os testes da visão e da página.
const V = require('./visao.js');
const { ocupacaoDoJogo } = require('./leitura.js');
const { ChessGame } = require('./regras.js');

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// H_real leva coordenadas do tabuleiro para pixels da câmera.
// posicao: matriz 8x8 de 'v' | 'w' | 'b' (linha 0 = 8ª fileira).
function renderizar({ largura = 640, altura = 480, H_real, posicao, mao = null, ruido = 6, semente = 1 }) {
  const Hi = V.inversa(H_real);
  const data = new Uint8ClampedArray(largura * altura * 4);
  const sorteio = rng(semente);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const [u, v] = V.aplicar(Hi, x + 0.5, y + 0.5);
    let R, G, B;
    if (u >= 0 && v >= 0 && u < 8 && v < 8) {
      const col = Math.floor(u), lin = Math.floor(v);
      const clara = (lin + col) % 2 === 0;
      [R, G, B] = clara ? [226, 205, 170] : [170, 120, 85];
      const peca = posicao[lin][col];
      if (Math.hypot(u - (col + 0.5), v - (lin + 0.5)) < 0.36) {
        if (peca === 'w') [R, G, B] = [242, 240, 232];
        if (peca === 'b') [R, G, B] = [35, 32, 38];
      }
      if (mao && Math.hypot(u - mao.u, v - mao.v) < mao.raio) [R, G, B] = [205, 150, 120];
    } else {
      [R, G, B] = [80, 80, 85];
    }
    const luz = 0.8 + 0.25 * x / largura;
    const ajuste = () => (sorteio() * 2 - 1) * ruido;
    const o = (y * largura + x) * 4;
    data[o] = R * luz + ajuste();
    data[o + 1] = G * luz + ajuste();
    data[o + 2] = B * luz + ajuste();
    data[o + 3] = 255;
  }
  return { width: largura, height: altura, data };
}

const CANTOS_TABULEIRO = [[0, 0], [8, 0], [8, 8], [0, 8]]; // a8, h8, h1, a1
const H_REAL = V.homografia(CANTOS_TABULEIRO, [[118, 62], [522, 84], [560, 418], [88, 402]]);
const inicial = () => ocupacaoDoJogo(new ChessGame().board);

function aposLances(lances) {
  const g = new ChessGame();
  for (const [a, b] of lances) {
    const r = g.play(a, b);
    if (r.error) throw new Error(r.error);
  }
  return ocupacaoDoJogo(g.board);
}

module.exports = { rng, renderizar, CANTOS_TABULEIRO, H_REAL, inicial, aposLances };
