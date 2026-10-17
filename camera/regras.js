/* Regras do xadrez, extraídas do jogo xadrez_ao_vivo.html.
   Funciona no navegador (expõe window.XadrezRegras) e no Node.js (module.exports). */
(function (root) {
'use strict';
const FILES='abcdefgh', INITIAL='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const SYMBOLS={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const VAL={p:1,n:3,b:3,r:5,q:9,k:0};
const copy=o=>JSON.parse(JSON.stringify(o));
const color=p=>p===p.toUpperCase()?'w':'b';
const opposite=c=>c==='w'?'b':'w';
const pos=(r,c)=>FILES[c]+(8-r);
const sq=s=>({r:8-Number(s[1]),c:FILES.indexOf(s[0])});
const validSquare=s=>typeof s==='string'&&/^[a-h][1-8]$/.test(s);
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const pieceName={k:'Rei',q:'Dama',r:'Torre',b:'Bispo',n:'Cavalo',p:'Peão'};

/* Motor de xadrez: gera pseudo-lances, elimina os que expõem o próprio rei,
   calcula xeque, SAN, roques, en passant, promoções e empates. */
class ChessGame{
 constructor(){this.reset()}
 reset(){this.board=INITIAL.split('/').map(row=>{let a=[];for(const ch of row){if(/\d/.test(ch))for(let i=0;i<+ch;i++)a.push(null);else a.push(ch)}return a});this.turn='w';this.castling={K:true,Q:true,k:true,q:true};this.ep=null;this.halfmove=0;this.fullmove=1;this.moves=[];this.history=[];this.positionKeys=[this.key()];this.status=null;}
 snapshot(){return{board:copy(this.board),turn:this.turn,castling:copy(this.castling),ep:this.ep,halfmove:this.halfmove,fullmove:this.fullmove,status:copy(this.status)}}
 load(s){this.board=copy(s.board);this.turn=s.turn;this.castling=copy(s.castling);this.ep=s.ep;this.halfmove=s.halfmove;this.fullmove=s.fullmove;this.status=copy(s.status)}
 export(includeHistory=false){const out={...this.snapshot(),moves:copy(this.moves),positionKeys:[...this.positionKeys]};if(includeHistory)out.history=copy(this.history);return out}
 import(data){if(!data||!Array.isArray(data.board)||data.board.length!==8||!['w','b'].includes(data.turn))throw Error('Estado remoto inválido');this.load(data);this.moves=Array.isArray(data.moves)?copy(data.moves):[];this.positionKeys=Array.isArray(data.positionKeys)?[...data.positionKeys]:[this.key()];this.history=Array.isArray(data.history)?copy(data.history):[]}
 fen(){const board=this.board.map(row=>{let str='',run=0;for(const p of row){if(p){if(run)str+=run;run=0;str+=p}else run++}if(run)str+=run;return str}).join('/');const cas=Object.keys(this.castling).filter(k=>this.castling[k]).join('')||'-';return `${board} ${this.turn} ${cas} ${this.ep||'-'} ${this.halfmove} ${this.fullmove}`}
 key(){// Na repetição, a casa en passant só altera a posição se a captura for legal.
  let ep='-';if(this.ep){const {r,c}=sq(this.ep),pawn=this.turn==='w'?'P':'p',pr=r+(this.turn==='w'?1:-1);for(const dc of [-1,1])if(inside(pr,c+dc)&&this.board[pr][c+dc]===pawn){const m={from:pos(pr,c+dc),to:this.ep,ep:true};let b=copy(this.board);this.applyBoardOnly(b,m);if(!this.attackedKingOn(b,this.turn)){ep=this.ep;break}}}
  const br=this.board.map(row=>row.map(p=>p||'.').join('')).join('');return br+'|'+this.turn+'|'+Object.keys(this.castling).filter(k=>this.castling[k]).join('')+'|'+ep;
 }
 kingOn(b,side){const target=side==='w'?'K':'k';for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]===target)return{r,c};return null}
 attackedKingOn(b,side){const k=this.kingOn(b,side);return !k||this.isAttacked(b,k.r,k.c,opposite(side))}
 isAttacked(b,r,c,by){
  const pawn=by==='w'?'P':'p',pawnRow=r+(by==='w'?1:-1);for(const dc of [-1,1])if(inside(pawnRow,c+dc)&&b[pawnRow][c+dc]===pawn)return true;
  for(const[dr,dc]of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])if(inside(r+dr,c+dc)&&b[r+dr][c+dc]===(by==='w'?'N':'n'))return true;
  for(const[dr,dc]of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]){let rr=r+dr,cc=c+dc,steps=1;while(inside(rr,cc)){const p=b[rr][cc];if(p){if(color(p)===by){const t=p.toLowerCase();if((steps===1&&t==='k')||((dr===0||dc===0)&&(t==='r'||t==='q'))||((dr!==0&&dc!==0)&&(t==='b'||t==='q')))return true}break}rr+=dr;cc+=dc;steps++}}
  return false;
 }
 inCheck(side=this.turn){return this.attackedKingOn(this.board,side)}
 pseudo(r,c){const p=this.board[r][c],side=color(p),enemy=opposite(side),t=p.toLowerCase(),moves=[];
  const put=(rr,cc,extra={})=>{if(!inside(rr,cc))return;const q=this.board[rr][cc];if(q&&(color(q)===side||q.toLowerCase()==='k'))return;const base={from:pos(r,c),to:pos(rr,cc),piece:t,captured:q?q.toLowerCase():null,...extra};if(t==='p'&&(rr===0||rr===7))for(const promotion of ['q','r','b','n'])moves.push({...base,promotion});else moves.push(base)};
  if(t==='p'){const step=side==='w'?-1:1,home=side==='w'?6:1;
   if(inside(r+step,c)&&!this.board[r+step][c]){put(r+step,c);if(r===home&&!this.board[r+2*step][c])put(r+2*step,c,{double:true})}
   for(const dc of [-1,1]){const rr=r+step,cc=c+dc;if(!inside(rr,cc))continue;const q=this.board[rr][cc];if(q&&color(q)===enemy&&q.toLowerCase()!=='k')put(rr,cc);if(this.ep===pos(rr,cc)&&this.board[r][cc]===(side==='w'?'p':'P'))put(rr,cc,{ep:true,captured:'p'})}
  }else if(t==='n'){for(const[dr,dc]of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])put(r+dr,c+dc)}
  else if(t==='k'){
   for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)put(r+dr,c+dc);
   const home=side==='w'?7:0,king=side==='w'?'K':'k';if(r===home&&c===4&&p===king&&!this.inCheck(side)){
    const rook=side==='w'?'R':'r';const chk=step=>this.isAttacked(this.board,home,step,enemy);
    if(this.castling[side==='w'?'K':'k']&&this.board[home][7]===rook&&!this.board[home][5]&&!this.board[home][6]&&!chk(5)&&!chk(6))put(home,6,{castle:'k'});
    if(this.castling[side==='w'?'Q':'q']&&this.board[home][0]===rook&&!this.board[home][1]&&!this.board[home][2]&&!this.board[home][3]&&!chk(3)&&!chk(2))put(home,2,{castle:'q'});
   }
  }else{const dirs=[];if(t==='b'||t==='q')dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);if(t==='r'||t==='q')dirs.push([-1,0],[1,0],[0,-1],[0,1]);for(const[dr,dc]of dirs){let rr=r+dr,cc=c+dc;while(inside(rr,cc)){const q=this.board[rr][cc];if(q&&color(q)===side)break;put(rr,cc);if(q)break;rr+=dr;cc+=dc}}}
  return moves;
 }
 applyBoardOnly(b,m){const f=sq(m.from),t=sq(m.to),p=b[f.r][f.c];b[f.r][f.c]=null;if(m.ep)b[f.r][t.c]=null;if(m.castle){const col=m.castle==='k'?7:0,dest=m.castle==='k'?5:3;b[f.r][dest]=b[f.r][col];b[f.r][col]=null}b[t.r][t.c]=m.promotion?(color(p)==='w'?m.promotion.toUpperCase():m.promotion):p}
 legal(from,side=this.turn){if(!validSquare(from))return[];const f=sq(from),p=this.board[f.r][f.c];if(!p||color(p)!==side)return[];return this.pseudo(f.r,f.c).filter(m=>{const b=copy(this.board);this.applyBoardOnly(b,m);return !this.attackedKingOn(b,side)})}
 allLegal(side=this.turn){const all=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(this.board[r][c]&&color(this.board[r][c])===side)all.push(...this.legal(pos(r,c),side));return all}
 insufficient(){const units=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=this.board[r][c];if(p&&p.toLowerCase()!=='k')units.push({p:p.toLowerCase(),squareColor:(r+c)%2})}if(!units.length)return true;if(units.length===1&&['n','b'].includes(units[0].p))return true;return units.every(x=>x.p==='b')&&units.every(x=>x.squareColor===units[0].squareColor)}
 sanOf(m,possible){if(m.castle)return m.castle==='k'?'O-O':'O-O-O';let label=m.piece==='p'?'':m.piece.toUpperCase();if(m.piece!=='p'){
   const same=possible.filter(x=>x!==m&&x.to===m.to&&x.piece===m.piece&&x.from!==m.from);
   if(same.length){const file=m.from[0],rank=m.from[1];if(!same.some(x=>x.from[0]===file))label+=file;else if(!same.some(x=>x.from[1]===rank))label+=rank;else label+=file+rank}
  }else if(m.captured)label=m.from[0];return label+(m.captured?'x':'')+m.to+(m.promotion?'='+m.promotion.toUpperCase():'')}
 play(from,to,promotion='q'){
  if(this.status)return{error:'A partida já terminou.'};if(!validSquare(from)||!validSquare(to))return{error:'Casa inválida.'};
  const all=this.allLegal(),found=all.find(x=>x.from===from&&x.to===to&&(!x.promotion||x.promotion===promotion));if(!found)return{error:'Lance ilegal: não é possível mover essa peça para lá.'};
  const san=this.sanOf(found,all),before=this.snapshot();this.history.push(before);
  const f=sq(from),t=sq(to),piece=this.board[f.r][f.c];this.applyBoardOnly(this.board,found);
  if(piece==='K'){this.castling.K=false;this.castling.Q=false}if(piece==='k'){this.castling.k=false;this.castling.q=false}
  if(from==='a1'||to==='a1')this.castling.Q=false;if(from==='h1'||to==='h1')this.castling.K=false;
  if(from==='a8'||to==='a8')this.castling.q=false;if(from==='h8'||to==='h8')this.castling.k=false;
  this.ep=found.double?pos((f.r+t.r)/2,f.c):null;this.halfmove=found.piece==='p'||found.captured?0:this.halfmove+1;if(this.turn==='b')this.fullmove++;
  this.turn=opposite(this.turn);this.positionKeys.push(this.key());
  const checked=this.inCheck(this.turn),next=this.allLegal(),mate=checked&&next.length===0;
  const doneSan=san+(mate?'#':checked?'+':'');const entry={from,to,piece:found.piece,captured:found.captured,promotion:found.promotion||null,castle:found.castle||null,ep:!!found.ep,san:doneSan,by:opposite(this.turn)};
  this.moves.push(entry);
  if(mate)this.status={kind:'mate',winner:opposite(this.turn),reason:'Xeque-mate'};
  else if(!next.length)this.status={kind:'draw',reason:'Afogamento (rei sem lances legais)'};
  else if(this.insufficient())this.status={kind:'draw',reason:'Material insuficiente'};
  else if(this.positionKeys.filter(x=>x===this.positionKeys[this.positionKeys.length-1]).length>=3)this.status={kind:'draw',reason:'Repetição tripla de posição'};
  else if(this.halfmove>=100)this.status={kind:'draw',reason:'Regra dos 50 lances'};
  return{move:entry,check:checked,mate:mate,end:!!this.status};
 }
 undo(){if(!this.history.length)return false;this.load(this.history.pop());this.moves.pop();this.positionKeys.pop();this.status=null;return true}
}


const API = { ChessGame, FILES, INITIAL, SYMBOLS, VAL, copy, color, opposite, pos, sq, validSquare, inside, pieceName };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.XadrezRegras = API;
})(typeof window !== 'undefined' ? window : globalThis);
