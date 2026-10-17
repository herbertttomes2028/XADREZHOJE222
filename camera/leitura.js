/* Motor de leitura do tabuleiro físico.
   A cada quadro da câmera, recebe uma matriz 8x8 com o que se enxerga em cada casa:
     'v' = casa vazia | 'w' = peça branca | 'b' = peça preta | '?' = casa coberta ou não visível
   Orientação: linha 0 = 8ª fileira, coluna 0 = coluna "a" (a mesma do motor de regras).
   Este módulo não identifica o tipo das peças. Ele compara as cores das casas com os lances
   legais a partir da última posição confirmada, e só registra quando a explicação é única. */
(function (root) {
  'use strict';

  const RG = (typeof module !== 'undefined' && module.exports)
    ? require('./regras.js')
    : root.XadrezRegras;
  const { ChessGame, copy, color, FILES } = RG;

  const VAZIA = 'v', BRANCA = 'w', PRETA = 'b', OCULTA = '?';
  const VALORES = [VAZIA, BRANCA, PRETA, OCULTA];
  // Um lance normal muda 2 casas; en passant muda 3; roque muda 4.
  const MIN_CASAS = 2, MAX_CASAS = 4;

  const nomeCasa = (r, c) => FILES[c] + (8 - r);
  const chaveDaLeitura = l => l.map(linha => linha.join('')).join('/');

  function validar(l) {
    if (!Array.isArray(l) || l.length !== 8) throw new Error('A leitura precisa ter 8 linhas.');
    for (const linha of l) {
      if (!Array.isArray(linha) || linha.length !== 8) throw new Error('Cada linha precisa ter 8 casas.');
      for (const v of linha) if (!VALORES.includes(v)) throw new Error('Valor inválido na leitura: ' + v);
    }
  }

  function ocupacaoDoJogo(board) {
    return board.map(linha => linha.map(p => (p ? (color(p) === 'w' ? BRANCA : PRETA) : VAZIA)));
  }

  function diferencas(a, b) {
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (a[r][c] !== b[r][c]) out.push({ r, c });
    return out;
  }

  // Aceita uma leitura só quando ela fica igual por tempo e quadros suficientes.
  class Estabilizador {
    constructor({ tempoMs = 1500, minQuadros = 5 } = {}) {
      this.tempoMs = tempoMs;
      this.minQuadros = minQuadros;
      this.chave = null;
      this.desde = 0;
      this.quadros = 0;
    }
    atualizar(chave, agora) {
      if (chave !== this.chave) {
        this.chave = chave;
        this.desde = agora;
        this.quadros = 1;
        return false;
      }
      this.quadros++;
      return agora - this.desde >= this.tempoMs && this.quadros >= this.minQuadros;
    }
    reiniciar() {
      this.chave = null;
      this.desde = 0;
      this.quadros = 0;
    }
  }

  // Partida registrada: regras oficiais, histórico, FEN e PGN.
  class Partida {
    constructor() {
      this.jogo = new ChessGame();
    }
    ocupacao() { return ocupacaoDoJogo(this.jogo.board); }
    lancesLegais() { return this.jogo.allLegal(); }
    confirmar(de, para, promocao) {
      const r = this.jogo.play(de, para, promocao || 'q');
      if (r.error) throw new Error(r.error);
      return r.move;
    }
    desfazer() { return this.jogo.undo(); }
    fen() { return this.jogo.fen(); }
    historico() { return this.jogo.moves.map(m => m.san); }
    resultado() {
      const s = this.jogo.status;
      if (!s) return '*';
      if (s.kind === 'draw') return '1/2-1/2';
      return s.winner === 'w' ? '1-0' : '0-1';
    }
    pgn(meta = {}) {
      const res = this.resultado();
      const cabecalho = [
        ['Event', meta.evento || 'Partida física'],
        ['Site', meta.local || '?'],
        ['Date', meta.data || '????.??.??'],
        ['White', meta.brancas || '?'],
        ['Black', meta.pretas || '?'],
        ['Result', res]
      ].map(([k, v]) => `[${k} "${v}"]`).join('\n');
      const partes = this.jogo.moves.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : '') + m.san);
      partes.push(res);
      const linhas = [];
      let atual = '';
      for (const p of partes) {
        if ((atual + ' ' + p).trim().length > 80) { linhas.push(atual.trim()); atual = p; }
        else atual = atual + ' ' + p;
      }
      if (atual.trim()) linhas.push(atual.trim());
      return cabecalho + '\n\n' + linhas.join('\n') + '\n';
    }
  }

  // Interpreta cada leitura estável e decide se houve lance.
  class Detector {
    constructor(partida, opcoes) {
      this.partida = partida;
      this.estab = new Estabilizador(opcoes);
      this.ultimaChave = null;
      this.pendencia = null;
      this.aguardandoRestauracao = false;
    }

    // Antes de começar: confere se o tabuleiro está na posição inicial (brancas embaixo).
    verificarInicio(leitura) {
      validar(leitura);
      const esperado = ocupacaoDoJogo(new ChessGame().board);
      const casasErradas = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (leitura[r][c] !== esperado[r][c]) casasErradas.push(nomeCasa(r, c));
      }
      return { ok: casasErradas.length === 0, casasErradas };
    }

    // Chamado a cada quadro da câmera. agora = tempo em milissegundos.
    processar(leitura, agora) {
      validar(leitura);

      if (leitura.some(linha => linha.includes(OCULTA))) {
        this.estab.reiniciar();
        return { status: 'aguardando', motivo: 'Há casas cobertas pela mão ou fora da imagem.' };
      }

      const chave = chaveDaLeitura(leitura);
      if (!this.estab.atualizar(chave, agora)) {
        return { status: 'aguardando', motivo: 'Estabilizando a leitura.' };
      }
      if (chave === this.ultimaChave) {
        return { status: 'repouso', pendente: this.pendencia };
      }

      // Nova leitura estável: a anterior deixa de valer.
      this.ultimaChave = chave;
      this.pendencia = null;

      const difs = diferencas(this.partida.ocupacao(), leitura);
      if (difs.length === 0) {
        this.aguardandoRestauracao = false;
        return { status: 'sem-mudanca' };
      }
      const casas = difs.map(d => nomeCasa(d.r, d.c));

      if (this.aguardandoRestauracao) {
        this.pendencia = { status: 'anomalia', motivo: 'Aguardando o tabuleiro físico voltar à posição anterior ao lance desfeito.', casas };
        return this.pendencia;
      }

      if (difs.length < MIN_CASAS || difs.length > MAX_CASAS) {
        const motivo = difs.length < MIN_CASAS
          ? 'Uma casa mudou, mas nenhum lance foi completado. Se a peça ainda está na mão, coloque-a na casa de destino.'
          : 'Mudaram casas demais ao mesmo tempo. Confira o tabuleiro e corrija a posição.';
        this.pendencia = { status: 'anomalia', motivo, casas };
        return this.pendencia;
      }

      const todos = this.partida.lancesLegais();
      const compativeis = todos.filter(m => this._explica(m, leitura));

      if (compativeis.length === 0) {
        this.pendencia = { status: 'erro', motivo: 'Nenhum lance legal explica essa mudança. A posição registrada foi mantida.', casas };
        return this.pendencia;
      }

      const opcoes = compativeis.map(m => ({
        san: this.partida.jogo.sanOf(m, todos),
        de: m.from,
        para: m.to,
        promocao: m.promotion || null
      }));
      const destinos = new Set(compativeis.map(m => m.from + m.to));

      if (destinos.size > 1) {
        this.pendencia = { status: 'ambiguo', motivo: 'Mais de um lance combina com essa mudança. Escolha qual foi.', casas, opcoes };
        return this.pendencia;
      }
      if (compativeis.length > 1) {
        this.pendencia = { status: 'escolher', motivo: 'O peão chegou à última fileira. Escolha a peça da promoção.', casas, opcoes };
        return this.pendencia;
      }

      const m = compativeis[0];
      const lance = this.partida.confirmar(m.from, m.to, m.promotion);
      return { status: 'lance', lance, fen: this.partida.fen() };
    }

    // Usado quando há promoção ou lance ambíguo: o operador escolhe pelo SAN.
    escolher(san) {
      const p = this.pendencia;
      if (!p || !p.opcoes || (p.status !== 'escolher' && p.status !== 'ambiguo')) {
        throw new Error('Não há lance aguardando escolha.');
      }
      const op = p.opcoes.find(o => o.san === san);
      if (!op) throw new Error('Opção inválida: ' + san);
      const lance = this.partida.confirmar(op.de, op.para, op.promocao);
      this.pendencia = null;
      return { status: 'lance', lance, fen: this.partida.fen() };
    }

    // Desfaz o último lance registrado. O tabuleiro físico precisa voltar à posição anterior,
    // senão o mesmo lance seria registrado de novo.
    desfazer() {
      if (!this.partida.desfazer()) return false;
      this.pendencia = null;
      this.ultimaChave = null;
      this.aguardandoRestauracao = true;
      return true;
    }

    // Verdadeiro se, depois do lance, o tabuleiro fica exatamente como a leitura.
    _explica(m, leitura) {
      const b = copy(this.partida.jogo.board);
      this.partida.jogo.applyBoardOnly(b, m);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        const v = p ? (color(p) === 'w' ? BRANCA : PRETA) : VAZIA;
        if (v !== leitura[r][c]) return false;
      }
      return true;
    }
  }

  const API = { Partida, Detector, Estabilizador, ocupacaoDoJogo, nomeCasa, VAZIA, BRANCA, PRETA, OCULTA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.XadrezLeitura = API;
})(typeof window !== 'undefined' ? window : globalThis);
