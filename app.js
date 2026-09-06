const data = await fetch('data/book-content.json').then(r => r.json());
const pages = data.pages;
const params = new URLSearchParams(location.search);
let current = Math.max(1, Math.min(pages.length, Number(params.get('page') || 1)));
let spread = params.get('single') !== '1';
let zoomLevel = Math.max(0.6, Math.min(1.5, Number(localStorage.getItem('lumenZoom') || 1)));
let animating = false;
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const mobileMedia = window.matchMedia?.('(max-width: 700px)');
const isMobileView = () => mobileMedia?.matches ?? window.innerWidth <= 700;
let mobilePageResizeObserver = null;

const $ = s => document.querySelector(s);
const stage = $('#stage');
const printBook = $('#printBook');
const indicator = $('#pageIndicator');
const progress = $('#progressBar');
const prev = $('#prev');
const next = $('#next');
const toc = $('#toc');
const scrim = $('#scrim');
const zoomOut = $('#zoomOut');
const zoomIn = $('#zoomIn');
const zoomReset = $('#zoomReset');
const fullscreenButton = $('#fullscreenButton');
const pageJumpInput = $('#pageJumpInput');
const pageJumpGo = $('#pageJumpGo');

const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const stripMarks = s => s.replace(/^[✦★⭐🌌🌟✨💜⚙🔥☀🤝🌍]\s*/u,'').trim();
const isQuote = s => /^[“\"]/.test(s.trim()) || /[”\"]$/.test(s.trim());
const isBullet = s => /^(✦|★|✓)/.test(s.trim());
const isHeading = s => /^[✦★⭐🌌🌟✨💜⚙🔥☀🤝🌍]/u.test(s.trim()) && s.length < 95;
const footer = page => `<div class="footer-line"><span>${esc(data.meta.tagline)}</span><span class="page-no">✦ ${page.number} ✦</span><span>Lumen Stellar</span></div>`;

function renderBasicItems(items, opts={}) {
  const out=[];
  let titleUsed=false;
  for(const item of items){
    if(item.type==='table'){
      out.push(renderTable(item.rows));
      continue;
    }
    const t=item.text.trim();
    if(!t) continue;
    if(!titleUsed && (isHeading(t) || (opts.forceFirstTitle && !titleUsed))){
      out.push(`<h1 class="page-title">${esc(stripMarks(t))}</h1>`); titleUsed=true; continue;
    }
    if(!titleUsed && opts.firstAsTitle){out.push(`<h1 class="page-title">${esc(t)}</h1>`);titleUsed=true;continue}
    if(isQuote(t)){out.push(`<div class="quote-box">${esc(t)}</div>`);continue}
    if(isBullet(t)){
      const mark=t[0], text=t.slice(1).trim();
      out.push(`<div class="bullet ${mark==='✓'?'check':''}"><span class="bullet-mark">${esc(mark)}</span><span>${esc(text)}</span></div>`);continue
    }
    if(!titleUsed && t.length<85){out.push(`<h1 class="page-title">${esc(t)}</h1>`);titleUsed=true;continue}
    out.push(`<p class="body-copy">${esc(t)}</p>`)
  }
  return out.join('');
}

function renderTable(rows){
  const cols=Math.max(...rows.map(r=>r.length));
  const oneCol=cols===1;
  const arrowish=oneCol && rows.some(r=>r[0]?.trim()==='↓');
  if(arrowish){
    return `<div class="flow">${rows.map(r=>r[0]?.trim()==='↓'?'<div class="flow-arrow">↓</div>':`<div class="flow-node">${esc(r[0]||'')}</div>`).join('')}</div>`;
  }
  if(cols===3 && rows.length===1){
    return `<div class="concept-grid">${rows[0].map(cell=>{
      const m=cell.match(/^([^.!?]{2,55}?)(?:\s{1,})(.+)$/); const h=m?m[1]:cell; const p=m?m[2]:'';
      return `<div class="concept-card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`
    }).join('')}</div>`
  }
  return `<div class="taxonomy-block">${rows.flat().filter(Boolean).map(cell=>`<div class="taxonomy-row"><p>${esc(cell)}</p></div>`).join('')}</div>`
}

function shell(page, inner, night=false, extra=''){
  return `<section class="book-page ${night?'night-page':'parchment'} kind-${page.kind} page-number-${page.number} ${extra}"><div class="page-inner">${inner}</div></section>`
}

function renderCover(page){return `<section class="book-page kind-cover"><img class="cover-art" src="assets/art/cover.png" alt="Capa Lumen Stellar"><div class="cover-glow"></div></section>`}
function renderChapter(page){return shell(page,`<div class="chapter-horizon"></div><div class="chapter-compass"></div><div class="chapter-label">${esc(page.chapterLabel)}</div><h1 class="chapter-title">${esc(page.title)}</h1><div class="chapter-subtitle">${esc(page.subtitle)}</div><div class="chapter-quote">${esc(page.quote)}</div>`,true)}
function renderPreface(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||'Antes de começar'); const lead=ps.shift()||'';
  return shell(page,`<div class="page-kicker">PRÓLOGO</div><h1 class="page-title">${esc(title)}</h1><p class="lead">${esc(lead)}</p>${renderBasicItems(ps.map(text=>({type:'p',text})))}${footer(page)}`)
}
function renderMap(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||'Mapa Stellar'); const sub=ps.shift()||'';
  const list=ps.map(x=>{const m=stripMarks(x).match(/^(\d+)\.\s*(.*)$/);return `<div class="map-item"><div class="map-star">✦</div><div class="map-text">${m?`<b>${m[1]}.</b> ${esc(m[2])}`:esc(stripMarks(x))}</div></div>`}).join('');
  return shell(page,`<div class="page-kicker">NAVEGAÇÃO</div><h1 class="page-title">${esc(title)}</h1><div class="page-subtitle">${esc(sub)}</div><div class="ornamental-divider"></div><div class="celestial-map-list">${list}</div>${footer(page)}`)
}
function renderIdeal(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||'Ideal'); const promise=ps.shift()||''; const body=ps.shift()||'';
  const practiceIndex=ps.findIndex(x=>/Viver este Ideal/i.test(x)); const bullets=(practiceIndex>=0?ps.slice(practiceIndex+1):ps).map(x=>({type:'p',text:x}));
  const n=title.match(/^(\d+)º/)?.[1]||'';
  return shell(page,`<div class="page-kicker">OS IDEAIS DO AJUDAR</div><h1 class="page-title">${n?`<span class="ideal-number">${n}</span>`:''}${esc(title.replace(/^\d+º\s*Ideal\s*[—-]\s*/,'').replace(/^\d+º\s*/,'') )}</h1><div class="ideal-promise">${esc(promise)}</div><p class="body-copy">${esc(body)}</p><div class="ideal-practice"><strong>✦ Viver este Ideal significa:</strong>${renderBasicItems(bullets)}</div>${footer(page)}`)
}
function renderArt(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const sub=(ps[0] && ps[0].length<160 && !isQuote(ps[0]))?ps.shift():'';
  const quote=ps.find(isQuote); const body=ps.filter(x=>x!==quote).map(x=>`<p class="body-copy">${esc(x)}</p>`).join('');
  return shell(page,`<div class="art-layout"><div><div class="page-kicker">LUMEN STELLAR</div><h1 class="page-title">${esc(title)}</h1>${sub?`<div class="page-subtitle">${esc(sub)}</div>`:''}</div><div>${body}${quote?`<div class="quote-box">${esc(quote)}</div>`:''}</div><div class="art-frame"><img src="${esc(page.art)}" alt="Arte celestial"></div></div>${footer(page)}`)
}
function renderGlossary(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const entries=[]; let currentEntry=null;
  for(const t of ps){if(isHeading(t)){if(currentEntry)entries.push(currentEntry);currentEntry={h:stripMarks(t),p:[]}} else {if(!currentEntry)currentEntry={h:'',p:[]};currentEntry.p.push(t)}} if(currentEntry)entries.push(currentEntry);
  return shell(page,`<div class="page-kicker">SÍMBOLOS DO NOSSO CÉU</div><h1 class="page-title">${esc(title)}</h1><div class="glossary-list">${entries.map(e=>`<div class="glossary-entry"><h3>${esc(e.h)}</h3><p>${esc(e.p.join(' '))}</p></div>`).join('')}</div>${footer(page)}`)
}
function renderStatement(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const quote=ps.find(isQuote)||''; const rest=ps.filter(x=>x!==quote);
  return shell(page,`<div class="statement-card"><div class="page-kicker">DIREÇÃO COMUM</div><h1 class="page-title">${esc(title)}</h1>${quote?`<div class="statement-quote">${esc(quote)}</div>`:''}${rest.map(x=>isBullet(x)?`<div class="bullet"><span class="bullet-mark">${esc(x[0])}</span><span>${esc(x.slice(1).trim())}</span></div>`:`<p class="body-copy">${esc(x)}</p>`).join('')}</div>${footer(page)}`)
}
function renderProgram(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const tagLine=ps.shift()||''; const tags=tagLine.split('+').map(s=>s.replace('.','').trim()).filter(Boolean); const intro=ps.shift()||'';
  return shell(page,`<div class="program-banner"><strong>${esc(title)}</strong><div class="program-tags">${tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div></div><p class="body-copy">${esc(intro)}</p>${renderBasicItems(ps.map(text=>({type:'p',text})))}${footer(page)}`)
}
function renderCallout(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const quote=ps.find(isQuote)||''; const rest=ps.filter(x=>x!==quote);
  return shell(page,`<div class="callout-core"><div class="symbol">✦</div><h1>${esc(title)}</h1>${rest.map(x=>isBullet(x)?`<div class="bullet"><span class="bullet-mark">${esc(x[0])}</span><span>${esc(x.slice(1).trim())}</span></div>`:`<p>${esc(x)}</p>`).join('')}${quote?`<div class="central-quote">${esc(quote)}</div>`:''}</div>${footer(page)}`,/Seja Luz/i.test(title))
}
function renderCulture(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const sub=ps.shift()||'';
  return shell(page,`<div class="page-kicker">SEJA LUZ</div><h1 class="page-title">${esc(title)}</h1><div class="page-subtitle">${esc(sub)}</div><div class="culture-list">${ps.map(x=>{const clean=stripMarks(x);const parts=clean.split(' — ');return `<div class="culture-item"><span class="culture-dot">★</span><div><b>${esc(parts[0])}</b>${parts[1]?` — ${esc(parts.slice(1).join(' — '))}`:''}</div></div>`}).join('')}</div>${footer(page)}`)
}
function renderQuote(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||''); const sub=ps.shift()||''; const quote=ps.find(isQuote)||ps.at(-1)||'';
  return shell(page,`<div class="quote-compass"></div><div class="page-kicker">${esc(title)}</div><div class="page-subtitle">${esc(sub)}</div><div class="quote-major">${esc(quote)}</div>`,true)
}
function renderManifesto(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text); const title=stripMarks(ps.shift()||'Manifesto Lumen Stellar'); const sub=ps.shift()||'';
  return shell(page,`<div class="page-kicker">${esc(sub)}</div><h1 class="manifesto-title">${esc(title)}</h1><div class="ornamental-divider"></div><div class="manifesto-lines">${ps.map(x=>`<div class="manifesto-line">${esc(x)}</div>`).join('')}</div>${footer(page)}`,true)
}
function renderClosing(page){
  const ps=page.items.filter(i=>i.type==='p').map(i=>i.text);
  return shell(page,`<div class="closing-star"></div><div class="closing-title">${esc(ps[0]||'LUMEN STELLAR')}</div><div class="closing-sub">${esc(ps[1]||'')}</div><div class="closing-sub">${esc(ps[2]||'')}</div><div class="closing-tag">${esc(ps[3]||'')}</div>`,true)
}
function renderGeneric(page){
  const night=['vision'].includes(page.kind);
  let content=renderBasicItems(page.items,{forceFirstTitle:true});
  if(page.kind==='vision') content=`<div class="page-kicker">O AMANHÃ</div>${content}`;
  return shell(page,`${content}${footer(page)}`,night)
}

function renderPage(page){
  switch(page.kind){
    case 'cover': return renderCover(page);
    case 'chapter': return renderChapter(page);
    case 'preface': return renderPreface(page);
    case 'map': return renderMap(page);
    case 'ideal': return renderIdeal(page);
    case 'art': return renderArt(page);
    case 'glossary': return renderGlossary(page);
    case 'statement': return renderStatement(page);
    case 'program': return renderProgram(page);
    case 'callout': return renderCallout(page);
    case 'culture': return renderCulture(page);
    case 'quote': return renderQuote(page);
    case 'manifesto': return renderManifesto(page);
    case 'closing': return renderClosing(page);
    default:return renderGeneric(page)
  }
}

function visiblePages(){
  // Mobile uses a true single-page reading mode so no page is hidden or skipped.
  if(isMobileView() || !spread || current===1) return [current];
  const left=current%2===0?current:current-1; return [left,Math.min(left+1,pages.length)].filter((v,i,a)=>a.indexOf(v)===i)
}
function applyZoom(){
  zoomLevel=Math.max(0.6,Math.min(1.5,Math.round(zoomLevel*10)/10));
  if('zoom' in stage.style){
    stage.style.zoom=String(zoomLevel);
    stage.style.transform='';
  }else{
    stage.style.zoom='';
    stage.style.transform=`scale(${zoomLevel})`;
    stage.style.transformOrigin='center center';
  }
  zoomReset.textContent=`${Math.round(zoomLevel*100)}%`;
  zoomOut.disabled=zoomLevel<=0.6;
  zoomIn.disabled=zoomLevel>=1.5;
  localStorage.setItem('lumenZoom',String(zoomLevel));
}
function setZoom(value){zoomLevel=value;applyZoom()}

function normalizeTargetPage(value){
  let target = Math.max(1, Math.min(pages.length, Number(value) || 1));
  if(!isMobileView() && spread && target > 1 && target % 2 === 1) target -= 1;
  return target;
}

function goToPage(value){
  if(animating) return;
  current = normalizeTargetPage(value);
  closeToc();
  renderReader();
  window.scrollTo({top:0,behavior:'smooth'});
}

function syncPageJump(){
  if(!pageJumpInput) return;
  const nums = visiblePages();
  pageJumpInput.min = '1';
  pageJumpInput.max = String(pages.length);
  pageJumpInput.value = String(nums[0]);
}


function syncOneMobilePageHeight(page){
  if(!isMobileView() || !page || page.classList.contains('kind-cover')) return;
  const inner=page.querySelector('.page-inner');
  if(!inner) return;

  // Measure the content itself and then give the page an explicit rendered
  // height. This makes the page background, ornamental frame and footer
  // share exactly the same bottom edge on mobile browsers.
  page.style.height='auto';
  page.style.minHeight='0';
  inner.style.height='auto';

  const cssMin=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-page-min-h')) || 0;
  const needed=Math.ceil(Math.max(inner.scrollHeight, inner.getBoundingClientRect().height, cssMin));
  if(needed>0){
    page.style.height=`${needed}px`;
    page.style.minHeight=`${needed}px`;
  }
}

function ensureMobilePageHeight(root=stage){
  if(!isMobileView()) return;
  root.querySelectorAll('.book-page:not(.kind-cover)').forEach(syncOneMobilePageHeight);
}

function observeMobilePageHeights(root=stage){
  mobilePageResizeObserver?.disconnect?.();
  if(!isMobileView() || typeof ResizeObserver==='undefined') return;
  mobilePageResizeObserver=new ResizeObserver(entries=>{
    for(const entry of entries){
      const inner=entry.target;
      const page=inner.closest('.book-page');
      if(page) requestAnimationFrame(()=>syncOneMobilePageHeight(page));
    }
  });
  root.querySelectorAll('.book-page:not(.kind-cover) .page-inner').forEach(inner=>mobilePageResizeObserver.observe(inner));
}

function fitPageContent(root=stage){
  root.querySelectorAll('.book-page .page-inner').forEach(inner=>{
    inner.classList.remove('content-fitted');
    inner.style.removeProperty('--fit-scale');

    const available=inner.clientHeight;
    const required=inner.scrollHeight;
    if(!available || required<=available+2) return;

    // Preserve legibility. The dense page-specific CSS above should handle
    // pages 2 and 3; this is only a safety net for browser/font differences.
    const scale=Math.max(.88,Math.min(1,(available-4)/required));
    if(scale<.999){
      inner.style.setProperty('--fit-scale',scale.toFixed(4));
      inner.classList.add('content-fitted');
    }
  });
}

function renderReader(){
  const nums=visiblePages();
  stage.classList.toggle('spread',nums.length===2);
  stage.classList.toggle('mobile-single',isMobileView());
  stage.innerHTML=nums.map(n=>`<div class="page-shell" data-page="${n}">${renderPage(pages[n-1])}</div>`).join('');
  indicator.textContent=nums.length===1?`Página ${nums[0]} de ${pages.length}`:`Páginas ${nums[0]}–${nums[1]} de ${pages.length}`;
  progress.style.width=`${(Math.max(...nums)/pages.length)*100}%`;
  prev.disabled=current<=1 || animating;
  next.disabled=Math.max(...nums)>=pages.length || animating;
  history.replaceState(null,'',`${location.pathname}?page=${current}${spread?'':'&single=1'}`);
  fitPageContent();
  applyZoom();
  syncPageJump();
  ensureMobilePageHeight();
  observeMobilePageHeights();
  requestAnimationFrame(()=>ensureMobilePageHeight());
  setTimeout(()=>ensureMobilePageHeight(),80);
  stage.querySelectorAll('img').forEach(img=>{if(!img.complete) img.addEventListener('load',()=>ensureMobilePageHeight(),{once:true})});
}

function captureTurnSheet(direction){
  const shells=[...stage.querySelectorAll('.page-shell')];
  if(!shells.length) return null;
  const source=direction>0?shells[shells.length-1]:shells[0];
  return {
    html:source.innerHTML,
    left:source.offsetLeft,
    top:source.offsetTop,
    width:source.offsetWidth,
    height:source.offsetHeight,
    night:!!source.querySelector('.night-page'),
    cover:!!source.querySelector('.kind-cover')
  };
}

function animatePageTurn(turn,direction){
  if(!turn || reduceMotion) return Promise.resolve();
  animating=true;
  prev.disabled=true; next.disabled=true;
  const sheet=document.createElement('div');
  sheet.className=`page-turn-sheet ${direction>0?'turn-forward':'turn-backward'}`;
  Object.assign(sheet.style,{left:`${turn.left}px`,top:`${turn.top}px`,width:`${turn.width}px`,height:`${turn.height}px`});
  sheet.innerHTML=`<div class="turn-face turn-front">${turn.html}</div><div class="turn-face turn-back ${turn.night||turn.cover?'turn-back-night':''}"><div class="turn-back-ornament">✦</div></div><div class="turn-edge-light"></div>`;
  stage.appendChild(sheet);
  return new Promise(resolve=>{
    requestAnimationFrame(()=>requestAnimationFrame(()=>sheet.classList.add('turn-active')));
    const done=()=>{
      sheet.remove(); animating=false;
      const nums=visiblePages();
      prev.disabled=current<=1;
      next.disabled=Math.max(...nums)>=pages.length;
      resolve();
    };
    sheet.addEventListener('animationend',done,{once:true});
    setTimeout(()=>{if(sheet.isConnected)done()},950);
  });
}

async function go(delta){
  if(animating) return;
  const target=Math.max(1,Math.min(pages.length,current+delta));
  if(target===current) return;
  const direction=Math.sign(delta);
  const turn=captureTurnSheet(direction);
  current=target;
  renderReader();
  await animatePageTurn(turn,direction);
  window.scrollTo({top:0,behavior:'smooth'});
}

prev.onclick=()=>go(!isMobileView() && spread && current>1?-2:-1);
next.onclick=()=>go(!isMobileView() && spread && current>1?2:1);
$('#modeButton').onclick=()=>{if(animating)return;spread=!spread;$('#modeButton').textContent=spread?'Página dupla':'Página simples';renderReader()};
zoomOut.onclick=()=>setZoom(zoomLevel-0.1);
zoomIn.onclick=()=>setZoom(zoomLevel+0.1);
zoomReset.onclick=()=>setZoom(1);

async function toggleFullscreen(){
  try{
    if(!document.fullscreenElement){await document.documentElement.requestFullscreen();}
    else{await document.exitFullscreen();}
  }catch(err){console.warn('Tela cheia indisponível:',err)}
}
fullscreenButton.onclick=toggleFullscreen;
document.addEventListener('fullscreenchange',()=>{
  const active=!!document.fullscreenElement;
  fullscreenButton.textContent=active?'Sair da tela cheia':'Tela cheia';
  fullscreenButton.setAttribute('aria-label',active?'Sair da tela cheia':'Ativar tela cheia');
  document.body.classList.toggle('is-fullscreen',active);
});
if(!document.fullscreenEnabled) fullscreenButton.disabled=true;

pageJumpGo.onclick=()=>goToPage(pageJumpInput.value);
pageJumpInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    goToPage(pageJumpInput.value);
  }
});
pageJumpInput.addEventListener('focus',()=>pageJumpInput.select());
pageJumpInput.addEventListener('input',()=>{
  const digits = pageJumpInput.value.replace(/[^0-9]/g,'');
  if(pageJumpInput.value !== digits) pageJumpInput.value = digits;
});

document.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'){e.preventDefault();prev.click()}
  if(e.key==='ArrowRight'){e.preventDefault();next.click()}
  if(e.key==='Escape')closeToc();
  if((e.key==='+' || e.key==='=') && !e.ctrlKey && !e.metaKey){e.preventDefault();zoomIn.click()}
  if(e.key==='-' && !e.ctrlKey && !e.metaKey){e.preventDefault();zoomOut.click()}
  if(e.key==='0' && !e.ctrlKey && !e.metaKey){e.preventDefault();zoomReset.click()}
  if((e.key==='f' || e.key==='F') && !e.ctrlKey && !e.metaKey){
    const tag = document.activeElement?.tagName;
    if(tag !== 'INPUT' && tag !== 'TEXTAREA'){e.preventDefault();fullscreenButton.click()}
  }
});

function openToc(){toc.classList.add('open');scrim.classList.add('show');toc.setAttribute('aria-hidden','false')}
function closeToc(){toc.classList.remove('open');scrim.classList.remove('show');toc.setAttribute('aria-hidden','true')}
$('#tocButton').onclick=openToc;$('#tocClose').onclick=closeToc;scrim.onclick=closeToc;
const chapterPages=pages.filter(p=>p.kind==='chapter');
$('#tocList').innerHTML=chapterPages.map(p=>`<a class="toc-link" data-page="${p.number}"><span>${esc(p.chapterLabel.replace('CAPÍTULO ',''))}</span><div><strong>${esc(p.title)}</strong><small>${esc(p.subtitle)}</small></div></a>`).join('');
document.querySelectorAll('.toc-link').forEach(a=>a.onclick=()=>{if(animating)return;current=normalizeTargetPage(Number(a.dataset.page));closeToc();renderReader()});

// Re-render when crossing the mobile breakpoint so navigation becomes page-by-page.
mobileMedia?.addEventListener?.('change',()=>{
  if(animating) return;
  current=Math.max(1,Math.min(pages.length,current));
  renderReader();
});

window.addEventListener('resize',()=>{if(isMobileView()) requestAnimationFrame(()=>ensureMobilePageHeight())});
window.visualViewport?.addEventListener?.('resize',()=>{if(isMobileView()) requestAnimationFrame(()=>ensureMobilePageHeight())});

if(params.get('print')==='1'){
  document.body.classList.add('print-mode');
  printBook.innerHTML=pages.map(renderPage).join('');
  fitPageContent(printBook);
}else renderReader();
