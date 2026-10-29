/* =====================================================================
   Pulpo de datos – Cumbre Tecnológica IA Nariño
   Gobernación de Nariño – Secretaría TIC, Innovación y Gobierno Abierto
   ===================================================================== */
'use strict';

/* ---------------- Configuración (viene de index.php, sin claves) ---------------- */
const PC = window.PULPO_CONFIG || {};
const CONFIG = {
  API: 'api.php',
  REFRESCO_MS: (PC.refresco_min || 3) * 60000,
  FOCO_MS: (PC.foco_seg || 9) * 1000,
  SALUDO: PC.saludo || 'Bienvenido, {nombre}',
  FOTO_URL: PC.foto_url || '',
  MODELOS_ROSTRO: 'assets/modelos/',
  UMBRAL_ROSTRO: PC.umbral || 0.5,
  CAMARA: PC.camara !== false,
  VOZ_SERVIDOR: !!PC.voz,
  TTS_SERVIDOR: !!PC.tts,
  GEMINI: !!PC.gemini,
  PASE: PC.pase || ''
};
const DEMO = new URLSearchParams(location.search).has('demo');

const COLOR_PERFIL = {
  participante:'#3dffa0', expositor:'#ffd500', prensa:'#4de3ff', comunicaciones:'#7fb2ff',
  rueda_de_negocios:'#ff7ad9', visitante:'#c6ff5a', staff:'#b48cff', organizador:'#e8fff5'
};
const PLURAL = { participante:'participantes', expositor:'expositores', prensa:'prensa y comunicaciones', comunicaciones:'comunicaciones',
  rueda_de_negocios:'rueda de negocios', visitante:'visitantes', staff:'staff', organizador:'organizadores' };
const CORTO = { participante:'Participantes', expositor:'Expositores', prensa:'Prensa', comunicaciones:'Comunicaciones',
  rueda_de_negocios:'Rueda de negocios', visitante:'Visitantes', staff:'Staff', organizador:'Organizadores' };
const R = 100, SEG = 8, M = 34, NB = 17;
const $ = s => document.querySelector(s);
const fmt = n => Number(n).toLocaleString('es-CO');

/* =====================================================================
   TEXTO Y NORMALIZACIÓN
   ===================================================================== */
const norm = s => (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const MINUS = new Set(['de','del','la','las','los','y','e']);
function titulo(s){
  return (s||'').toString().toLowerCase().trim().replace(/\s+/g,' ').split(' ')
    .map((w,i)=> (i>0 && MINUS.has(w)) ? w : w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
function bonito(raw){
  const s=(raw||'').trim().replace(/\s+/g,' ');
  if(/^[A-ZÁÉÍÓÚÑ]{2,7}$/.test(s)) return s;
  if(s===s.toUpperCase() || s===s.toLowerCase()) return titulo(s);
  return s.charAt(0).toUpperCase()+s.slice(1);
}
const ALIAS_ENT = [
  [/^(udenar|u de narino|universidad de narino|univ(ersidad)? narino)/,'udenar','Universidad de Nariño'],
  [/gobernacion( del?)? (departamento de )?narino/,'gobernacion','Gobernación de Nariño'],
  [/alcaldia (municipal )?de pasto/,'alcaldia-pasto','Alcaldía de Pasto'],
  [/^sena\b|servicio nacional de aprendizaje/,'sena','SENA'],
  [/universidad mariana|^umariana/,'umariana','Universidad Mariana'],
  [/cesmag/,'cesmag','Universidad CESMAG'],
  [/corposalud/,'corposalud','CORPOSALUD'],
  [/^idsn$|instituto departamental de salud/,'idsn','IDSN'],
  [/camara de comercio/,'ccpasto','Cámara de Comercio de Pasto'],
  [/^unad$|abierta y a distancia/,'unad','UNAD']
];
function canonEntidad(raw){
  const n=norm(raw);
  if(!n || /^[\d ]+$/.test(n) || /^(ninguna|ninguno|no aplica|na|n a|no|sin entidad|x)$/.test(n)) return {key:'no-reporta', label:'Entidad no reportada'};
  if(/independiente|particular|persona natural|^natural$/.test(n)) return {key:'independiente', label:'Independiente o particular'};
  for(const [re,key,label] of ALIAS_ENT) if(re.test(n)) return {key,label};
  return {key:n, label:bonito(raw)};
}
function canonMunicipio(m){
  const n=norm(m);
  if(!n) return {key:'no-reporta', label:'Municipio no reportado'};
  if(n==='otro municipio' || n==='otro') return {key:'otro', label:'Otro municipio'};
  return {key:n, label:bonito(m)};
}
function fonetica(s){
  return norm(s).replace(/ch/g,'ç').replace(/ll/g,'y').replace(/qu/g,'k').replace(/c([ei])/g,'s$1')
    .replace(/c/g,'k').replace(/z/g,'s').replace(/v/g,'b').replace(/h/g,'').replace(/x/g,'ks').replace(/(.)\1+/g,'$1');
}
function corto(nombre){ const t=nombre.split(' '); if(t.length<2) return nombre; return t[0]+' '+(t[t.length>=4?2:1]||'').charAt(0)+'.'; }
function nombreHablado(p){ const t=p.nombre.split(' ').filter(w=>!MINUS.has(w.toLowerCase())); return t.length>=4 ? t[0]+' '+t[2] : (t.length===2 ? t.join(' ') : t[0]); }
function lev(a,b){
  if(a===b) return 0; const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  let prev=new Array(n+1), cur=new Array(n+1);
  for(let j=0;j<=n;j++) prev[j]=j;
  for(let i=1;i<=m;i++){ cur[0]=i; for(let j=1;j<=n;j++){ cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); } [prev,cur]=[cur,prev]; }
  return prev[n];
}
const sim=(a,b)=> a===b ? 1 : (b.startsWith(a) && a.length>=3 ? .9 : 1-lev(a,b)/Math.max(a.length,b.length));
const STOP=new Set(['busca','buscar','buscame','busque','encuentra','encontrar','encuentrame','a','al','el','la','los','las','de','del','por','favor','quiero','ver','me','mi','se','llama','llamado','llamada','nombre','es','soy','hola','pulpo','donde','esta','persona','senor','senora','doctor','doctora','dr','dra','ingeniero','ingeniera','profe','profesor','profesora','que','un','una','y']);
function tokensConsulta(texto){ return norm(texto).split(' ').filter(w=>w.length>1 && !STOP.has(w)).map(fonetica).filter(Boolean); }
function puntaje(q,p){ let tot=0; for(const a of q){ let best=0; for(const t of p.tok) best=Math.max(best,sim(a,t)); tot+=best; } return q.length ? tot/q.length : 0; }

/* =====================================================================
   ESTADO
   ===================================================================== */
const S = {
  personas:new Map(), lista:[], perfiles:[], evento:null, charlas:[],
  nodos:[], nodoPorClave:new Map(), links:[], etiquetas:[], perfilNodos:[], muniNodos:[],
  colocados:0, verificaciones:0,
  pendientes:[], sector:Math.PI/2, sectorNodo:null, sectorDesde:0, tickSector:0,
  modo:'trabajo', foco:null, focoTimer:null, escuchando:false, cargado:false,
  rostros:new Map(), saludados:new Map(), moviendo:0, ultimoVigia:0, proximoRefresco:0, estadoClave:''
};

/* =====================================================================
   ESCENA THREE.JS
   ===================================================================== */
const renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
$('#escena').appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,1,5000);
const base=new THREE.Group(), grupo=new THREE.Group();
scene.add(base); base.add(grupo);
const uEsc={value:1};

/** Suma luz sin escribir alfa: el brillo se compone sobre el fondo de la página. */
function aditivo(m){
  m.blending=THREE.CustomBlending; m.blendEquation=THREE.AddEquation;
  m.blendSrc=THREE.OneFactor; m.blendDst=THREE.OneFactor;
  m.blendSrcAlpha=THREE.ZeroFactor; m.blendDstAlpha=THREE.OneFactor;
  m.transparent=true; m.depthWrite=false; return m;
}
const VS_PUNTOS=`
  attribute vec3 aColor; attribute float aSize; attribute float aBrillo;
  uniform float uPx; uniform float uEsc; uniform float uCrece;
  varying vec3 vColor; varying float vB;
  void main(){
    vColor=aColor; vB=aBrillo;
    vec4 mv=modelViewMatrix*vec4(position,1.0);
    gl_PointSize=aSize*uPx*uEsc*mix(1.0, 0.75+0.45*min(aBrillo,1.6), uCrece);
    gl_Position=projectionMatrix*mv;
  }`;
const FS_PUNTO=`
  varying vec3 vColor; varying float vB;
  void main(){
    vec2 c=gl_PointCoord-0.5; float d=length(c);
    if(d>0.5) discard;
    float halo=pow(1.0-d*2.0,2.2);
    float nucleo=smoothstep(0.17,0.0,d);
    vec3 col=vColor*(halo*0.85+nucleo*1.3)*vB + vec3(nucleo*0.45*max(vB-0.7,0.0));
    gl_FragColor=vec4(col,1.0);
  }`;
const FS_ANILLO=`
  varying vec3 vColor; varying float vB;
  void main(){
    vec2 c=gl_PointCoord-0.5; float d=length(c);
    if(d>0.5) discard;
    float anillo=smoothstep(0.05,0.0,abs(d-0.43));
    float velo=pow(max(0.0,1.0-d*2.0),3.0)*0.35;
    gl_FragColor=vec4(vColor*(anillo+velo)*vB,1.0);
  }`;
function materialPuntos(frag=FS_PUNTO, crece=1){
  return aditivo(new THREE.ShaderMaterial({
    uniforms:{ uPx:{value:renderer.getPixelRatio()}, uEsc, uCrece:{value:crece} },
    vertexShader:VS_PUNTOS, fragmentShader:frag
  }));
}
const matPuntos=materialPuntos(), matPool=materialPuntos();
const matLinks=aditivo(new THREE.LineBasicMaterial({vertexColors:true}));
const matBrazo=aditivo(new THREE.LineBasicMaterial({vertexColors:true}));
let puntos=null, lineas=null, poolPts=null;
let W=1, H=1;

function geoPuntos(n, color){
  const g=new THREE.BufferGeometry();
  const col=new Float32Array(n*3);
  if(color){ const c=new THREE.Color(color); for(let i=0;i<n;i++) c.toArray(col,i*3); }
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor',new THREE.BufferAttribute(col,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize',new THREE.BufferAttribute(new Float32Array(n),1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aBrillo',new THREE.BufferAttribute(new Float32Array(n),1).setUsage(THREE.DynamicDrawUsage));
  return g;
}

function ajustar(){
  W=window.innerWidth; H=window.innerHeight;
  renderer.setSize(W,H); camera.aspect=W/H;
  const statsH=$('#stats').offsetHeight+22, topH=68;
  const disp=H-statsH-topH;
  const fitPx=Math.max(220,Math.min(W*0.92,disp));
  const wpp=(2*R*1.3)/fitPx;
  const dist=wpp*H/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  camera.position.set(0,0,dist); camera.near=dist*0.2; camera.far=dist*3;
  camera.updateProjectionMatrix();
  base.position.y=((statsH-topH)/2)*wpp;
  uEsc.value=fitPx/760;
}
window.addEventListener('resize',()=>{ ajustar(); medirEtiquetas(); });

/* =====================================================================
   PULPO LINEAL CON PUNTAS QUE DESTELLAN
   ===================================================================== */
const COL_PULPO_APAGADO=new THREE.Color('#1b5240');
const COL_PULPO_NEON=new THREE.Color('#6dffc2');
const COL_DORADO=new THREE.Color('#ffd500');
const COL_PUNTA=new THREE.Color('#ff3fa4');
const octo={ x:0, y:0, rot:0, act:0, w:8, g:new THREE.Group(), mat:null, matOjos:null, brazos:[], brillo:null, puntas:null, anillos:null, cuentas:null };
const IDLE=Array.from({length:M},()=>new THREE.Vector2());
const CEN=Array.from({length:M},()=>new THREE.Vector2());
const _c=new THREE.Color(), _c2=new THREE.Color();

function crearPulpo(){
  octo.mat=aditivo(new THREE.LineBasicMaterial({color:COL_PULPO_APAGADO.clone()}));
  octo.matOjos=aditivo(new THREE.LineBasicMaterial({color:COL_PULPO_APAGADO.clone()}));
  const w=octo.w;
  for(const [esc,dy] of [[1,0],[0.74,0.22],[0.47,0.52],[0.22,0.82]]){
    const pts=[];
    for(let i=0;i<80;i++){
      const t=i/80*Math.PI*2, s=Math.sin(t), c=Math.cos(t);
      pts.push(new THREE.Vector3(w*esc*s*(c<0?1+0.12*c:1), (c>0?1.5:0.55)*w*esc*c+dy*w, 0));
    }
    octo.g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),octo.mat));
  }
  for(const sx of [-1,1]){
    const pts=[];
    for(let i=0;i<20;i++){ const t=i/20*Math.PI*2; pts.push(new THREE.Vector3(sx*0.42*w+Math.cos(t)*0.15*w, -0.08*w+Math.sin(t)*0.11*w, 0)); }
    octo.g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),octo.matOjos));
  }
  const gb=geoPuntos(1,'#3dffa0');
  gb.attributes.position.setXYZ(0,0,0.35*w,-1); gb.attributes.aSize.setX(0,150);
  octo.brillo=new THREE.Points(gb,materialPuntos(FS_PUNTO,0)); octo.brillo.frustumCulled=false;
  octo.g.add(octo.brillo);
  grupo.add(octo.g);
  for(let k=0;k<8;k++) octo.brazos.push(crearBrazo(k));
  // puntas rosadas, anillos de destello y cuentas punteadas a lo largo de cada tentáculo
  octo.puntas=new THREE.Points(geoPuntos(8,'#ff3fa4'),materialPuntos(FS_PUNTO,0));
  octo.anillos=new THREE.Points(geoPuntos(8,'#ff6fc0'),materialPuntos(FS_ANILLO,0));
  octo.cuentas=new THREE.Points(geoPuntos(8*NB,null),materialPuntos(FS_PUNTO,0));
  for(const o of [octo.cuentas,octo.anillos,octo.puntas]){ o.frustumCulled=false; o.renderOrder=6; grupo.add(o); }
}
function crearBrazo(k){
  const a=Math.PI+(k+0.5)/8*Math.PI;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(M*2*3),3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(M*2*3),3).setUsage(THREE.DynamicDrawUsage));
  const linea=new THREE.Line(geo,matBrazo); linea.frustumCulled=false; grupo.add(linea);
  return { k, a, bx:Math.cos(a)*0.8*octo.w, by:-0.28*octo.w+Math.sin(a)*0.3*octo.w,
    reach:0, u:0, target:new THREE.Vector3(), desde:new THREE.Vector3(), tip:new THREE.Vector3(),
    estado:'libre', etapa:'libre', persona:null, tarea:null, token:0, proxima:0, fase:Math.random()*6.28,
    lado:k<4?1:-1, geo, tipColor:new THREE.Color('#6dffc2'), flare:0, anillo:0, brilloBrazo:0 };
}
/** La punta llega a un dato: destello y anillo expansivo. */
function destello(b, fuerza=1){ b.flare=Math.max(b.flare,fuerza); b.anillo=1; }

