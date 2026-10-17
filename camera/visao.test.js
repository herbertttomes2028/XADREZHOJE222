const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('./visao.js');
const { Partida, Detector, ocupacaoDoJogo } = require('./leitura.js');

const { renderizar, CANTOS_TABULEIRO, H_REAL, inicial, aposLances } = require('./sintetico.js');

function aprenderInicial(classificador, H = H_REAL, sementes = [1, 2, 3]) {
  const amostras = sementes.map(s => {
    const img = renderizar({ H_real: H_REAL, posicao: inicial(), semente: s });
    return { feats: V.caracteristicasTabuleiro(img, H), rotulos: inicial() };
  });
  return classificador.aprender(amostras);
}

function diferencas(a, b) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (a[r][c] !== b[r][c]) out.push(r + ',' + c);
  return out;
}

test('a homografia dos 4 cantos leva cada canto ao pixel correto', () => {
  const H = V.homografia(CANTOS_TABULEIRO, [[118, 62], [522, 84], [560, 418], [88, 402]]);
  const alvo = [[118, 62], [522, 84], [560, 418], [88, 402]];
  CANTOS_TABULEIRO.forEach(([u, v], i) => {
    const [x, y] = V.aplicar(H, u, v);
    assert.ok(Math.abs(x - alvo[i][0]) < 1e-6 && Math.abs(y - alvo[i][1]) < 1e-6);
  });
});

test('posição inicial é lida exatamente depois de aprendida', () => {
  const cl = new V.Classificador();
  const diag = aprenderInicial(cl);
  assert.equal(diag.ok, true, diag.motivos.join(' '));
  const img = renderizar({ H_real: H_REAL, posicao: inicial(), semente: 9 });
  const { leitura } = cl.ler(V.caracteristicasTabuleiro(img, H_REAL));
  assert.deepEqual(diferencas(leitura, inicial()), []);
});

test('lance de peão é lido na casa certa depois do aprendizado com a posição inicial', () => {
  const cl = new V.Classificador();
  aprenderInicial(cl);
  const depois = aposLances([['e2', 'e4']]);
  const img = renderizar({ H_real: H_REAL, posicao: depois, semente: 21, ruido: 10 });
  const { leitura } = cl.ler(V.caracteristicasTabuleiro(img, H_REAL));
  assert.deepEqual(diferencas(leitura, depois), []);
});

test('cantos marcados com 3 pixels de erro não mudam a leitura', () => {
  const cl = new V.Classificador();
  aprenderInicial(cl);
  const cantosErrados = [[121, 59], [519, 87], [557, 421], [85, 399]];
  const H_clicado = V.homografia(CANTOS_TABULEIRO, cantosErrados);
  const img = renderizar({ H_real: H_REAL, posicao: inicial(), semente: 33 });
  const { leitura } = cl.ler(V.caracteristicasTabuleiro(img, H_clicado));
  assert.deepEqual(diferencas(leitura, inicial()), []);
});

test('tabuleiro girado 180 graus é sinalizado no diagnóstico de calibração', () => {
  const girada = inicial().map((_, lin) => inicial()[7 - lin].slice().reverse());
  const cl = new V.Classificador();
  const amostras = [1, 2, 3].map(s => {
    const img = renderizar({ H_real: H_REAL, posicao: girada, semente: s });
    return { feats: V.caracteristicasTabuleiro(img, H_REAL), rotulos: inicial() };
  });
  const diag = cl.aprender(amostras);
  assert.equal(diag.ok, false);
  assert.match(diag.motivos[0], /brancas/);
});

test('mão sobre o tabuleiro não gera lance; depois de sair, o lance é registrado', () => {
  const cl = new V.Classificador();
  aprenderInicial(cl);
  const det = new Detector(new Partida());
  const depois = aposLances([['e2', 'e4']]);
  // Mão cobre e4 e a região vizinha: centro na casa e4 (coluna 4, linha 4).
  const mao = { u: 4.5, v: 4.5, raio: 0.9 };

  let t = 0, lancesDuranteMao = 0;
  for (let i = 0; i < 12; i++, t += 400) {
    const img = renderizar({ H_real: H_REAL, posicao: depois, mao, semente: 100 + i });
    const { leitura } = cl.ler(V.caracteristicasTabuleiro(img, H_REAL));
    const r = det.processar(leitura, t);
    if (r.status === 'lance') lancesDuranteMao++;
  }
  assert.equal(lancesDuranteMao, 0, 'com a mão sobre o tabuleiro não pode haver lance');

  let r = null;
  for (let i = 0; i < 8 && (!r || r.status === 'aguardando'); i++, t += 400) {
    const img = renderizar({ H_real: H_REAL, posicao: depois, semente: 200 + i });
    const { leitura } = cl.ler(V.caracteristicasTabuleiro(img, H_REAL));
    r = det.processar(leitura, t);
  }
  assert.equal(r.status, 'lance');
  assert.equal(r.lance.san, 'e4');
});
