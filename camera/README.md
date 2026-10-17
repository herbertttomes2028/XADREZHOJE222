# Teste de câmera · Xadrez físico

Segunda etapa do projeto: a câmera lê o tabuleiro e alimenta o motor de lances (`leitura.js`).

## Arquivos

- `teste-camera.html`: a página de teste. Abra pelo GitHub Pages (HTTPS) para a câmera funcionar.
- `visao.js`: homografia, medição das casas e classificação (vazia, branca, preta). Sem bibliotecas externas.
- `regras.js` e `leitura.js`: motor de regras e de lances (os mesmos da etapa anterior).
- `sintetico.js`: gera tabuleiros simulados em perspectiva, para os testes.
- `visao.test.js`: 6 testes da visão (calibração, aprendizado, cantos imprecisos, tabuleiro girado, mão sobre o tabuleiro).
- `pagina.test.js`: 2 testes que executam a página inteira no jsdom, com câmera e canvas simulados.

## Como testar a visão (sem câmera)

```
npm install
npm test
```

## Como testar com a câmera

Coloque a pasta no GitHub Pages (por exemplo, numa pasta `camera/` do repositório) e abra `teste-camera.html` no celular ou no computador.

1. **Câmera**: escolha a traseira (celular) ou a webcam, e a qualidade 1280×720. Ligue a câmera e deixe-a fixa, com o tabuleiro inteiro visível, de cima.
2. **Cantos**: clique em "Capturar quadro". Depois clique nos quatro cantos internos do tabuleiro, nesta ordem: **a8** (superior esquerdo), **h8** (superior direito), **h1** (inferior direito), **a1** (inferior esquerdo). Esta ordem vale com as brancas embaixo.
3. **Aprender**: monte as peças na posição inicial e clique em "Aprender posição inicial". Mantenha as peças paradas por cerca de 3 segundos.
4. **Conferir**: a grade deve ficar igual ao tabuleiro. Os brancos aparecem como ○, os pretos como ●.
5. **Partida**: clique em "Iniciar partida" e mova um peão, por exemplo e2 para e4. Deve aparecer "Lance registrado: e4".
6. **Mão**: passe a mão sobre o tabuleiro e observe que nenhum lance é registrado. Depois de tirar a mão, o sistema volta a ler.
7. **Desfazer**: se algo for registrado errado, use "Desfazer último lance" e devolva a peça à posição anterior.

## Ajustes, se necessário

- Muitas casas com "?" (ambíguas): a luz pode estar fraca ou muito forte, ou as peças têm cor parecida com a casa. Experimente mais luz uniforme e câmera mais perpendicular ao tabuleiro.
- Brilho das brancas abaixo do das pretas: o tabuleiro está girado ou invertido. Refaça os cantos na ordem indicada.
- Ajustes finos ficam em `visao.js`: `LIMIAR_RAZAO` (quanto maior, mais casas viram "?") e a área medida dentro de cada casa (20% central).

## Limitações desta etapa

- Os testes usam imagens simuladas. Textura de madeira, sombra real, reflexo de verniz e lente da câmera ainda precisam ser testados com o seu tabuleiro.
- A leitura não identifica o tipo da peça; só a cor e a presença.
- Se a câmera se mover, a calibração precisa ser refeita.