function actualizarPulpo(dt,t){
  let activos=0, mx=0, my=0;
  for(const b of octo.brazos){ if(b.reach>0.15){ activos++; mx+=b.target.x-octo.x; my+=b.target.y-octo.y; } }
  const meta=Math.min(1, activos/8*0.75 + (S.foco?1:0) + (S.escuchando?0.55:0));
  octo.act+=(meta-octo.act)*Math.min(1,dt*2.5);
  let rotObj=Math.sin(t*0.4)*0.25;
  if(activos) rotObj=Math.atan2(-my,-mx)-Math.PI/2;
  let d=rotObj-octo.rot; d=Math.atan2(Math.sin(d),Math.cos(d));
  octo.rot+=d*Math.min(1,dt*2.2);
  const resp=Math.sin(t*(S.escuchando?4:2.2));
  octo.g.position.set(octo.x,octo.y,3);
  octo.g.rotation.z=octo.rot;
  octo.g.scale.set(1+0.05*resp,1-0.04*resp,1);
  octo.mat.color.lerpColors(COL_PULPO_APAGADO,COL_PULPO_NEON,octo.act);
  octo.matOjos.color.lerpColors(COL_PULPO_APAGADO,(S.escuchando||S.foco)?COL_DORADO:COL_PULPO_NEON,Math.min(1,octo.act*1.2));
  const ab=octo.brillo.geometry.attributes.aBrillo; ab.setX(0,0.05+octo.act*0.22); ab.needsUpdate=true;
}

