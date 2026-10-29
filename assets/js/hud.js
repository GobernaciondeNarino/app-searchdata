/* =====================================================================
   HUD – panel de estadísticas en movimiento continuo
   Depende de variables globales de app.js (S, octo, VIS, COLOR_PERFIL,
   CORTO, corto, fmt) que solo se leen dentro de las funciones.
   ===================================================================== */
'use strict';

const HUD = (() => {
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const ETAPA = { libre:'libre', busca:'busca', lleva:'lleva', suelta:'ancla', verifica:'verifica', foco:'foco' };
  const COL_ETAPA = { libre:'#2f6b57', busca:'#4de3ff', lleva:'#3dffa0', suelta:'#ffc93c', verifica:'#b48cff', foco:'#ff3fa4' };
  const N_SERIE = 170, COLS_CALOR = 46;

  const st = {
    serie:{ ritmo:[], act:[], cam:[] }, ultMuestra:0,
    calor:[], filas:[], slot:new Map(), ultCalor:0, maxCalor:3, eventosCalor:0,
    coloca:[], logMin:[],
    esfera:[], flash:null, rot:0,
    tiles:[], tileActiva:null, entTot:new Map(), entCol:new Map(),
    cod:{ cola:[], actual:'', pos:0, texto:'', car:0, ultimo:0, ocio:0, html:'' },
    ultLog:0,
    frames:[], fps:60,
    servicios:{
      eventos:{ nombre:'api eventos', estado:'espera', ms:null, n:0 },
      voz:{ nombre:'elevenlabs', estado:'off', ms:null, n:0 },
      ia:{ nombre:'gemini', estado:'off', ms:null, n:0 },
      camara:{ nombre:'cámara', estado:'off', ms:null, n:0 }
    },
    cuenta:{ coloca:0, verifica:0, busqueda:0, rostro:0 }
  };

  /* ---------------- utilidades de lienzo ---------------- */
  function lienzo(id){
    const cv=document.getElementById(id); if(!cv) return null;
    const w=cv.clientWidth, h=cv.clientHeight; if(!w||!h) return null;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){ cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); }
    const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    return {ctx,w,h};
  }
  const hexRgb=h=>{ const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
  const RAMPA=(()=>{ const pts=[[0,'#0d0820'],[.25,'#3b1a63'],[.5,'#8a2a9e'],[.72,'#ff3fa4'],[1,'#ffd23f']].map(([t,c])=>[t,hexRgb(c)]); const out=[];
    for(let i=0;i<64;i++){ const t=i/63; let k=0; while(k<pts.length-2 && t>pts[k+1][0]) k++; const [t0,a]=pts[k],[t1,b]=pts[k+1]; const u=(t-t0)/(t1-t0); out.push(`rgb(${a.map((v,j)=>Math.round(v+(b[j]-v)*u)).join(',')})`); } return out; })();
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const recortar=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
  const hora=()=>new Date().toLocaleTimeString('es-CO',{hour12:false});

  /* ---------------- construcción ---------------- */
  function iniciar(){
    const ul=document.getElementById('luces');
    for(const [k,s] of Object.entries(st.servicios)){ const li=document.createElement('li'); li.innerHTML=`<i></i><span>${s.nombre}</span><em>–</em>`; ul.append(li); s.el=li; }
    const PC=window.PULPO_CONFIG||{};
    if(PC.voz) st.servicios.voz.estado='ok';
    if(PC.gemini) st.servicios.ia.estado='ok';
    const sp=document.getElementById('split');
    for(const [k,et,col] of [['coloca','coloca','#3dffa0'],['verifica','verifica','#b48cff'],['busqueda','busca','#ffc93c'],['rostro','rostros','#4de3ff']]){
      const d=document.createElement('div'); d.innerHTML=`<span>${et}</span><span class="bloques" style="--c:${col}">${'<i></i>'.repeat(18)}</span><em>0</em>`; sp.append(d); st['split_'+k]=d;
    }
    setInterval(tick,250);
  }

  /** Se llama cada vez que se reconstruye el árbol de datos. */
  function datos(){
    // filas del mapa de calor
    st.filas=(S.perfilNodos||[]).map(n=>n.perfil);
    st.calor=st.calor.map(col=>st.filas.map((_,i)=>col[i]||0));
    // esfera de registros
    const n=S.lista.length, ga=Math.PI*(3-Math.sqrt(5));
    st.esfera=S.lista.map((p,i)=>{ const y=1-(i/(Math.max(1,n-1)))*2, r=Math.sqrt(1-y*y), th=ga*i; p.esferaIdx=i; return {x:Math.cos(th)*r, y, z:Math.sin(th)*r, p}; });
    st.flash=new Float32Array(n);
    // entidades
    st.entTot=new Map(); st.entCol=new Map(); const etiqueta=new Map();
    for(const p of S.lista){ if(p.ent.key==='no-reporta') continue; st.entTot.set(p.ent.key,(st.entTot.get(p.ent.key)||0)+1); if(p.placed) st.entCol.set(p.ent.key,(st.entCol.get(p.ent.key)||0)+1); etiqueta.set(p.ent.key,p.ent.label); }
    const top=[...st.entTot.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
    const cont=document.getElementById('tiles'); cont.innerHTML=''; st.tiles=[];
    for(const [key] of top){ const el=document.createElement('div'); el.className='tile'; el.innerHTML='<span></span><em></em><i></i>'; el.querySelector('span').textContent=etiqueta.get(key); cont.append(el); st.tiles.push({key,el}); }
    document.getElementById('tEnt').textContent=`${fmt(st.entTot.size)} ent`;
    ticker();
  }

  function ticker(){
    const partes=[];
    const ahora=Date.now();
    const prox=(S.charlas||[]).filter(c=>c.t+c.dur*60000>ahora).slice(0,8);
    if(prox.length){ partes.push('<span class="r">próximas charlas</span>'); for(const c of prox) partes.push(`<span><b class="h">día ${c.dia} ${esc(c.hora)}</b>  ${esc(recortar(c.titulo,70))}  <span class="c">${esc(c.nombre)}</span></span>`); }
    for(const n of (S.perfilNodos||[])) partes.push(`<span><b class="v">${fmt(n.total)}</b> ${esc((CORTO[n.perfil]||n.label).toLowerCase())}</span>`);
    const munis=new Map(); for(const m of (S.muniNodos||[])) munis.set(m.label,(munis.get(m.label)||0)+m.total);
    for(const [lab,t] of [...munis.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)) partes.push(`<span>${esc(lab)} <b class="c">${fmt(t)}</b></span>`);
    partes.push(`<span class="r">${fmt(st.entTot.size)} entidades conectadas a la red</span>`);
    const html=partes.join('<span class="r">//</span>');
    const el=document.getElementById('ticker'); el.innerHTML=html+'<span class="r">//</span>'+html;
    el.style.animationDuration=Math.max(40,el.textContent.length*0.09)+'s';
  }

  /* ---------------- eventos que llegan desde app.js ---------------- */
  function sumarCalor(perfil,v=1){ st.slot.set(perfil,(st.slot.get(perfil)||0)+v); st.eventosCalor++; }

  function evento(tipo,d={}){
    const ahora=performance.now();
    switch(tipo){
      case 'coloca':{
        const p=d.p; st.cuenta.coloca++; st.coloca.push(ahora); sumarCalor(p.perfil,1);
        if(st.flash && p.esferaIdx!=null) st.flash[p.esferaIdx]=1;
        st.entCol.set(p.ent.key,(st.entCol.get(p.ent.key)||0)+1);
        const tile=st.tiles.find(t=>t.key===p.ent.key);
        if(tile){ if(st.tileActiva && st.tileActiva!==tile) st.tileActiva.el.classList.remove('activa'); tile.el.classList.add('activa'); st.tileActiva=tile;
          anime.remove(tile.el); anime({targets:tile.el, scale:[1.08,1], duration:420, easing:'easeOutQuad'}); }
        if(st.cod.cola.length<2) st.cod.cola.push(
`pulpo.colocar({
  id: ${p.id}, perfil: "${p.perfil}",
  municipio: "${recortar(p.muni.label,22)}",
  entidad: "${recortar(p.ent.label,24)}"
}) // neurona ${p.node.idx} lista
`);
        if(ahora-st.ultLog>380){ st.ultLog=ahora; log('coloca',`${corto(p.nombre)} → ${recortar(p.ent.label,30)}`,'#3dffa0'); }
        break; }
      case 'toma':
        sumarCalor(d.p.perfil,0.4);
        if(!st.cod.cola.length && Math.random()<0.25) st.cod.cola.push(`tentaculo[${d.b.k}].tomar(#${d.p.id}) // ${Math.round(d.b.reach*100)} %\n`);
        break;
      case 'verifica':
        st.cuenta.verifica++; sumarCalor(d.p.perfil,0.7);
        if(st.flash && d.p.esferaIdx!=null) st.flash[d.p.esferaIdx]=0.7;
        if(st.cod.cola.length<2) st.cod.cola.push(`red.verificar(#${d.p.id}) // ${d.p.muni.label.toLowerCase()}, ok\n`);
        if(ahora-st.ultLog>900){ st.ultLog=ahora; log('verifica',`${corto(d.p.nombre)} en ${d.p.muni.label}`,'#b48cff'); }
        break;
      case 'busqueda':
        st.cuenta.busqueda++;
        st.cod.cola.push(d.p ? `buscar("${recortar(d.texto||'',28)}")\n  .elegir(#${d.p.id}) // ${d.origen}\n` : `buscar("${recortar(d.texto||'',28)}") // sin coincidencia\n`);
        log('busca', d.p ? `${corto(d.p.nombre)} por ${d.origen}` : `sin coincidencia: ${recortar(d.texto||'',26)}`, '#ffc93c');
        break;
      case 'rostro':
        st.cuenta.rostro++;
        st.cod.cola.push(`camara.rostro({ puntos: 68, confianza: ${(d.score||0).toFixed(2)} })\n`);
        log('rostro','nueva persona frente a la cámara','#4de3ff');
        break;
      case 'bienvenida':
        st.cod.cola.push(`voz.saludar(#${d.p.id}) // "${recortar(d.texto,26)}"\n`);
        log('saluda',`${corto(d.p.nombre)}`,'#ff3fa4');
        break;
      case 'nuevos':
        log('sync',`${fmt(d.n)} inscripciones nuevas`,'#ffc93c');
        st.cod.cola.push(`eventos.sincronizar() // +${d.n}\n`);
        break;
      case 'texto':
        log(d.verbo||'info', d.texto, d.color||'#79a896');
        break;
    }
  }

  function servicio(nombre,estado,ms){
    const s=st.servicios[nombre]; if(!s) return;
    s.estado=estado; if(ms!=null) s.ms=ms; if(estado==='activo') s.n++;
  }

  function log(verbo,texto,color){
    const ol=document.getElementById('bitacora'); if(!ol) return;
    const li=document.createElement('li');
    li.innerHTML=`<time>${hora()}</time><b style="color:${color}">${esc(verbo)}</b>`;
    li.append(document.createTextNode(texto));
    ol.append(li);
    const cabe=Math.max(3,Math.floor((ol.clientHeight||80)/13.5));
    while(ol.children.length>cabe) ol.firstChild.remove();
    st.logMin.push(performance.now());
  }

  /* ---------------- código que se escribe solo ---------------- */
  const RE_TOK=/("(?:[^"\\]|\\.)*")|(\/\/.*$)|(#?\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*:)|([A-Za-z_][\w.\[\]]*)(?=\()/g;
  function resaltar(linea){
    let out='', i=0, m; RE_TOK.lastIndex=0;
    while((m=RE_TOK.exec(linea))){
      out+=esc(linea.slice(i,m.index));
      const cls=m[1]?'s':m[2]?'c':m[3]?'n':m[4]?'k':'f';
      out+=`<span class="${cls}">${esc(m[0])}</span>`; i=m.index+m[0].length;
      if(m[0].length===0) RE_TOK.lastIndex++;
    }
    return out+esc(linea.slice(i));
  }
  function ocio(){
    const op=[
      ()=>`red.latido({ neuronas: ${S.nodos.length}, activas: ${S.colocados} })\n`,
      ()=>`pulpo.respirar(${octo.act.toFixed(3)})\n`,
      ()=>`camara.analizar({ rostros: ${VIS.caras.length} })\n`,
      ()=>`eventos.proxima_consulta() // ${Math.max(0,Math.round(((S.proximoRefresco||0)-Date.now())/1000))} s\n`,
      ()=>`tentaculos.estado() // ${octo.brazos.filter(b=>b.estado!=='libre').length} de 8 activos\n`
    ];
    st.cod.ocio=(st.cod.ocio+1)%op.length; return op[st.cod.ocio]();
  }
  function escribir(now,dt){
    const c=st.cod;
    if(!c.actual){
      if(c.cola.length){ c.actual=c.cola.shift(); c.pos=0; }
      else if(now-c.ultimo>1300 && S.cargado){ c.actual=ocio(); c.pos=0; }
    }
    if(!c.actual) return;
    const vel=70*(1+c.cola.length*1.6);
    const n=Math.max(1,Math.round(vel*dt));
    const trozo=c.actual.slice(c.pos,c.pos+n); c.pos+=n; c.texto+=trozo; c.car+=trozo.length;
    if(c.pos>=c.actual.length){ c.actual=''; c.ultimo=now; }
    const lineas=c.texto.split('\n'); if(lineas.length>40){ c.texto=lineas.slice(-30).join('\n'); }
    const pre=document.getElementById('codigo'); if(!pre||!pre.clientHeight) return;
    const max=Math.max(2,Math.floor(pre.clientHeight/15.2));
    const vis=c.texto.split('\n').slice(-max);
    const html=vis.map((l,i)=>resaltar(l)+(i===vis.length-1?'<span class="cursor"></span>':'')).join('\n');
    if(html!==c.html){ pre.innerHTML=html; c.html=html; }
  }

  /* ---------------- dibujos ---------------- */
  function dibTent(t){
    const L=lienzo('cvTent'); if(!L) return; const {ctx,w,h}=L;
    const rh=h/8, x0=22, x1=w-54, bw=Math.max(10,x1-x0), segs=22;
    ctx.font=`500 9.5px ${MONO}`; ctx.textBaseline='middle';
    octo.brazos.forEach((b,i)=>{
      const y=i*rh+rh/2, col=COL_ETAPA[b.etapa]||COL_ETAPA.libre;
      ctx.globalAlpha=1; ctx.fillStyle='#4f8a75'; ctx.fillText('t'+(i+1),0,y);
      const r=Math.max(0,Math.min(1,b.reach)), llenos=Math.round(r*segs), sw=bw/segs;
      for(let s=0;s<segs;s++){
        if(s<llenos){ ctx.fillStyle=col; ctx.globalAlpha=0.3+0.7*(s/segs); }
        else { ctx.fillStyle='#3dffa0'; ctx.globalAlpha=0.07; }
        ctx.fillRect(x0+s*sw, y-3, sw-1.6, 6);
      }
      // punta del tentáculo: destello rosa
      if(b.flare>0.03){ ctx.globalAlpha=b.flare; ctx.fillStyle='#ff3fa4'; ctx.beginPath(); ctx.arc(x0+Math.max(llenos,1)*sw, y, 3+5*b.flare, 0, Math.PI*2); ctx.fill(); }
      // escáner que nunca se detiene
      const sx=x0+((t*(0.28+i*0.03)+i*0.137)%1)*bw;
      ctx.globalAlpha=0.55; ctx.fillStyle='#e9fff6'; ctx.fillRect(sx,y-5,1.2,10);
      ctx.globalAlpha=1; ctx.fillStyle=col;
      ctx.fillText(b.persona ? recortar(corto(b.persona.nombre),8) : (ETAPA[b.etapa]||'libre'), x1+6, y);
    });
    ctx.globalAlpha=1;
  }

  function dibFlujo(now){
    const L=lienzo('cvFlujo'); if(!L) return; const {ctx,w,h}=L;
    const dx=w/(N_SERIE-1), frac=Math.min(1,(now-st.ultMuestra)/100)*dx;
    // retícula que se desplaza
    ctx.strokeStyle='rgba(61,255,160,.07)'; ctx.lineWidth=1; ctx.beginPath();
    for(let y=0.25;y<1;y+=0.25){ ctx.moveTo(0,h*y); ctx.lineTo(w,h*y); }
    const paso=24, off=(now/40)%paso;
    for(let x=w-off;x>0;x-=paso){ ctx.moveTo(x,0); ctx.lineTo(x,h); }
    ctx.stroke();
    const maxR=Math.max(4,...st.serie.ritmo);
    const series=[
      {d:st.serie.ritmo, col:'#3dffa0', norm:v=>v/maxR, relleno:true},
      {d:st.serie.act, col:'#ff3fa4', norm:v=>v},
      {d:st.serie.cam, col:'#4de3ff', norm:v=>v}
    ];
    for(const s of series){
      const n=s.d.length; if(n<2) continue;
      const X=i=>w-(n-1-i)*dx-frac, Y=v=>h-3-Math.max(0,Math.min(1,s.norm(v)))*(h-8);
      ctx.beginPath(); for(let i=0;i<n;i++){ const x=X(i), y=Y(s.d[i]); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
      if(s.relleno){ ctx.save(); ctx.lineTo(X(n-1),h); ctx.lineTo(X(0),h); ctx.closePath(); const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'rgba(61,255,160,.28)'); g.addColorStop(1,'rgba(61,255,160,0)'); ctx.fillStyle=g; ctx.fill(); ctx.restore();
        ctx.beginPath(); for(let i=0;i<n;i++){ const x=X(i), y=Y(s.d[i]); i?ctx.lineTo(x,y):ctx.moveTo(x,y); } }
      ctx.strokeStyle=s.col; ctx.globalAlpha=0.18; ctx.lineWidth=4; ctx.stroke();
      ctx.globalAlpha=1; ctx.lineWidth=1.2; ctx.stroke();
      // cabeza brillante
      const yl=Y(s.d[n-1]); ctx.fillStyle=s.col; ctx.beginPath(); ctx.arc(X(n-1),yl,2.2,0,Math.PI*2); ctx.fill();
    }
    ctx.font=`500 9px ${MONO}`; ctx.textBaseline='top';
    [['ritmo','#3dffa0'],['actividad','#ff3fa4'],['cámara','#4de3ff']].forEach(([t,c],i)=>{ ctx.fillStyle=c; ctx.fillText(t,4+i*62,2); });
  }

  function dibCalor(now){
    const L=lienzo('cvCalor'); if(!L) return; const {ctx,w,h}=L;
    const filas=st.filas.length||1, lab=34, cw=(w-lab)/COLS_CALOR, ch=h/filas;
    const frac=Math.min(1,(now-st.ultCalor)/450)*cw;
    ctx.font=`500 8.5px ${MONO}`; ctx.textBaseline='middle';
    for(let j=0;j<st.calor.length;j++){
      const col=st.calor[j], x=lab+w-lab-(st.calor.length-j)*cw-frac+cw;
      if(x<lab-cw) continue;
      for(let i=0;i<filas;i++){
        const v=Math.min(1,(col[i]||0)/st.maxCalor + 0.05*(0.5+0.5*Math.sin(now/380+i*1.7+j*0.9)));
        ctx.fillStyle=RAMPA[Math.min(63,Math.floor(v*63))];
        ctx.fillRect(Math.max(lab,x), i*ch+0.5, cw-1, ch-1);
      }
    }
    ctx.fillStyle='rgba(2,20,14,.9)'; ctx.fillRect(0,0,lab-2,h);
    st.filas.forEach((pk,i)=>{ ctx.fillStyle=COLOR_PERFIL[pk]||'#3dffa0'; ctx.fillText((CORTO[pk]||pk).slice(0,5).toLowerCase(),0,i*ch+ch/2); });
  }

  function dibNucleo(now,dt){
    const L=lienzo('cvNucleo'); if(!L) return; const {ctx,w,h}=L;
    const cx=w/2, cy=h/2, R=Math.min(w,h)*0.42;
    st.rot+=dt*(0.35+octo.act*0.5);
    const ca=Math.cos(st.rot), sa=Math.sin(st.rot), tl=0.42, ct=Math.cos(tl), stl=Math.sin(tl);
    // órbitas
    ctx.strokeStyle='rgba(61,255,160,.16)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(cx,cy,R*1.12,R*0.34,0.15*Math.sin(now/3000),0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(255,63,164,.16)';
    ctx.beginPath(); ctx.ellipse(cx,cy,R*1.18,R*0.22,-0.5+st.rot*0.3,0,Math.PI*2); ctx.stroke();
    const decae=Math.exp(-dt*2.2);
    for(let i=0;i<st.esfera.length;i++){
      const q=st.esfera[i];
      const x1=q.x*ca+q.z*sa, z1=-q.x*sa+q.z*ca;
      const y2=q.y*ct-z1*stl, z2=q.y*stl+z1*ct;
      const d=(z2+1)/2, px=cx+x1*R, py=cy+y2*R;
      const f=st.flash[i]; if(f>0.01) st.flash[i]=f*decae;
      if(q.p.placed){
        ctx.fillStyle=COLOR_PERFIL[q.p.perfil]||'#3dffa0'; ctx.globalAlpha=0.25+0.75*d;
        const s=0.9+1.8*d+f*4; ctx.fillRect(px-s/2,py-s/2,s,s);
      } else { ctx.fillStyle='#2f6b57'; ctx.globalAlpha=0.12+0.3*d; ctx.fillRect(px-0.6,py-0.6,1.2,1.2); }
      if(f>0.08){ ctx.globalAlpha=f*0.7; ctx.strokeStyle='#ff3fa4'; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(px,py); ctx.stroke(); }
    }
    ctx.globalAlpha=1;
    const tot=S.personas.size||1, pct=Math.round(S.colocados/tot*100);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='rgba(1,14,9,.6)'; ctx.beginPath(); ctx.arc(cx,cy,R*0.34,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#e9fff6'; ctx.font=`600 ${Math.round(R*0.3)}px ${MONO}`; ctx.fillText(fmt(S.colocados),cx,cy-2);
    ctx.fillStyle='#79a896'; ctx.font=`500 9px ${MONO}`; ctx.fillText('registros',cx,cy+R*0.22);
    ctx.textAlign='left';
    document.getElementById('tNucleo').textContent=`${pct} %`;
  }

  function dibHisto(){
    const L=lienzo('cvHisto'); if(!L) return; const {ctx,w,h}=L;
    const bins=new Array(24).fill(0);
    for(const f of st.frames){ bins[Math.min(23,Math.floor(f*1000/2.5))]++; }
    const mx=Math.max(1,...bins), bw=w/bins.length;
    bins.forEach((v,i)=>{ const hh=v/mx*(h-2); ctx.fillStyle=i<8?'#3dffa0':i<14?'#ffc93c':'#ff3fa4'; ctx.globalAlpha=0.35+0.65*(v/mx); ctx.fillRect(i*bw,h-hh,bw-1.5,hh); });
    ctx.globalAlpha=1;
  }

  function dibOnda(now){
    const L=lienzo('onda'); if(!L) return; const {ctx,w,h}=L;
    const n=140, t=now/1000; let yp=null;
    ctx.strokeStyle='rgba(124,247,255,.85)'; ctx.lineWidth=1; ctx.beginPath();
    for(let i=0;i<n;i++){
      const v=VIS.onda[VIS.onda.length-n+i] ?? 0;
      const base=VIS.activo ? v*0.85+0.05*Math.sin(t*9+i*0.7) : 0.08+0.05*Math.sin(t*3+i*0.25);
      const x=i/(n-1)*w, y=h-2-Math.max(0,base)*(h-4);
      if(yp===null) ctx.moveTo(x,y); else { ctx.lineTo(x,yp); ctx.lineTo(x,y); }
      yp=y;
    }
    ctx.stroke();
  }

  /* ---------------- muestreo y números ---------------- */
  function muestrear(now){
    if(now-st.ultMuestra<100) return; st.ultMuestra=now;
    st.coloca=st.coloca.filter(x=>now-x<2000);
    const previo=st.serie.ritmo[st.serie.ritmo.length-1]||0;
    st.serie.ritmo.push(previo*0.82+(st.coloca.length/2)*0.18);
    st.serie.act.push(0.08+octo.act*0.82+0.04*Math.sin(now/260));
    st.serie.cam.push(VIS.activo ? (VIS.onda[VIS.onda.length-1]||0)*0.9 : 0.05+0.03*Math.sin(now/170));
    for(const k in st.serie) if(st.serie[k].length>N_SERIE) st.serie[k].shift();
  }
  function columnaCalor(now){
    if(now-st.ultCalor<450) return; st.ultCalor=now;
    const col=st.filas.map(pk=>st.slot.get(pk)||0); st.slot.clear();
    st.calor.push(col); if(st.calor.length>COLS_CALOR+1) st.calor.shift();
    const mx=Math.max(1,...st.calor.flat()); st.maxCalor=st.maxCalor*0.97+mx*0.03;
  }

  function tick(){
    if(!S) return;
    const now=performance.now();
    const tot=S.personas.size;
    document.getElementById('nOrg').textContent=fmt(S.colocados);
    document.getElementById('nTot').textContent=fmt(tot);
    document.getElementById('tRitmo').textContent=`${(st.coloca.length/2).toLocaleString('es-CO',{maximumFractionDigits:1})}/s`;
    document.getElementById('tFlujo').textContent=`act ${(octo.act*100|0)} %`;
    document.getElementById('tCalor').textContent=`${fmt(st.eventosCalor)} ev`;
    document.getElementById('tTokens').textContent=st.cod.car>999?`${(st.cod.car/1000).toLocaleString('es-CO',{maximumFractionDigits:1})}k car`:`${st.cod.car} car`;
    st.logMin=st.logMin.filter(x=>now-x<60000); document.getElementById('tLog').textContent=`${st.logMin.length}/min`;
    document.getElementById('tFps').textContent=`${st.fps} fps`;
    // entidades
    for(const tl of st.tiles){ const t=st.entTot.get(tl.key)||0, c=st.entCol.get(tl.key)||0; tl.el.querySelector('em').textContent=`${fmt(c)}/${fmt(t)}`; tl.el.querySelector('i').style.width=(t?c/t*100:0)+'%'; }
    // cámara
    document.getElementById('cAhora').textContent=VIS.caras.length;
    document.getElementById('cUnicos').textContent=fmt(VIS.vistos.length);
    document.getElementById('cRecon').textContent=fmt(VIS.bienvenidas);
    document.getElementById('cA').textContent=fmt(VIS.conteo.female||0);
    document.getElementById('cB').textContent=fmt(VIS.conteo.male||0);
    document.getElementById('tCam').textContent=VIS.activo?`${VIS.caras.length} rostro${VIS.caras.length===1?'':'s'}`:'off';
    st.servicios.camara.estado=VIS.activo?(VIS.caras.length?'activo':'ok'):'off';
    // luces
    for(const s of Object.values(st.servicios)){ s.el.className=s.estado; s.el.querySelector('em').textContent=s.ms!=null?`${fmt(s.ms)} ms`:(s.estado==='off'?'off':'–'); }
    // división en bloques
    const valores={coloca:S.colocados, verifica:st.cuenta.verifica, busqueda:st.cuenta.busqueda, rostro:VIS.vistos.length};
    const tope={coloca:Math.max(1,tot), verifica:Math.max(20,st.cuenta.verifica*1.2), busqueda:Math.max(10,st.cuenta.busqueda*1.3), rostro:Math.max(10,VIS.vistos.length*1.3)};
    for(const k in valores){ const d=st['split_'+k]; if(!d) continue; const on=Math.round(18*Math.min(1,valores[k]/tope[k]));
      [...d.querySelectorAll('.bloques i')].forEach((b,i)=>{ b.className=i<on?(i===on-1?'on ult':'on'):''; });
      d.querySelector('em').textContent=fmt(valores[k]); }
  }

  /* ---------------- cuadro ---------------- */
  let impar=false;
  function cuadro(now,dt){
    st.frames.push(dt); if(st.frames.length>120) st.frames.shift();
    const media=st.frames.reduce((a,b)=>a+b,0)/st.frames.length; st.fps=Math.round(1/Math.max(0.001,media));
    muestrear(now); columnaCalor(now); escribir(now,dt);
    const t=now/1000;
    dibTent(t);
    impar=!impar;            // los dibujos más pesados se reparten en cuadros alternos
    if(impar){ dibFlujo(now); dibCalor(now); dibHisto(); }
    else { dibNucleo(now,dt*2); dibOnda(now); }
  }

  return { iniciar, datos, evento, servicio, log, cuadro, ticker };
})();
