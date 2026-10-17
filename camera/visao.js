/* Visão do tabuleiro, sem bibliotecas externas.
   - homografia: relaciona as coordenadas do tabuleiro (0..8) com a imagem da câmera.
   - características: cor e brilho médios de cada casa, medidos no centro da casa.
   - Classificador: aprende a aparência de vazio, branca e preta com a posição inicial conhecida.
   Imagens têm o formato { width, height, data } (RGBA, como o ImageData do navegador).
   Coordenadas do tabuleiro: u = coluna (0 = a, 8 = h), v = linha (0 = 8ª fileira, 8 = 1ª). */
(function (root) {
  'use strict';

  // Resolve um sistema linear pequeno por eliminação de Gauss com pivoteamento.
  function resolver(A, b) {
    const n = b.length;
    const M = A.map((linha, i) => [...linha, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) throw new Error('Cantos degenerados: os pontos estão alinhados.');
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((linha, i) => linha[n] / linha[i]);
  }

  // Homografia H (9 números, h33 = 1) que leva origem[i] em destino[i]. Ambos: 4 pares [x, y].
  function homografia(origem, destino) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = origem[i], [u, v] = destino[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = resolver(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function aplicar(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }

  function inversa(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const C11 = e * i - f * h, C12 = -(d * i - f * g), C13 = d * h - e * g;
    const det = a * C11 + b * C12 + c * C13;
    if (Math.abs(det) < 1e-12) throw new Error('Homografia não invertível.');
    return [
      C11 / det, -(b * i - c * h) / det, (b * f - c * e) / det,
      C12 / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      C13 / det, -(a * h - b * g) / det, (a * e - b * d) / det
    ];
  }

  // Cor e brilho médios de uma casa, medidos só no centro (20% da casa).
  // Medir perto da borda faz pequenos erros de canto mudarem a leitura, porque a borda da peça
  // fica dentro da área medida.
  function caracteristicasCasa(img, H, lin, col, n = 5) {
    let soma = 0, soma2 = 0, somaCroma = 0, k = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u = col + 0.4 + 0.2 * i / (n - 1);
      const v = lin + 0.4 + 0.2 * j / (n - 1);
      const [x, y] = aplicar(H, u, v);
      const px = Math.round(x), py = Math.round(y);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const o = (py * img.width + px) * 4;
      const R = img.data[o], G = img.data[o + 1], B = img.data[o + 2];
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      soma += L; soma2 += L * L; somaCroma += R - B; k++;
    }
    if (!k) return null;
    const media = soma / k;
    const desvio = Math.sqrt(Math.max(0, soma2 / k - media * media));
    return { L: media, sd: desvio, c: somaCroma / k };
  }

  // 8x8 de características, na mesma orientação do motor (linha 0 = 8ª fileira).
  function caracteristicasTabuleiro(img, H) {
    const out = [];
    for (let lin = 0; lin < 8; lin++) {
      const linha = [];
      for (let col = 0; col < 8; col++) linha.push(caracteristicasCasa(img, H, lin, col));
      out.push(linha);
    }
    return out;
  }

  const vetor = f => [f.L, f.sd, f.c];
  const ROTULOS = ['v', 'w', 'b'];
  const PISO_DESVIO = 4;   // evita divisão por desvios muito pequenos
  const LIMIAR_RAZAO = 1.6; // abaixo disso a casa é ambígua e vira '?'
  const LIMIAR_FORA = 40;   // distância muito grande de qualquer classe: casa não reconhecida

  class Classificador {
    constructor() {
      this.estat = null;
      this.diagnostico = null;
    }

    // amostras: [{ feats: 8x8, rotulos: 8x8 com 'v'|'w'|'b' }]. Use a posição inicial conhecida.
    aprender(amostras) {
      const grupos = {};
      for (const am of amostras) {
        for (let lin = 0; lin < 8; lin++) for (let col = 0; col < 8; col++) {
          const f = am.feats[lin][col];
          if (!f) continue;
          const chave = ((lin + col) % 2) + '|' + am.rotulos[lin][col];
          (grupos[chave] ||= []).push(vetor(f));
        }
      }
      this.estat = {};
      for (let p = 0; p < 2; p++) for (const k of ROTULOS) {
        const xs = grupos[p + '|' + k] || [];
        if (xs.length < 3) throw new Error('Amostras insuficientes para a classe ' + k + ' (casas ' + (p ? 'escuras' : 'claras') + ').');
        const mu = [0, 0, 0], var2 = [0, 0, 0];
        for (const x of xs) for (let i = 0; i < 3; i++) mu[i] += x[i] / xs.length;
        for (const x of xs) for (let i = 0; i < 3; i++) var2[i] += (x[i] - mu[i]) ** 2 / xs.length;
        this.estat[p + '|' + k] = { mu, sd: var2.map(v => Math.max(Math.sqrt(v), PISO_DESVIO)) };
      }
      this.diagnostico = this._diagnosticar();
      return this.diagnostico;
    }

    // Brancas precisam ser mais claras que pretas. Se não forem, o tabuleiro provavelmente está girado.
    _diagnosticar() {
      const motivos = [];
      const media = k => (this.estat[0 + '|' + k].mu[0] + this.estat[1 + '|' + k].mu[0]) / 2;
      const mw = media('w'), mb = media('b');
      if (mw <= mb + 40) motivos.push('As peças brancas não aparecem mais claras que as pretas. Confira se o tabuleiro está com as brancas embaixo e refaça os cantos.');
      return { ok: motivos.length === 0, motivos, brilhoBrancas: Math.round(mw), brilhoPretas: Math.round(mb) };
    }

    // Classifica uma casa. Devolve 'v' | 'w' | 'b' ou '?' (ambígua, fora do padrão ou sem medida).
    classificarCasa(f, lin, col) {
      if (!f) return { rotulo: '?', razao: 0, distancia: Infinity };
      const x = vetor(f), p = (lin + col) % 2;
      const dists = ROTULOS.map(k => {
        const { mu, sd } = this.estat[p + '|' + k];
        let d = 0;
        for (let i = 0; i < 3; i++) d += ((x[i] - mu[i]) / sd[i]) ** 2;
        return { k, d };
      }).sort((a, b) => a.d - b.d);
      const melhor = dists[0], segundo = dists[1];
      const razao = segundo.d / Math.max(melhor.d, 1e-6);
      const rotulo = (razao < LIMIAR_RAZAO || melhor.d > LIMIAR_FORA) ? '?' : melhor.k;
      return { rotulo, razao, distancia: melhor.d };
    }

    // Matriz 8x8 de rótulos para o motor, mais os detalhes de cada casa (para diagnóstico).
    ler(feats) {
      const leitura = [], detalhes = [];
      for (let lin = 0; lin < 8; lin++) {
        const l = [], d = [];
        for (let col = 0; col < 8; col++) {
          const c = this.classificarCasa(feats[lin][col], lin, col);
          l.push(c.rotulo); d.push(c);
        }
        leitura.push(l); detalhes.push(d);
      }
      return { leitura, detalhes };
    }
  }

  // Imagem retificada do tabuleiro (vista de cima), para a prévia na tela.
  function retificar(img, H, tam = 480) {
    const out = new Uint8ClampedArray(tam * tam * 4);
    const escala = tam / 8;
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
      const [px, py] = aplicar(H, (x + 0.5) / escala, (y + 0.5) / escala);
      const o = (y * tam + x) * 4;
      const sx = Math.round(px), sy = Math.round(py);
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) {
        out[o] = 40; out[o + 1] = 40; out[o + 2] = 45; out[o + 3] = 255;
        continue;
      }
      const s = (sy * img.width + sx) * 4;
      out[o] = img.data[s]; out[o + 1] = img.data[s + 1]; out[o + 2] = img.data[s + 2]; out[o + 3] = 255;
    }
    return { width: tam, height: tam, data: out };
  }

  const API = { homografia, aplicar, inversa, caracteristicasCasa, caracteristicasTabuleiro, Classificador, retificar, LIMIAR_RAZAO };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.XadrezVisao = API;
})(typeof window !== 'undefined' ? window : globalThis);