function actualizarBrazo(b,t){
  const cr=Math.cos(octo.rot), sr=Math.sin(octo.rot);
  const bx=octo.x+b.bx*cr-b.by*sr, by=octo.y+b.bx*sr+b.by*cr;
  const dir0=b.a+octo.rot, L=octo.w*3.3, seg=L/(M-1), vel=S.escuchando?2.8:1.3;
  let x=bx, y=by;
  for(let i=0;i<M;i++){
    const s=i/(M-1); IDLE[i].set(x,y);
    const phi=dir0+b.lado*1.7*s*s+0.45*Math.sin(t*vel+b.fase+s*3.2)*s;
    x+=Math.cos(phi)*seg; y+=Math.sin(phi)*seg;
  }
  const e=b.reach;
  if(e>0.001){
    const tx=b.target.x, ty=b.target.y, dx=tx-bx, dy=ty-by, dist=Math.hypot(dx,dy)||1;
    const px=-dy/dist, py=dx/dist;
    const bend=dist*0.2*b.lado*(0.75+0.25*Math.sin(t*0.8+b.fase));
    const c1x=bx+Math.cos(dir0)*dist*0.22+dx*0.3+px*bend, c1y=by+Math.sin(dir0)*dist*0.22+dy*0.3+py*bend;
    const amp=Math.min(3.2,dist*0.045);
    for(let i=0;i<M;i++){
      const s=i/(M-1), u=1-s;
      let qx=u*u*bx+2*u*s*c1x+s*s*tx, qy=u*u*by+2*u*s*c1y+s*s*ty;
      const w=Math.sin(s*Math.PI*2.3-t*6+b.fase)*amp*s*(1-s)*3;
      qx+=px*w; qy+=py*w;
      CEN[i].set(IDLE[i].x+(qx-IDLE[i].x)*e, IDLE[i].y+(qy-IDLE[i].y)*e);
    }
  } else for(let i=0;i<M;i++) CEN[i].copy(IDLE[i]);
  b.tip.set(CEN[M-1].x,CEN[M-1].y,3);

  const pos=b.geo.attributes.position.array, col=b.geo.attributes.color.array;
  const ancho=octo.w*0.11;
  const brillo=0.18+0.82*Math.max(Math.min(e,1),octo.act*0.45);
  b.brilloBrazo=brillo;
  _c.copy(octo.mat.color);
  if(b.persona) b.tipColor.copy(b.persona.node.color); else b.tipColor.copy(octo.mat.color);
  for(let i=0;i<M;i++){
    const s=i/(M-1);
    const a=CEN[Math.max(0,i-1)], c=CEN[Math.min(M-1,i+1)];
    let tx=c.x-a.x, ty=c.y-a.y; const l=Math.hypot(tx,ty)||1; tx/=l; ty/=l;
    const w=ancho*Math.pow(1-s,1.15)+0.05;
    const j=i*3, k=(2*M-1-i)*3;
    pos[j]=CEN[i].x-ty*w; pos[j+1]=CEN[i].y+tx*w; pos[j+2]=3;
    pos[k]=CEN[i].x+ty*w; pos[k+1]=CEN[i].y-tx*w; pos[k+2]=3;
    _c2.lerpColors(_c,b.tipColor,s*s);
    const v=brillo*(0.5+0.5*s)*(b.persona?1.25:1);
    col[j]=col[k]=_c2.r*v; col[j+1]=col[k+1]=_c2.g*v; col[j+2]=col[k+2]=_c2.b*v;
  }
  b.geo.attributes.position.needsUpdate=true; b.geo.attributes.color.needsUpdate=true;

  // cuentas punteadas sobre el tentáculo
  const cg=octo.cuentas.geometry, cp=cg.attributes.position, cc=cg.attributes.aColor, cs=cg.attributes.aSize, cb=cg.attributes.aBrillo;
  for(let j=0;j<NB;j++){
    const i=1+j*2, idx=b.k*NB+j, s=i/(M-1);
    cp.setXYZ(idx,CEN[i].x,CEN[i].y,3.2);
    _c2.lerpColors(_c,b.tipColor,s);
    cc.setXYZ(idx,_c2.r,_c2.g,_c2.b);
    cs.setX(idx,3.2-1.6*s);
    cb.setX(idx,brillo*(0.35+0.4*Math.sin(t*5-s*9+b.fase)*0.5+0.2));
  }
}
function actualizarPuntas(dt){
  const pp=octo.puntas.geometry.attributes, ap=octo.anillos.geometry.attributes, cg=octo.cuentas.geometry.attributes;
  for(const b of octo.brazos){
    const i=b.k;
    b.flare*=Math.exp(-dt*2.6);
    b.anillo=Math.max(0,b.anillo-dt*1.5);
    const r=Math.max(0,Math.min(1,b.reach));
    pp.position.setXYZ(i,b.tip.x,b.tip.y,3.5);
    pp.aSize.setX(i,7+5*r+26*b.flare);
    pp.aBrillo.setX(i,0.28+0.5*r+3.4*b.flare);
    ap.position.setXYZ(i,b.tip.x,b.tip.y,3.5);
    ap.aSize.setX(i,b.anillo>0 ? 8+42*(1-b.anillo) : 0);
    ap.aBrillo.setX(i,b.anillo*b.anillo*1.4);
  }
  for(const a of [pp,ap]){ a.position.needsUpdate=a.aSize.needsUpdate=a.aBrillo.needsUpdate=true; }
  cg.position.needsUpdate=cg.aColor.needsUpdate=cg.aSize.needsUpdate=cg.aBrillo.needsUpdate=true;
}

/* =====================================================================
   DATOS (a través de api.php)
   ===================================================================== */
async function pedir(accion,{metodo='GET', cuerpo=null, json=null, servicio='eventos', binario=false}={}){
  const t0=performance.now();
  HUD.servicio(servicio,'activo');
  const opt={method:metodo, headers:{'X-Pulpo-Pase':CONFIG.PASE}, cache:'no-store', credentials:'same-origin'};
  if(json){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(json); }
  else if(cuerpo) opt.body=cuerpo;
  let r;
  try{ r=await fetch(`${CONFIG.API}?accion=${accion}`,opt); }
  catch(e){ HUD.servicio(servicio,'error'); throw new Error('sin conexión con el servidor'); }
  const ms=Math.round(performance.now()-t0);
  const pase=r.headers.get('X-Pulpo-Pase'); if(pase) CONFIG.PASE=pase;
  if(!r.ok){
    let msg=`error ${r.status}`, codigo=''; try{ const j=await r.json(); if(j.error) msg=j.error; codigo=j.codigo||''; }catch(_){}
    HUD.servicio(servicio,'error',ms);
    if(codigo==='pase') recargarPorPase();
    throw new Error(msg);
  }
  HUD.servicio(servicio,'ok',ms);
  return binario ? r.blob() : r.json();
}
/** El pase vence tras 24 h sin hablar con el servidor: recarga la página (como máximo cada 5 min). */
function recargarPorPase(){
  let ultima=0; try{ ultima=Number(sessionStorage.getItem('pulpoRecarga'))||0; }catch(_){}
  if(Date.now()-ultima<300000) return;
  try{ sessionStorage.setItem('pulpoRecarga',String(Date.now())); }catch(_){}
  aviso('La sesión de la pantalla venció. Recargando…');
  setTimeout(()=>location.reload(),2500);
}
async function cargarDatos(){
  if(DEMO) return datosDemo();
  return pedir('datos');
}
function integrar(d){
  S.evento=d.evento||S.evento; S.perfiles=d.perfiles||S.perfiles;
  if(d.evento && d.evento.nombre) $('#nombreEvento').textContent=d.evento.nombre.replace(/\bAI\b/,'IA');
  let nuevos=0;
  for(const r of (d.personas||[])){
    let p=S.personas.get(r.id);
    if(!p){ p=crearPersona(r); S.personas.set(r.id,p); nuevos++; }
    else p.ingresos=Array.isArray(r.ingresos)?r.ingresos.length:(r.ingresos||0);
  }
  S.lista=[...S.personas.values()];
  S.charlas=S.lista.filter(p=>p.propuesta && p.propuesta.agenda && p.propuesta.agenda.fecha).map(p=>{
    const ag=p.propuesta.agenda;
    return { nombre:p.nombre, entidad:p.ent.label, titulo:(p.propuesta.titulo||'').replace(/^[“"]|[”"]$/g,''),
      dia:ag.dia, fecha:ag.fecha, hora:ag.hora, t:Date.parse(`${ag.fecha}T${ag.hora}:00-05:00`), dur:p.propuesta.duracion_min||20 };
  }).sort((a,b)=>a.t-b.t);
  return nuevos;
}
function crearPersona(r){
  const nombre=titulo(r.nombre);
  const ang=Math.random()*Math.PI*2, rad=R*(0.1+0.3*Math.sqrt(Math.random()));
  return {
    id:r.id, nombre, tok:fonetica(nombre).split(' ').filter(w=>w.length>1),
    perfil:(r.perfil&&r.perfil.clave)||'participante', ent:canonEntidad(r.entidad), muni:canonMunicipio(r.municipio),
    carnet:r.carnet||'', ingresos:Array.isArray(r.ingresos)?r.ingresos.length:(r.ingresos||0), propuesta:r.propuesta||null, orden:r.orden??null,
    placed:false, claimed:false, carrier:null, node:null, poolIdx:0, esferaIdx:null,
    px:Math.cos(ang)*rad, py:Math.sin(ang)*rad, pz:(Math.random()-.5)*6, ph:Math.random()*6.28, actual:new THREE.Vector3()
  };
}

/* =====================================================================
   ÁRBOL RADIAL: perfil → municipio → entidad → persona
   ===================================================================== */
function nuevoNodo(tipo,clave){
  return { tipo, clave, label:'', color:new THREE.Color(), pos:new THREE.Vector3(), dest:new THREE.Vector3(),
    ang:0, u:0, glow:0, lit:0, brillo:0, ph:Math.random()*6.28, parent:null, total:0, colocados:0, tam:5, idx:0, nuevo:true };
}
function construirArbol(){
  const ordenPerfil=new Map(S.perfiles.map((p,i)=>[p.clave,i]));
  const nombrePerfil=new Map(S.perfiles.map(p=>[p.clave,p.nombre]));
  const arbol=new Map();
  for(const p of S.personas.values()){
    if(!arbol.has(p.perfil)) arbol.set(p.perfil,new Map());
    const mm=arbol.get(p.perfil);
    if(!mm.has(p.muni.key)) mm.set(p.muni.key,{muni:p.muni, ents:new Map(), n:0});
    const m=mm.get(p.muni.key); m.n++;
    if(!m.ents.has(p.ent.key)) m.ents.set(p.ent.key,{ent:p.ent, personas:[]});
    m.ents.get(p.ent.key).personas.push(p);
  }
  const N=S.personas.size, gapP=Math.max(4,N*0.014), gapM=Math.max(0.5,N*0.0012);
  const usados=new Set(), nodos=[], links=[], jer=[];
  const obtener=(clave,tipo)=>{ let n=S.nodoPorClave.get(clave); if(!n){ n=nuevoNodo(tipo,clave); S.nodoPorClave.set(clave,n);} usados.add(clave); n.total=0; n.colocados=0; n.u0=Infinity; n.u1=-Infinity; return n; };
  const ext=(n,u)=>{ n.u0=Math.min(n.u0,u); n.u1=Math.max(n.u1,u); };
  let cursor=0, alt=0;
  const perfiles=[...arbol.keys()].sort((a,b)=>(ordenPerfil.get(a)??99)-(ordenPerfil.get(b)??99));
  for(const pk of perfiles){
    const nP=obtener('P:'+pk,'perfil'); nP.label=nombrePerfil.get(pk)||titulo(pk.replace(/_/g,' ')); nP.perfil=pk;
    nP.color.set(COLOR_PERFIL[pk]||'#3dffa0'); nP.parent=null; nP.tam=13; jer.push(nP);
    const munis=[...arbol.get(pk).values()].sort((a,b)=>((a.muni.key==='no-reporta')-(b.muni.key==='no-reporta')) || b.n-a.n || a.muni.label.localeCompare(b.muni.label,'es'));
    munis.forEach((m,mi)=>{
      if(mi>0) cursor+=gapM;
      const nM=obtener(`M:${pk}|${m.muni.key}`,'muni'); nM.label=m.muni.label; nM.perfilNombre=nP.label; nM.parent=nP; nM.color.copy(nP.color); nM.tam=7.5; jer.push(nM);
      const ents=[...m.ents.values()].sort((a,b)=>((a.ent.key==='no-reporta')-(b.ent.key==='no-reporta')) || b.personas.length-a.personas.length || a.ent.label.localeCompare(b.ent.label,'es'));
      for(const e of ents){
        const nE=obtener(`E:${pk}|${m.muni.key}|${e.ent.key}`,'ent'); nE.label=e.ent.label; nE.parent=nM; nE.color.copy(nP.color); nE.tam=4.6; jer.push(nE);
        links.push([nM,nE]);
        e.personas.sort((a,b)=>((a.orden??1e9)-(b.orden??1e9)) || a.nombre.localeCompare(b.nombre,'es'));
        for(const p of e.personas){
          const nX=obtener('X:'+p.id,'persona'); nX.persona=p; p.node=nX; nX.parent=nE; nX.color.copy(nP.color); nX.tam=6;
          nX.u=cursor; nX.alt=(alt++)%2; nX.total=1; nX.colocados=p.placed?1:0;
          ext(nE,cursor); ext(nM,cursor); ext(nP,cursor);
          nodos.push(nX); links.push([nE,nX]);
          cursor+=1;
        }
      }
      links.push([nP,nM]);
    });
    cursor+=gapP;
  }
  const T=Math.max(cursor,1);
  for(const n of jer) n.u=(n.u0+n.u1)/2;
  const radio={perfil:R*0.6, muni:R*0.73, ent:R*0.86};
  for(const n of [...jer,...nodos]){
    n.ang=Math.PI/2-(n.u/T)*Math.PI*2;
    const r=n.tipo==='persona' ? R+n.alt*3.4 : radio[n.tipo];
    n.dest.set(Math.cos(n.ang)*r, Math.sin(n.ang)*r, n.tipo==='persona' ? Math.sin(n.ang*7)*1.4 : 0);
    if(n.nuevo){ n.pos.copy(n.dest); n.nuevo=false; }
  }
  for(const p of S.personas.values()) if(p.placed){ let a=p.node.parent; while(a){ a.colocados++; a=a.parent; } }
  for(const n of nodos){ let a=n.parent; while(a){ a.total++; a=a.parent; } }
  for(const k of [...S.nodoPorClave.keys()]) if(!usados.has(k)) S.nodoPorClave.delete(k);
  S.nodos=[...jer,...nodos]; S.links=links; S.moviendo=200;
  S.perfilNodos=jer.filter(n=>n.tipo==='perfil');
  S.muniNodos=jer.filter(n=>n.tipo==='muni');
  reconstruirGeometrias(); crearEtiquetas(); HUD.datos();
}

function reconstruirGeometrias(){
  for(const o of [puntos,lineas,poolPts]) if(o){ grupo.remove(o); o.geometry.dispose(); }
  const n=S.nodos.length, g=geoPuntos(n,null);
  S.nodos.forEach((nd,i)=>{ nd.idx=i; g.attributes.position.setXYZ(i,nd.pos.x,nd.pos.y,nd.pos.z); g.attributes.aColor.setXYZ(i,nd.color.r,nd.color.g,nd.color.b); g.attributes.aSize.setX(i,nd.tam); });
  puntos=new THREE.Points(g,matPuntos); puntos.frustumCulled=false; puntos.renderOrder=2;

  const nv=S.links.length*SEG*2, gl=new THREE.BufferGeometry();
  gl.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nv*3),3).setUsage(THREE.DynamicDrawUsage));
  gl.setAttribute('color',new THREE.BufferAttribute(new Float32Array(nv*3),3).setUsage(THREE.DynamicDrawUsage));
  lineas=new THREE.LineSegments(gl,matLinks); lineas.frustumCulled=false; lineas.renderOrder=1;

  const gp=geoPuntos(S.lista.length,null);
  S.lista.forEach((p,i)=>{ p.poolIdx=i; const c=new THREE.Color(COLOR_PERFIL[p.perfil]||'#3dffa0'); gp.attributes.aColor.setXYZ(i,c.r,c.g,c.b); });
  poolPts=new THREE.Points(gp,matPool); poolPts.frustumCulled=false; poolPts.renderOrder=3;

  grupo.add(lineas); grupo.add(puntos); grupo.add(poolPts);
  actualizarPosLinks();
}
function actualizarPosLinks(){
  const a=lineas.geometry.attributes.position.array; let o=0;
  for(const [P,C] of S.links){
    const rp=Math.hypot(P.pos.x,P.pos.y), ang=Math.atan2(C.pos.y,C.pos.x);
    const qx=Math.cos(ang)*rp, qy=Math.sin(ang)*rp;
    let px=P.pos.x, py=P.pos.y, pz=P.pos.z;
    for(let j=1;j<=SEG;j++){
      const t=j/SEG, u=1-t;
      const x=u*u*P.pos.x+2*u*t*qx+t*t*C.pos.x, y=u*u*P.pos.y+2*u*t*qy+t*t*C.pos.y, z=u*P.pos.z+t*C.pos.z;
      a[o++]=px;a[o++]=py;a[o++]=pz;a[o++]=x;a[o++]=y;a[o++]=z;
      px=x;py=y;pz=z;
    }
  }
  lineas.geometry.attributes.position.needsUpdate=true;
}
function actualizarColLinks(){
  const a=lineas.geometry.attributes.color.array; let o=0;
  for(const [P,C] of S.links){
    const bp=P.brillo*0.3, bc=C.brillo*0.5, r=C.color.r, g=C.color.g, b=C.color.b;
    for(let j=0;j<SEG;j++){
      const v0=bp+(bc-bp)*(j/SEG), v1=bp+(bc-bp)*((j+1)/SEG);
      a[o++]=r*v0;a[o++]=g*v0;a[o++]=b*v0;a[o++]=r*v1;a[o++]=g*v1;a[o++]=b*v1;
    }
  }
  lineas.geometry.attributes.color.needsUpdate=true;
}
function actualizarNodos(dt,t){
  if(!puntos) return;
  const pos=puntos.geometry.attributes.position, br=puntos.geometry.attributes.aBrillo;
  const decae=Math.exp(-dt*1.7), mover=S.moviendo>0, foco=S.foco;
  if(mover) S.moviendo--;
  for(const n of S.nodos){
    if(mover){ n.pos.lerp(n.dest,0.07); pos.setXYZ(n.idx,n.pos.x,n.pos.y,n.pos.z); }
    n.glow*=decae;
    const meta=n.tipo==='persona' ? (n.persona.placed?1:0) : (n.colocados ? 0.3+0.7*n.colocados/n.total : 0);
    n.lit+=(meta-n.lit)*Math.min(1,dt*2.5);
    let b=(n.tipo==='persona'?0.1:0.07)+n.lit*(n.tipo==='persona'?0.6:0.55)+n.glow+n.lit*0.08*Math.sin(t*2.1+n.ph);
    if(foco){ if(foco.ruta.has(n)) b+=0.7+0.3*Math.sin(t*6); else b*=0.3; }
    n.brillo=b; br.setX(n.idx,b);
  }
  if(mover){ pos.needsUpdate=true; actualizarPosLinks(); }
  br.needsUpdate=true;
  actualizarColLinks();
}
function actualizarPool(t){
  if(!poolPts) return;
  const a=poolPts.geometry.attributes;
  for(const p of S.lista){
    const i=p.poolIdx;
    if(p.placed){ a.aSize.setX(i,0); continue; }
    if(p.carrier){ p.actual.copy(p.carrier.tip); a.aSize.setX(i,8); a.aBrillo.setX(i,1.5); }
    else {
      p.actual.set(p.px+Math.sin(t*0.31+p.ph)*2.4, p.py+Math.cos(t*0.27+p.ph*1.3)*2.4, p.pz);
      a.aSize.setX(i,3.6); a.aBrillo.setX(i,p.claimed?0.95:0.4);
    }
    a.position.setXYZ(i,p.actual.x,p.actual.y,p.actual.z);
  }
  a.position.needsUpdate=a.aSize.needsUpdate=a.aBrillo.needsUpdate=true;
}

/* =====================================================================
   TAREAS DEL PULPO
   ===================================================================== */
const azar=(a,b)=>a+Math.random()*(b-a);
const angDist=(a,b)=>{ const d=Math.abs(a-b)%(Math.PI*2); return d>Math.PI?Math.PI*2-d:d; };
const ancestros=n=>{ const out=[]; let a=n.parent; while(a){ out.push(a); a=a.parent; } return out; };
function factorVel(){ const n=S.pendientes.length; return n>400?0.5 : n>150?0.65 : n>40?0.8 : 1; }

function colocar(p){
  if(p.placed) return;
  p.placed=true; p.claimed=false; p.carrier=null;
  S.colocados++;
  const n=p.node; n.glow=2.4;
  ancestros(n).forEach((a,d)=>{ a.colocados++; setTimeout(()=>{ a.glow=Math.max(a.glow,1.3); },(d+1)*150); });
  HUD.evento('coloca',{p});
}
function tareaColocar(b,p){
  const tok=++b.token, f=factorVel();
  b.estado='ocupado'; b.etapa='busca'; b.tarea=p; p.claimed=true;
  b.target.copy(p.actual);
  anime({ targets:b, reach:[b.reach,1], duration:430*f, easing:'easeOutQuad',
    update:()=>b.target.copy(p.actual),
    complete:()=>{ if(tok!==b.token) return;
      b.persona=p; p.carrier=b; b.desde.copy(p.actual); b.u=0; b.etapa='lleva';
      destello(b,0.85); HUD.evento('toma',{p,b});
      anime({ targets:b, u:1, duration:760*f, easing:'easeInOutSine',
        update:()=>b.target.lerpVectors(b.desde,p.node.pos,b.u),
        complete:()=>{ if(tok!==b.token) return;
          b.persona=null; b.tarea=null; b.etapa='suelta'; destello(b,1); colocar(p);
          anime({ targets:b, reach:0, duration:380*f, easing:'easeInQuad',
            complete:()=>{ if(tok!==b.token) return; b.estado='libre'; b.etapa='libre'; b.proxima=performance.now()+azar(40,180)*f; } });
        } });
    } });
}
function tareaVerificar(b,p){
  const tok=++b.token;
  b.estado='ocupado'; b.etapa='verifica';
  anime({ targets:b, reach:[0,1], duration:900, easing:'easeOutSine',
    update:()=>b.target.copy(p.node.pos),
    complete:()=>{ if(tok!==b.token) return;
      p.node.glow=1.7; S.verificaciones++; destello(b,0.9);
      HUD.evento('verifica',{p,b});
      anime({ targets:b, reach:0, duration:700, easing:'easeInOutSine', delay:250,
        complete:()=>{ if(tok!==b.token) return; b.estado='libre'; b.etapa='libre'; b.proxima=performance.now()+azar(2500,7000); } });
    } });
}
function cancelarBrazo(b){
  b.token++; anime.remove(b);
  if(b.persona){ const p=b.persona; b.persona=null; colocar(p); }
  else if(b.tarea && !b.tarea.placed){ b.tarea.claimed=false; }
  b.tarea=null; b.estado='libre'; b.etapa='libre';
}
function moverCuerpo(x,y,dur=1500){
  anime.remove(octo);
  anime({targets:octo, x, y, duration:dur, easing:'easeInOutSine'});
}
function actualizarSector(now){
  S.pendientes=S.lista.filter(p=>!p.placed && !p.claimed);
  if(S.modo!=='trabajo') return;
  const pend=S.pendientes;
  if(!pend.length){
    if(!S.lista.some(p=>!p.placed)){
      if(S.estadoClave!=='vigilia') estado('Vigila la red: verifica registros y espera nuevas inscripciones','vigilia');
      if(now-S.ultimoVigia>7000){ S.ultimoVigia=now; const a=Math.random()*Math.PI*2, r=Math.random()*R*0.22; moverCuerpo(Math.cos(a)*r,Math.sin(a)*r,3000); }
    }
    return;
  }
  const enSector=pend.some(p=>angDist(p.node.ang,S.sector)<0.35);
  if(!enSector || now-S.sectorDesde>9000){
    const cuenta=new Map();
    for(const p of pend){ const m=p.node.parent.parent; cuenta.set(m,(cuenta.get(m)||0)+1); }
    let mejor=null, c=-1;
    for(const [m,n] of cuenta){ if(m===S.sectorNodo && cuenta.size>1) continue; if(n>c){ c=n; mejor=m; } }
    if(!mejor) mejor=[...cuenta.keys()][0];
    S.sectorNodo=mejor; S.sector=mejor.ang; S.sectorDesde=now;
    moverCuerpo(Math.cos(mejor.ang)*R*0.3,Math.sin(mejor.ang)*R*0.3);
    const quien=PLURAL[mejor.parent.perfil]||mejor.perfilNombre.toLowerCase();
    estado(mejor.clave.endsWith('|no-reporta') ? `Organiza ${quien} sin municipio reportado` : `Organiza ${quien} de ${mejor.label}`,'sector');
  }
}
function programar(now){
  if(!S.cargado) return;
  if(now-S.tickSector>400){ S.tickSector=now; actualizarSector(now); }
  if(S.modo!=='trabajo') return;
  const quedan=S.lista.some(p=>!p.placed);
  let ocupados=octo.brazos.filter(b=>b.estado==='ocupado').length;
  for(const b of octo.brazos){
    if(b.estado!=='libre' || now<b.proxima) continue;
    if(S.pendientes.length){
      const obj=S.sector+(b.k-3.5)*0.09;
      let mejor=null, md=9;
      for(const p of S.pendientes){ if(p.claimed||p.placed) continue; const d=angDist(p.node.ang,obj); if(d<md){ md=d; mejor=p; } }
      if(mejor) tareaColocar(b,mejor);
    } else if(!quedan && ocupados<3){
      const listos=S.lista.filter(p=>p.placed);
      if(listos.length){ tareaVerificar(b,listos[(Math.random()*listos.length)|0]); ocupados++; }
      else b.proxima=now+2000;
    }
  }
}

/* =====================================================================
   FOCO: persona encontrada por voz, texto o cámara
   ===================================================================== */
function enfocar(p,origen){
  if(!p || !p.node) return;
  clearTimeout(S.focoTimer);
  S.modo='foco';
  for(const b of octo.brazos) cancelarBrazo(b);
  if(!p.placed) colocar(p);
  const n=p.node;
  S.foco={p, origen, ruta:new Set([n,...ancestros(n)])};
  ancestros(n).forEach((a,i)=>setTimeout(()=>{ a.glow=2; },i*120));
  n.glow=3;
  moverCuerpo(Math.cos(n.ang)*R*0.5,Math.sin(n.ang)*R*0.5,1100);
  const tx=-Math.sin(n.ang), ty=Math.cos(n.ang);
  octo.brazos.forEach((b,i)=>{
    const off=(i-3.5)*2.3, rad=(i%2?1.8:-1.6), tok=b.token;
    b.target.set(n.dest.x+tx*off+Math.cos(n.ang)*rad, n.dest.y+ty*off+Math.sin(n.ang)*rad, 0);
    b.estado='foco'; b.etapa='foco';
    anime({targets:b, reach:[0,1], duration:1000, delay:i*70, easing:'easeOutElastic(1, .75)',
      complete:()=>{ if(tok===b.token) destello(b,1.2); }});
  });
  estado(origen==='camara' ? `Reconoció a ${corto(p.nombre)} frente a la cámara` : `Encontró a ${corto(p.nombre)}`,'foco');
  mostrarTarjeta(p,origen);
  S.focoTimer=setTimeout(soltarFoco,CONFIG.FOCO_MS);
}
function soltarFoco(){
  ocultarTarjeta();
  S.foco=null; S.modo='trabajo'; S.sectorDesde=0; S.estadoClave='';
  octo.brazos.forEach((b,i)=>{
    const tok=++b.token; anime.remove(b);
    anime({targets:b, reach:0, duration:650, delay:i*40, easing:'easeInOutSine', complete:()=>{ if(tok===b.token){ b.estado='libre'; b.etapa='libre'; b.proxima=0; } }});
  });
}

/* =====================================================================
   TARJETA, AVISOS, ETIQUETAS
   ===================================================================== */
const _p=new THREE.Vector3();
function aPantalla(v){ _p.copy(v).applyMatrix4(grupo.matrixWorld).project(camera); return {x:(_p.x+1)/2*W, y:(1-_p.y)/2*H}; }

function mostrarTarjeta(p,origen){
  const el=$('#tarjeta');
  el.classList.toggle('bienvenida',origen==='camara');
  $('#tSaludo').textContent=origen==='camara' ? CONFIG.SALUDO.replace('{nombre}',nombreHablado(p)) : (origen==='voz' ? 'Encontré a' : 'Resultado de la búsqueda');
  $('#tNombre').textContent=p.nombre;
  $('#tEntidad').textContent=p.ent.label;
  const perfil=(S.perfiles.find(x=>x.clave===p.perfil)||{}).nombre||p.perfil;
  $('#tDot').style.background=COLOR_PERFIL[p.perfil]||'#3dffa0';
  $('#tMeta').textContent=`${perfil}, ${p.muni.label}`;
  const ch=$('#tCharla');
  if(p.propuesta && p.propuesta.titulo){
    const ag=p.propuesta.agenda;
    ch.innerHTML=''; const sp=document.createElement('span');
    sp.textContent=ag ? `día ${ag.dia}, ${ag.hora}` : 'charla aprobada';
    ch.append(sp,document.createTextNode(p.propuesta.titulo.replace(/^[“"]|[”"]$/g,'')));
    ch.hidden=false;
  } else ch.hidden=true;
  const btn=$('#tVincular');
  btn.hidden=!(VIS.activo && origen!=='camara');
  btn.disabled=false;
  btn.textContent=S.rostros.has(p.id)?'Actualizar mi rostro':'Vincular mi rostro';
  el.hidden=false;
  anime.remove(el);
  anime({targets:el, opacity:[0,1], scale:[0.96,1], duration:500, easing:'easeOutCubic'});
}
function ocultarTarjeta(){
  const el=$('#tarjeta'); anime.remove(el);
  anime({targets:el, opacity:0, duration:350, easing:'easeInQuad', complete:()=>{ el.hidden=true; $('#guiaLinea').style.display='none'; }});
}
function posicionarTarjeta(){
  const el=$('#tarjeta'); if(el.hidden || !S.foco) return;
  const n=S.foco.p.node, s=aPantalla(n.pos), c=aPantalla(new THREE.Vector3(0,0,0));
  const cw=el.offsetWidth, chh=el.offsetHeight, statsTop=$('#stats').getBoundingClientRect().top;
  const derecha=s.x>=c.x ? (s.x+44+cw<W-14) : (s.x-44-cw<14);
  let left=derecha ? s.x+44 : s.x-44-cw;
  let top=s.y-chh/2;
  left=Math.max(14,Math.min(W-cw-14,left)); top=Math.max(70,Math.min(statsTop-chh-12,top));
  el.style.left=left+'px'; el.style.top=top+'px';
  const ln=$('#guiaLinea');
  const ex=Math.max(left,Math.min(left+cw,s.x)), ey=Math.max(top,Math.min(top+chh,s.y));
  ln.setAttribute('x1',s.x); ln.setAttribute('y1',s.y); ln.setAttribute('x2',ex); ln.setAttribute('y2',ey);
  ln.style.display='';
}
function crearEtiquetas(){
  const cont=$('#etiquetas'); cont.innerHTML=''; S.etiquetas=[];
  for(const n of S.perfilNodos){
    const el=document.createElement('div'); el.className='etq perfil'; el.style.color=COLOR_PERFIL[n.perfil]||'#3dffa0';
    el.append(document.createTextNode(n.label)); const sm=document.createElement('small'); el.append(sm);
    cont.append(el); S.etiquetas.push({el,n,sm,tipo:'perfil',w:0});
  }
  const munis=[...S.muniNodos].sort((a,b)=>b.total-a.total).filter(n=>n.total>=6).slice(0,9);
  for(const n of munis){
    const el=document.createElement('div'); el.className='etq muni'; el.textContent=n.label;
    cont.append(el); S.etiquetas.push({el,n,tipo:'muni',w:0});
  }
  medirEtiquetas();
}
/** El ancho de cada etiqueta se mide aparte para no forzar el diseño en cada cuadro. */
function medirEtiquetas(){ for(const e of S.etiquetas){ if(e.sm) e.sm.textContent=fmt(e.n.total); e.w=e.el.offsetWidth; } }
const _v=new THREE.Vector3();
function actualizarEtiquetas(){
  for(const e of S.etiquetas){
    const n=e.n;
    if(e.tipo==='perfil') _v.set(Math.cos(n.ang)*(R+15),Math.sin(n.ang)*(R+15),0);
    else _v.set(Math.cos(n.ang)*R*0.66,Math.sin(n.ang)*R*0.66,0);
    const s=aPantalla(_v), cx=Math.cos(n.ang);
    const ax=e.tipo==='perfil' ? (cx>0.3?0:(cx<-0.3?-1:-0.5)) : -0.5;
    const x=Math.max(8,Math.min(W-e.w-8,s.x+ax*e.w));   // nunca fuera del borde de la pantalla
    e.el.style.transform=`translate(${x}px,${s.y}px) translateY(-50%)`;
    let op=n.colocados?(e.tipo==='perfil'?0.95:0.7):0.25;
    if(S.foco) op=S.foco.ruta.has(n)?1:0.12;
    e.el.style.opacity=op;
  }
}
let avisoTimer=null;
function aviso(texto,opciones=[]){
  const el=$('#aviso'); $('#avisoTexto').textContent=texto;
  const op=$('#avisoOpciones'); op.innerHTML='';
  for(const p of opciones){ const b=document.createElement('button'); b.textContent=p.nombre; b.onclick=()=>{ el.hidden=true; enfocar(p,'texto'); }; op.append(b); }
  el.hidden=false; clearTimeout(avisoTimer); avisoTimer=setTimeout(()=>el.hidden=true, opciones.length?9000:6000);
}
function estado(txt,clave){ S.estadoClave=clave; $('#estadoPulpo').textContent=txt; }
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const TACTIL=matchMedia('(pointer: coarse)').matches;
function vozEstado(txt){
  const el=$('#vozEstado');
  el.toggleAttribute('data-reposo',!txt);
  el.textContent=txt || (CONFIG.VOZ_SERVIDOR||SR
    ? (TACTIL ? 'Mantén presionado el micrófono y di un nombre' : 'Mantén presionada la barra espaciadora y di un nombre')
    : (TACTIL ? 'Toca la lupa para buscar por nombre' : 'Escribe / para buscar por nombre'));
}

/* =====================================================================
   BÚSQUEDA: voz → texto (ElevenLabs) → elección (Gemini)
   ===================================================================== */
async function buscar(texto,origen){
  texto=(texto||'').trim();
  if(!texto){ vozEstado(); return; }
  if(!S.cargado){ aviso('Los registros aún se están cargando.'); return; }
  vozEstado(`Buscando «${texto}»…`);
  S.escuchando=true;
  const q=tokensConsulta(texto);
  const ranking=S.lista.map(p=>({p,s:puntaje(q,p)})).sort((a,b)=>b.s-a.s);
  const [top,seg]=ranking;
  let elegido=null, gemRespondio=false;
  if(top && top.s>=0.97 && (!seg || seg.s<0.85)) elegido=top.p;
  else if(CONFIG.GEMINI && !DEMO){
    try{
      const cand=ranking.slice(0,25).map(x=>({id:x.p.id, nombre:x.p.nombre, entidad:x.p.ent.label, municipio:x.p.muni.label}));
      const r=await pedir('gemini',{metodo:'POST', json:{texto, candidatos:cand}, servicio:'ia'});
      gemRespondio=true;
      if(r && r.id!=null && (r.confianza??1)>=0.5) elegido=S.personas.get(Number(r.id))||null;
    }catch(e){ console.warn(e); }
  }
  if(!elegido && !gemRespondio && top && top.s>=0.8) elegido=top.p;
  S.escuchando=false; vozEstado();
  HUD.evento('busqueda',{p:elegido, texto, origen});
  if(elegido) enfocar(elegido,origen);
  else aviso(`No encontré a «${texto}».${ranking[0]&&ranking[0].s>0.45?' ¿Buscas a alguna de estas personas?':''}`, ranking.slice(0,3).filter(x=>x.s>0.45).map(x=>x.p));
}
async function hablar(texto){
  if(CONFIG.TTS_SERVIDOR && !DEMO){
    try{
      const blob=await pedir('tts',{metodo:'POST', json:{texto}, servicio:'voz', binario:true});
      const url=URL.createObjectURL(blob), au=new Audio(url);
      au.onended=()=>URL.revokeObjectURL(url); await au.play(); return;
    }catch(e){ console.warn(e); }
  }
  if('speechSynthesis' in window){ const u=new SpeechSynthesisUtterance(texto); u.lang='es-CO'; speechSynthesis.speak(u); }
}

const VOZ={grabando:false, rec:null, chunks:[], stream:null, sr:null, texto:''};
async function empezarVoz(){
  if(VOZ.grabando) return;
  VOZ.grabando=true; S.escuchando=true; $('#btnMic').classList.add('activo'); vozEstado('Te escucho…');
  try{
    if(CONFIG.VOZ_SERVIDOR && !DEMO && window.MediaRecorder){
      VOZ.stream=VOZ.stream||await navigator.mediaDevices.getUserMedia({audio:true});
      VOZ.chunks=[]; VOZ.rec=new MediaRecorder(VOZ.stream);
      VOZ.rec.ondataavailable=e=>{ if(e.data.size) VOZ.chunks.push(e.data); };
      VOZ.rec.start();
    } else if(SR){
      VOZ.texto=''; VOZ.sr=new SR(); VOZ.sr.lang='es-CO'; VOZ.sr.interimResults=true; VOZ.sr.continuous=true;
      VOZ.sr.onresult=e=>{ VOZ.texto=[...e.results].map(r=>r[0].transcript).join(' '); vozEstado(`«${VOZ.texto}»`); };
      VOZ.sr.start();
    } else throw new Error('sin-voz');
  }catch(e){
    VOZ.grabando=false; S.escuchando=false; $('#btnMic').classList.remove('activo'); vozEstado();
    aviso(e.message==='sin-voz' ? 'Este navegador no reconoce voz. Escribe / y el nombre, o configura ElevenLabs en el asistente.' : 'No pude usar el micrófono: '+e.message);
  }
}
async function terminarVoz(){
  if(!VOZ.grabando) return;
  VOZ.grabando=false; $('#btnMic').classList.remove('activo');
  if(VOZ.rec){
    const rec=VOZ.rec; VOZ.rec=null;
    const blob=await new Promise(res=>{ rec.onstop=()=>res(new Blob(VOZ.chunks,{type:rec.mimeType||'audio/webm'})); rec.stop(); });
    if(blob.size<1500){ S.escuchando=false; vozEstado(); return; }
    vozEstado('Transcribiendo…');
    try{
      const fd=new FormData(); fd.append('audio',blob,'voz.webm');
      const j=await pedir('stt',{metodo:'POST', cuerpo:fd, servicio:'voz'});
      buscar(j.texto,'voz');
    }catch(e){ S.escuchando=false; vozEstado(); aviso('No pude transcribir el audio: '+e.message); }
  } else if(VOZ.sr){
    const sr=VOZ.sr; VOZ.sr=null;
    await new Promise(res=>{ sr.onend=res; try{ sr.stop(); }catch(_){ res(); } setTimeout(res,1500); });
    if(VOZ.texto.trim()) buscar(VOZ.texto,'voz'); else { S.escuchando=false; vozEstado(); }
  }
}

/* =====================================================================
   CÁMARA (face-api.js, todo en el navegador)
   ===================================================================== */
const VIS={ listo:false, activo:false, video:$('#video'), hud:$('#hud'), caras:[], vistos:[], conteo:{female:0, male:0}, bienvenidas:0, onda:[], estables:new Map(), vincular:null };
const COL_A='#ff9be8', COL_B='#7cf7ff';
function camEstado(t){ $('#camEstado').textContent=t; }
async function iniciarCamara(){
  if(VIS.activo) return;
  if(typeof faceapi==='undefined'){ camEstado('No se pudo cargar la librería de rostros'); return; }
  try{
    camEstado('Encendiendo cámara…');
    const st=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    VIS.video.srcObject=st; await VIS.video.play();
    camEstado('Cargando modelos…');
    if(!(await faceapi.tf.setBackend('webgl'))) await faceapi.tf.setBackend('cpu');
    await faceapi.tf.ready();
    const U=CONFIG.MODELOS_ROSTRO;
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(U), faceapi.nets.faceLandmark68Net.loadFromUri(U), faceapi.nets.faceRecognitionNet.loadFromUri(U), faceapi.nets.ageGenderNet.loadFromUri(U)]);
    VIS.listo=VIS.activo=true; camEstado('');
    HUD.evento('texto',{verbo:'cámara', texto:'modelos de rostro listos', color:'#4de3ff'});
    bucleVision();
    if(CONFIG.FOTO_URL) precargarFotos();
  }catch(e){ camEstado(e && e.name==='NotAllowedError' ? 'Permiso de cámara denegado' : 'Cámara no disponible'); console.warn(e); }
}
async function bucleVision(){
  if(!VIS.activo) return;
  try{
    if(VIS.video.readyState>=2){
      const opts=new faceapi.TinyFaceDetectorOptions({inputSize:320, scoreThreshold:0.5});
      const res=await faceapi.detectAllFaces(VIS.video,opts).withFaceLandmarks().withFaceDescriptors().withAgeAndGender();
      procesarCaras(res); dibujarHUDCamara();
    }
  }catch(e){ console.warn(e); }
  setTimeout(bucleVision,140);
}
function mejorCoincidencia(desc){
  let id=null, dist=9;
  for(const [pid,lista] of S.rostros) for(const ref of lista){ const d=faceapi.euclideanDistance(desc,ref); if(d<dist){ dist=d; id=pid; } }
  return {id,dist};
}
function procesarCaras(res){
  VIS.caras=res.map(r=>({r,...mejorCoincidencia(r.descriptor)}));
  for(const c of VIS.caras){
    const box=c.r.detection.box;
    if(c.r.detection.score<0.6 || box.width<48) continue;
    let min=9;
    for(const v of VIS.vistos){ const d=faceapi.euclideanDistance(c.r.descriptor,v); if(d<min) min=d; if(min<0.5) break; }
    if(min>0.55){
      VIS.vistos.push(c.r.descriptor); if(VIS.vistos.length>3000) VIS.vistos.shift();
      if(c.r.genderProbability>0.7) VIS.conteo[c.r.gender]=(VIS.conteo[c.r.gender]||0)+1;
      HUD.evento('rostro',{score:c.r.detection.score});
    }
  }
  VIS.onda.push(res.length ? Math.max(...res.map(r=>r.detection.score)) : 0);
  if(VIS.onda.length>140) VIS.onda.shift();
  if(VIS.vincular && res.length===1){
    VIS.vincular.muestras.push(res[0].descriptor);
    if(VIS.vincular.muestras.length>=5){
      const {p,muestras}=VIS.vincular; VIS.vincular=null;
      S.rostros.set(p.id,muestras);
      const btn=$('#tVincular'); btn.textContent='Rostro vinculado'; btn.disabled=true;
      S.saludados.set(p.id,performance.now());
      HUD.evento('texto',{verbo:'vincula', texto:`rostro de ${corto(p.nombre)}`, color:'#ffd500'});
    }
  }
  const ahora=performance.now(), presentes=new Set();
  for(const c of VIS.caras){
    if(c.id==null || c.dist>=CONFIG.UMBRAL_ROSTRO) continue;
    presentes.add(c.id);
    const n=(VIS.estables.get(c.id)||0)+1; VIS.estables.set(c.id,n);
    if(n>=3 && S.modo!=='foco' && ahora-(S.saludados.get(c.id)||-1e9)>90000){
      const p=S.personas.get(c.id); if(!p) continue;
      S.saludados.set(c.id,ahora); VIS.bienvenidas++;
      const saludo=CONFIG.SALUDO.replace('{nombre}',nombreHablado(p));
      enfocar(p,'camara'); hablar(saludo);
      HUD.evento('bienvenida',{p, texto:saludo});
    }
  }
  for(const id of [...VIS.estables.keys()]) if(!presentes.has(id)) VIS.estables.delete(id);
}
const LINEAS_ROSTRO=[[0,16],[17,21],[22,26],[27,30],[31,35],[36,41,true],[42,47,true],[48,59,true]];
function dibujarHUDCamara(){
  const cv=VIS.hud, v=VIS.video, dpr=window.devicePixelRatio||1;
  const w=cv.clientWidth, h=cv.clientHeight;
  if(cv.width!==Math.round(w*dpr)){ cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); }
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  if(!v.videoWidth) return;
  const esc=Math.max(w/v.videoWidth,h/v.videoHeight), ox=(w-v.videoWidth*esc)/2, oy=(h-v.videoHeight*esc)/2;
  const X=x=>w-(x*esc+ox), Y=y=>y*esc+oy;
  ctx.font='500 9.5px "JetBrains Mono", monospace'; ctx.lineWidth=1;
  VIS.caras.forEach((c,i)=>{
    const b=c.r.detection.box, conocido=c.id!=null && c.dist<CONFIG.UMBRAL_ROSTRO;
    const col=conocido ? '#ffd500' : (c.r.gender==='female'?COL_A:COL_B);
    const x0=X(b.x+b.width), x1=X(b.x), y0=Y(b.y), y1=Y(b.y+b.height), k=Math.min(10,(x1-x0)/4);
    ctx.strokeStyle=col; ctx.globalAlpha=0.95; ctx.beginPath();
    for(const [px,py,sx,sy] of [[x0,y0,1,1],[x1,y0,-1,1],[x0,y1,1,-1],[x1,y1,-1,-1]]){ ctx.moveTo(px,py+sy*k); ctx.lineTo(px,py); ctx.lineTo(px+sx*k,py); }
    ctx.stroke();
    const pts=c.r.landmarks.positions;
    ctx.globalAlpha=0.6; ctx.beginPath();
    for(const [a,z,cerrar] of LINEAS_ROSTRO){ ctx.moveTo(X(pts[a].x),Y(pts[a].y)); for(let j=a+1;j<=z;j++) ctx.lineTo(X(pts[j].x),Y(pts[j].y)); if(cerrar) ctx.lineTo(X(pts[a].x),Y(pts[a].y)); }
    ctx.stroke();
    ctx.globalAlpha=0.9; ctx.fillStyle=col;
    for(const j of [30,36,45,48,54,8]){ ctx.beginPath(); ctx.arc(X(pts[j].x),Y(pts[j].y),1.6,0,Math.PI*2); ctx.fill(); }
    let etq=`rostro ${i+1}  ${(c.r.detection.score*100).toFixed(0)}%`;
    if(conocido) etq=corto(S.personas.get(c.id)?.nombre||'');
    else if(c.id!=null) etq+=`  ~${corto(S.personas.get(c.id)?.nombre||'')} ${Math.max(0,(1-c.dist)*100).toFixed(0)}%`;
    ctx.globalAlpha=1; ctx.fillStyle=col; ctx.fillText(etq,x0,Math.max(10,y0-4));
  });
  ctx.globalAlpha=1;
}
async function precargarFotos(){
  for(const p of S.lista){
    if(!VIS.activo || S.rostros.has(p.id) || !p.carnet) continue;
    try{
      const img=await faceapi.fetchImage(CONFIG.FOTO_URL.replace('{carnet}',encodeURIComponent(p.carnet)).replace('{id}',p.id));
      const r=await faceapi.detectSingleFace(img,new faceapi.TinyFaceDetectorOptions({inputSize:416})).withFaceLandmarks().withFaceDescriptor();
      if(r) S.rostros.set(p.id,[r.descriptor]);
    }catch(_){}
  }
}

/* =====================================================================
   TECLADO Y BOTONES
   ===================================================================== */
const escribiendo=()=>['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
function abrirBuscador(){ $('#buscador').hidden=false; $('#buscadorInput').value=''; $('#buscadorInput').focus(); }
function cerrarBuscador(){ $('#buscador').hidden=true; $('#buscadorInput').blur(); }
window.addEventListener('keydown',e=>{
  if(!$('#inicio').hidden) return;
  if(e.code==='Space' && !escribiendo()){ e.preventDefault(); if(!e.repeat) empezarVoz(); }
  else if(e.key==='/' && !escribiendo()){ e.preventDefault(); abrirBuscador(); }
  else if(e.key==='Escape'){ cerrarBuscador(); if(S.foco){ clearTimeout(S.focoTimer); soltarFoco(); } }
});
window.addEventListener('keyup',e=>{ if(e.code==='Space' && !escribiendo()){ e.preventDefault(); terminarVoz(); } });
$('#buscador').addEventListener('submit',e=>{ e.preventDefault(); const v=$('#buscadorInput').value; cerrarBuscador(); buscar(v,'texto'); });
$('#buscadorInput').addEventListener('keydown',e=>{ if(e.key==='Escape') cerrarBuscador(); });
$('#buscadorInput').addEventListener('blur',()=>{ if(!$('#buscadorInput').value.trim()) $('#buscador').hidden=true; });
$('#btnBuscar').addEventListener('click',()=>{ if($('#buscador').hidden) abrirBuscador(); else cerrarBuscador(); });
const mic=$('#btnMic');
mic.addEventListener('pointerdown',e=>{ e.preventDefault(); empezarVoz(); });
mic.addEventListener('pointerup',terminarVoz);
mic.addEventListener('pointerleave',()=>{ if(VOZ.grabando) terminarVoz(); });
mic.addEventListener('pointercancel',()=>{ if(VOZ.grabando) terminarVoz(); });
mic.addEventListener('contextmenu',e=>e.preventDefault());
$('#tVincular').onclick=()=>{
  if(!S.foco) return;
  if(VIS.caras.length!==1){ aviso('Para vincular el rostro debe haber una sola persona frente a la cámara.'); return; }
  VIS.vincular={p:S.foco.p, muestras:[]};
  $('#tVincular').textContent='Mira a la cámara…'; $('#tVincular').disabled=true;
  clearTimeout(S.focoTimer); S.focoTimer=setTimeout(soltarFoco,CONFIG.FOCO_MS);
};
$('#btnIniciar').onclick=()=>{
  $('#inicio').hidden=true;
  if('speechSynthesis' in window) speechSynthesis.getVoices();
  if(CONFIG.CAMARA) iniciarCamara();
};

/* =====================================================================
   DATOS DE DEMOSTRACIÓN (index.php?demo=1)
   ===================================================================== */
function datosDemo(){
  const nombres=['Ana','Luis','Carmen','Jorge','Diana','Andrés','Paola','Camilo','Lucía','Mateo','Sofía','Felipe','Daniela','Óscar','Valentina','Julián'];
  const apellidos=['Rosero','Burbano','Guerrero','Delgado','Pantoja','Muñoz','Benavides','Chaves','Insuasty','Córdoba','Villota','Narváez','Erazo','Cabrera'];
  const munis=['Pasto','Pasto','Pasto','Ipiales','Tumaco','Túquerres','La Unión','Sandoná','Samaniego','','',''];
  const ents=['Universidad de Nariño','Gobernación de Nariño','SENA','Alcaldía de Pasto','Universidad Mariana','Independiente','Cámara de Comercio de Pasto','IDSN','Fundación Semilla Sur','Empopasto','CEDENAR','Universidad CESMAG','Hospital Departamental',''];
  const perfiles=[{clave:'participante',nombre:'Participante / Asistente',total:0},{clave:'expositor',nombre:'Expositor',total:0},{clave:'prensa',nombre:'Prensa y comunicaciones',total:0},{clave:'rueda_de_negocios',nombre:'Rueda de negocios',total:0}];
  const personas=[]; let id=1;
  const pick=a=>a[(Math.random()*a.length)|0];
  const mk=perfil=>({id:id++, nombre:`${pick(nombres)} ${pick(nombres)} ${pick(apellidos)} ${pick(apellidos)}`, perfil:{clave:perfil}, entidad:pick(ents), municipio:pick(munis), carnet:'STIC-2026-'+String(id).padStart(6,'0'), ingresos:0});
  for(let i=0;i<360;i++) personas.push(mk('participante'));
  for(let i=0;i<10;i++) personas.push(mk('prensa'));
  for(let i=0;i<12;i++) personas.push(mk('rueda_de_negocios'));
  for(let i=0;i<8;i++){ const e=mk('expositor'); e.propuesta={titulo:'La IA al servicio del territorio '+(i+1), agenda:{dia:1+(i>4), fecha:i>4?'2026-11-06':'2026-11-05', hora:`${10+i}:00`, salon:''}, duracion_min:20}; e.orden=i; personas.push(e); }
  return Promise.resolve({evento:{nombre:'Cumbre Tecnológica IA Nariño (demostración)'}, perfiles, personas});
}

/* =====================================================================
   ARRANQUE Y BUCLE PRINCIPAL
   ===================================================================== */
async function arrancar(){
  try{
    const d=await cargarDatos();
    integrar(d); construirArbol();
    S.cargado=true; estado('Organiza los registros por perfil, municipio y entidad','inicio');
    HUD.evento('texto',{verbo:'sync', texto:`${fmt(S.personas.size)} registros recibidos`, color:'#ffd500'});
  }catch(e){
    console.error(e);
    estado('No pudo leer los registros. Reintenta en 30 s.','error');
    aviso('No se pudieron leer los registros: '+e.message+'. Revise la API en el asistente (instalar.php).');
    setTimeout(arrancar,30000); return;
  }
  S.proximoRefresco=Date.now()+CONFIG.REFRESCO_MS;
  setInterval(async()=>{
    S.proximoRefresco=Date.now()+CONFIG.REFRESCO_MS;
    if(DEMO) return;
    try{
      const nuevos=integrar(await cargarDatos());
      if(nuevos){ construirArbol(); HUD.evento('nuevos',{n:nuevos}); S.estadoClave=''; }
    }catch(e){ console.warn('Refresco fallido',e); }
  },CONFIG.REFRESCO_MS);
}

crearPulpo(); HUD.iniciar(); ajustar(); vozEstado();
let tPrev=performance.now();
function cuadro(now){
  requestAnimationFrame(cuadro);
  const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; const t=now/1000;
  grupo.rotation.x=Math.sin(t*0.07)*0.09; grupo.rotation.y=Math.cos(t*0.05)*0.11;
  programar(now);
  actualizarPulpo(dt,t);
  for(const b of octo.brazos) actualizarBrazo(b,t);
  actualizarPuntas(dt);
  actualizarNodos(dt,t);
  actualizarPool(t);
  scene.updateMatrixWorld();
  actualizarEtiquetas();
  posicionarTarjeta();
  renderer.render(scene,camera);
  HUD.cuadro(now,dt);
}
requestAnimationFrame(cuadro);
arrancar();
