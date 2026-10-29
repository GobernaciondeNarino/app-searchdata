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
  PASE: PC.pase || '',
  ROSTROS_API: PC.rostros_api !== false,
  JEV_BUSQUEDA: !!PC.jev_busqueda,
  JEV_CAMARA: !!PC.jev_camara
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
const R = 100, SEG = 8, M = 34, NV = 16, NE = 22, NB = NV + NE;   // NV ventosas y NE puntos de estela por tentáculo
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
function canonSimple(raw,vacio){ const n=norm(raw); return n ? {key:n, label:bonito(raw)} : {key:'no-reporta', label:vacio}; }
function canonGenero(raw){
  const n=norm(raw);
  if(!n) return {key:'no-reporta', label:'Género no reportado'};
  if(/^(f|femenino|mujer|female)$/.test(n)) return {key:'mujer', label:'Mujeres'};
  if(/^(m|masculino|hombre|male)$/.test(n)) return {key:'hombre', label:'Hombres'};
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
const NIVELES_BASE = ['perfil','municipio','entidad'];
const S = {
  personas:new Map(), lista:[], perfiles:[], evento:null, charlas:[],
  nodos:[], nodoPorClave:new Map(), links:[], etiquetas:[], perfilNodos:[], muniNodos:[], hubs1:[], hubs2:[],
  niveles:NIVELES_BASE.slice(), primeraVez:true,
  colocados:0, verificaciones:0,
  pendientes:[], sectorNodo:null, sectorDesde:0, tickSector:0, frente:null, tour:null,
  modo:'trabajo', foco:null, focoTimer:null, escuchando:false, cargado:false, arranque:Infinity,
  rostros:new Map(), negativos:new Map(), saludados:new Map(), moviendo:0, ultimoVigia:0, proximoRefresco:0, estadoClave:''
};

/* =====================================================================
   ESCENA THREE.JS: la red es una esfera que gira hacia donde trabaja el pulpo
   ===================================================================== */
const renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
$('#escena').appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,1,5000);
const base=new THREE.Group(), grupo=new THREE.Group(), esfera=new THREE.Group();
scene.add(base); base.add(grupo); grupo.add(esfera);
const uEsc={value:1}, uEscEsfera={value:1}, uCentro={value:-600}, uRadio={value:R};
/** La esfera se agranda escalando su grupo; el pulpo conserva su tamaño en pantalla. */
const ESC={v:1};
const RE=()=>R*ESC.v;
S.frente=new THREE.Vector3(0,0.15,1).normalize();

/** Suma luz sin escribir alfa: el brillo se compone sobre el fondo de la página. */
function aditivo(m){
  m.blending=THREE.CustomBlending; m.blendEquation=THREE.AddEquation;
  m.blendSrc=THREE.OneFactor; m.blendDst=THREE.OneFactor;
  m.blendSrcAlpha=THREE.ZeroFactor; m.blendDstAlpha=THREE.OneFactor;
  m.transparent=true; m.depthWrite=false; return m;
}
// uFondo=1: los puntos de la cara oculta de la esfera se ven más tenues y pequeños.
const VS_PUNTOS=`
  attribute vec3 aColor; attribute float aSize; attribute float aBrillo;
  uniform float uPx; uniform float uEsc; uniform float uCrece; uniform float uFondo; uniform float uCentro; uniform float uRadio;
  varying vec3 vColor; varying float vB;
  void main(){
    vec4 mv=modelViewMatrix*vec4(position,1.0);
    float f=clamp(0.5+0.5*(mv.z-uCentro)/uRadio,0.0,1.0);
    vColor=aColor; vB=aBrillo*mix(1.0,mix(0.16,1.0,f*f),uFondo);
    gl_PointSize=aSize*uPx*uEsc*mix(1.0,0.75+0.45*min(aBrillo,1.6),uCrece)*mix(1.0,0.55+0.45*f,uFondo);
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
function materialPuntos(frag=FS_PUNTO, crece=1, fondo=0, escala=uEsc){
  return aditivo(new THREE.ShaderMaterial({
    uniforms:{ uPx:{value:renderer.getPixelRatio()}, uEsc:escala, uCrece:{value:crece}, uFondo:{value:fondo}, uCentro, uRadio },
    vertexShader:VS_PUNTOS, fragmentShader:frag
  }));
}
const matPuntos=materialPuntos(FS_PUNTO,1,1,uEscEsfera), matPool=materialPuntos(FS_PUNTO,1,0.4,uEscEsfera);   // la nube se apaga poco al fondo
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

/** Meridianos y paralelos tenues (giran con la esfera) y el contorno (fijo, de frente). */
function crearGlobo(){
  const pts=[], seg=96;
  const circulo=(f)=>{ for(let i=0;i<seg;i++){ const a=i/seg*Math.PI*2, b=(i+1)/seg*Math.PI*2; pts.push(f(a),f(b)); } };
  for(const lat of [-0.75,0,0.75]){ const y=Math.sin(lat)*R*1.002, r=Math.cos(lat)*R*1.002; circulo(a=>new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r)); }
  for(const lon of [0,Math.PI/3,Math.PI*2/3]){ circulo(a=>new THREE.Vector3(Math.cos(a)*Math.cos(lon)*R*1.002, Math.sin(a)*R*1.002, Math.cos(a)*Math.sin(lon)*R*1.002)); }
  LIN.globo=aditivo(new THREE.LineBasicMaterial({color:LIN.colGlobo.clone()}));
  const globo=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), LIN.globo);
  globo.frustumCulled=false; esfera.add(globo);
  const c=[]; for(let i=0;i<=128;i++){ const a=i/128*Math.PI*2; c.push(new THREE.Vector3(Math.cos(a)*R*1.03,Math.sin(a)*R*1.03,0)); }
  LIN.contorno=aditivo(new THREE.LineBasicMaterial({color:LIN.colContorno.clone()}));
  CONTORNO=new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), LIN.contorno);
  CONTORNO.frustumCulled=false; grupo.add(CONTORNO);
}
let CONTORNO=null;
/**
 * Líneas de la esfera (meridianos, contorno y enlaces de la red): se apagan
 * mientras el pulpo organiza y vuelven cuando está en reposo (antes de empezar
 * y cuando ya organizó todo). Al enfocar a alguien solo se ve su ruta.
 */
const LIN={v:1, meta:1, quedan:true, tick:0, globo:null, contorno:null, colGlobo:new THREE.Color('#0b2a1f'), colContorno:new THREE.Color('#0f3b2b')};
function enReposo(now){
  if(now-LIN.tick>300){ LIN.tick=now; LIN.quedan=S.lista.some(p=>!p.placed); }
  return S.modo==='trabajo' && (!S.cargado || now<S.arranque || !LIN.quedan);
}
function actualizarLineas(now){
  const dt=Math.min(1,(now-(LIN.prev||now))/1000); LIN.prev=now;   // tiempo real: el desvanecido dura lo mismo aunque baje la tasa de cuadros
  LIN.meta=enReposo(now) ? 1 : 0;
  LIN.v+=(LIN.meta-LIN.v)*Math.min(1,dt*(LIN.meta?1.2:2.4));
  if(LIN.globo){ LIN.globo.color.copy(LIN.colGlobo).multiplyScalar(LIN.v); LIN.contorno.color.copy(LIN.colContorno).multiplyScalar(LIN.v); }
}

function ajustar(){
  W=window.innerWidth; H=window.innerHeight;
  renderer.setSize(W,H); camera.aspect=W/H;
  const statsH=$('#stats').offsetHeight+22, topH=68;
  // El encuadre (y con él el tamaño del pulpo) se calcula para el área libre entre la barra y las estadísticas.
  const disp=H-statsH-topH;
  const fitPx=Math.max(220,Math.min(W*0.92,disp));
  const wpp=(2*R*1.3)/fitPx;
  const dist=wpp*H/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  camera.position.set(0,0,dist); camera.near=dist*0.15; camera.far=dist*3;
  camera.updateProjectionMatrix();
  // La esfera usa todo el alto bajo la barra: las estadísticas son semitransparentes y quedan encima.
  const radioPx=Math.min(W*0.46,(H-topH-8)/2);
  ESC.v=Math.max(1,Math.min(1.9,radioPx*wpp/(R*1.04)));
  esfera.scale.setScalar(ESC.v); if(CONTORNO) CONTORNO.scale.setScalar(ESC.v);
  base.position.y=ESC.v>1.02 ? -(topH/2-4)*wpp : ((statsH-topH)/2)*wpp;
  uEsc.value=fitPx/760; uEscEsfera.value=fitPx/760*Math.sqrt(ESC.v); uCentro.value=-dist; uRadio.value=RE();
  ajustarBinario(H/2-base.position.y/wpp, RE()/wpp*1.04, topH, H-statsH+22);
}
window.addEventListener('resize',()=>{ ajustar(); medirEtiquetas(); });

/* ---------------- Giro de la esfera ---------------- */
const ROT={ meta:new THREE.Quaternion(), libre:true, vel:1 };
const EJE_Y=new THREE.Vector3(0,1,0), EJE_Z=new THREE.Vector3(0,0,1);
const _e=new THREE.Euler(), _q=new THREE.Quaternion(), _q2=new THREE.Quaternion();
/** Gira la esfera para que la dirección `dir` (coordenadas de la esfera) quede mirando hacia `frente`. */
function orientar(dir, frente, vel=1.2){
  const lat=Math.asin(Math.max(-1,Math.min(1,dir.y))), lon=Math.atan2(dir.x,dir.z);
  _q.setFromEuler(_e.set(lat,-lon,0,'XYZ'));
  _q2.setFromUnitVectors(EJE_Z,frente);
  ROT.meta.multiplyQuaternions(_q2,_q); ROT.libre=false; ROT.vel=vel;
}
function actualizarRotacion(dt){
  if(ROT.libre){ _q.setFromAxisAngle(EJE_Y,dt*0.1); ROT.meta.premultiply(_q); ROT.vel=1.5; }
  esfera.quaternion.slerp(ROT.meta,Math.min(1,dt*ROT.vel));
  esfera.updateMatrix();
}
/** Posición de un nodo en el espacio del pulpo (la esfera ya girada). */
function enGrupo(n,out){ return out.copy(n.pos).applyQuaternion(esfera.quaternion).multiplyScalar(ESC.v); }
/** 1 si el nodo mira de frente, -1 si queda detrás de la esfera. */
const _f=new THREE.Vector3();
function frenteDe(n){ const l=n.pos.length()||1; return enGrupo(n,_f).z/(l*ESC.v); }

/* =====================================================================
   PULPO LINEAL CON PUNTAS QUE DESTELLAN
   ===================================================================== */
/* El pulpo: una cabeza circular de contorno, un ojo rosado unido por hilos al
   núcleo y ocho tentáculos finos con ventosas de puntos y una estela punteada.
   Los ocho trabajan: se estiran hasta los datos cruzando el interior de la esfera. */
const COL_LINEA=new THREE.Color('#3aa893'), COL_LINEA_ON=new THREE.Color('#7affe4');
const COL_DORADO=new THREE.Color('#ffd500'), COL_VENTOSA=new THREE.Color('#5ff7e0');
/** El pulpo anda sobre la superficie de la esfera. */
const radioPulpo=()=>RE()*1.03;
const octo={ x:0, y:0, z:R*1.03, rot:0, act:0, w:9.5, g:new THREE.Group(), mat:null, matRosa:null,
  brazos:[], brillo:null, rosas:null, puntas:null, anillos:null, cuentas:null };
const _c=new THREE.Color(), _c2=new THREE.Color();
const OJO=new THREE.Vector3();

function crearPulpo(){
  const w=octo.w, rc=2.1*w;   // radio de la cabeza
  octo.mat=aditivo(new THREE.LineBasicMaterial({color:COL_LINEA.clone()}));
  octo.matRosa=aditivo(new THREE.LineBasicMaterial({color:new THREE.Color('#c22f7f')}));
  const circulo=(cx,cy,r,n)=>{ const p=[]; for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2; p.push(new THREE.Vector3(cx+Math.cos(a)*r,cy+Math.sin(a)*r,0)); } return p; };
  // la cabeza queda del lado opuesto a los brazos que trabajan (+y local)
  octo.g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circulo(0,rc,rc,120)),octo.mat));
  octo.g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circulo(0,0,0.42*w,48)),octo.mat));
  // ojo rosado dentro de la cabeza, unido al núcleo por tres hilos curvos
  OJO.set(-0.55*w,rc*1.05,0);
  for(const d of [-0.9,0,0.9]){
    const pts=[]; for(let i=0;i<=20;i++){ const t=i/20, u=1-t, cx=OJO.x*0.4+d*w, cy=OJO.y*0.55;
      pts.push(new THREE.Vector3(u*u*OJO.x+2*u*t*cx, u*u*OJO.y+2*u*t*cy, 0)); }
    octo.g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),octo.matRosa));
  }
  const gr=geoPuntos(2,'#ff3fa4');
  gr.attributes.position.setXYZ(0,OJO.x,OJO.y,0.2); gr.attributes.aSize.setX(0,30);
  gr.attributes.position.setXYZ(1,0,0,0.2); gr.attributes.aSize.setX(1,15);
  octo.rosas=new THREE.Points(gr,materialPuntos(FS_PUNTO,0)); octo.rosas.frustumCulled=false; octo.g.add(octo.rosas);
  const gb=geoPuntos(1,'#3dffa0');
  gb.attributes.position.setXYZ(0,0,0,-1); gb.attributes.aSize.setX(0,120);
  octo.brillo=new THREE.Points(gb,materialPuntos(FS_PUNTO,0)); octo.brillo.frustumCulled=false;
  octo.g.add(octo.brillo);
  grupo.add(octo.g);
  for(let k=0;k<8;k++) octo.brazos.push(crearBrazo(k));
  // puntas rosadas, anillos de destello, ventosas y estela de puntos de cada tentáculo
  octo.puntas=new THREE.Points(geoPuntos(8,'#ff3fa4'),materialPuntos(FS_PUNTO,0));
  octo.anillos=new THREE.Points(geoPuntos(8,'#ff6fc0'),materialPuntos(FS_ANILLO,0));
  octo.cuentas=new THREE.Points(geoPuntos(8*NB,null),materialPuntos(FS_PUNTO,0));
  for(const o of [octo.cuentas,octo.anillos,octo.puntas]){ o.frustumCulled=false; o.renderOrder=6; grupo.add(o); }
}
function crearBrazo(k){
  const a=Math.PI*1.02+(k+0.5)/8*Math.PI*0.96;   // abanico bajo el núcleo, del lado opuesto a la cabeza
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(M*2*3),3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(M*2*3),3).setUsage(THREE.DynamicDrawUsage));
  const linea=new THREE.Line(geo,matBrazo); linea.frustumCulled=false; grupo.add(linea);
  return { k, a, bx:Math.cos(a)*0.42*octo.w, by:Math.sin(a)*0.42*octo.w,
    reach:0, u:0, target:new THREE.Vector3(), desde:new THREE.Vector3(), tip:new THREE.Vector3(),
    estado:'libre', etapa:'libre', persona:null, tarea:null, token:0, proxima:0, fase:Math.random()*6.28,
    lado:k<4?1:-1, largo:azar(4.8,6.6), curva:(k<4?-1:1)*azar(0.45,0.85),   // se abren hacia afuera y vuelven en S
    geo, tipColor:new THREE.Color('#62f5d6'), flare:0, anillo:0, brilloBrazo:0, ancla:null, tmp:new THREE.Vector3() };
}
/** La punta llega a un dato: destello y anillo expansivo. */
function destello(b, fuerza=1){ b.flare=Math.max(b.flare,fuerza); b.anillo=1; }

/** Altura del pulpo sobre la esfera para una posición (x, y) de la pantalla. */
function alturaPulpo(x,y){ const r=radioPulpo(); return Math.sqrt(Math.max(r*r*0.12, r*r-x*x-y*y)); }
/** Factor para que el pulpo se vea siempre del mismo tamaño, aunque esté más cerca de la cámara. */
function escalaPulpo(){ const d=camera.position.z; return Math.max(0.4,(d-octo.z)/(d-R*1.12)); }
function actualizarPulpo(dt,t){
  let activos=0, mx=0, my=0;
  for(const b of octo.brazos){ if(b.reach>0.15){ activos++; mx+=b.target.x-octo.x; my+=b.target.y-octo.y; } }
  const meta=Math.min(1, activos/8*0.75 + (S.foco?1:0) + (S.escuchando?0.55:0));
  octo.act+=(meta-octo.act)*Math.min(1,dt*2.5);
  // sin trabajo, la cabeza mira hacia afuera de la esfera; trabajando, los brazos apuntan a los datos
  let rotObj=Math.atan2(octo.y,octo.x)-Math.PI/2+Math.sin(t*0.4)*0.2;
  if(activos) rotObj=Math.atan2(-my,-mx)-Math.PI/2;
  let d=rotObj-octo.rot; d=Math.atan2(Math.sin(d),Math.cos(d));
  octo.rot+=d*Math.min(1,dt*2.2);
  octo.z=alturaPulpo(octo.x,octo.y);
  const resp=Math.sin(t*(S.escuchando?4:2.2));
  octo.g.position.set(octo.x,octo.y,octo.z);
  octo.g.rotation.z=octo.rot;
  octo.g.scale.setScalar((1+0.035*resp)*escalaPulpo());
  octo.mat.color.lerpColors(COL_LINEA,COL_LINEA_ON,octo.act);
  const rb=octo.rosas.geometry.attributes.aBrillo, ojo=(S.escuchando||S.foco)?1.6:1.1;
  rb.setX(0,ojo+0.25*Math.sin(t*3)); rb.setX(1,0.9+0.6*octo.act); rb.needsUpdate=true;
  const ab=octo.brillo.geometry.attributes.aBrillo; ab.setX(0,0.04+octo.act*0.16); ab.needsUpdate=true;
}

/*
 * Tentáculos en 3D: en reposo cuelgan en curva de S desde el núcleo, recostados
 * sobre la superficie de la esfera (nunca por fuera de su silueta); al trabajar,
 * cada uno es una curva de Bézier cúbica que entra a la esfera, pasa cerca del
 * centro y sube hasta el dato, aunque esté en el otro extremo. La curva nunca
 * sale del radio de la esfera, y su brillo baja con la profundidad.
 */
const IDLE3=Array.from({length:M},()=>new THREE.Vector3()), CEN3=Array.from({length:M},()=>new THREE.Vector3());
const PROF=new Float32Array(M);
const _b=new THREE.Vector3(), _c1=new THREE.Vector3(), _c3=new THREE.Vector3(), _q3=new THREE.Vector3(), _per=new THREE.Vector3();
const _sv=new THREE.Vector3(), _sn=new THREE.Vector3();
/** Punto a una fracción `s` del tentáculo, con su normal en pantalla; devuelve la profundidad. */
function muestraBrazo(s,out,nrm){
  const f=Math.min(M-1.001,Math.max(0,s*(M-1))), i=Math.floor(f), u=f-i, A=CEN3[i], B=CEN3[i+1];
  out.lerpVectors(A,B,u);
  const tx=B.x-A.x, ty=B.y-A.y, l=Math.hypot(tx,ty)||1;
  nrm.set(-ty/l,tx/l,0);
  return PROF[i]+(PROF[i+1]-PROF[i])*u;
}
/** Mantiene un punto dentro de la silueta de la esfera (radio r en pantalla). */
function dentroSilueta(v,r){ const q=v.x*v.x+v.y*v.y, m=r*r*0.97; if(q>m){ const f=Math.sqrt(m/q); v.x*=f; v.y*=f; } return v; }
function actualizarBrazo(b,t){
  if(b.ancla){ enGrupo(b.ancla.nodo,b.target).add(b.ancla.off); }   // la esfera gira: el objetivo se mueve con ella
  const k=escalaPulpo(), re=RE();
  const cr=Math.cos(octo.rot), sr=Math.sin(octo.rot);
  _b.set(octo.x+(b.bx*cr-b.by*sr)*k, octo.y+(b.bx*sr+b.by*cr)*k, octo.z);
  const dir0=b.a+octo.rot, L=octo.w*b.largo*k*(0.94+0.1*octo.act), seg=L/(M-1), vel=S.escuchando?2.8:1.2;
  const rp=radioPulpo(), rp2=rp*rp;
  let x=_b.x, y=_b.y;
  for(let i=0;i<M;i++){
    const s=i/(M-1);
    dentroSilueta(IDLE3[i].set(x,y,0),rp);
    IDLE3[i].z=i ? Math.sqrt(Math.max(0,rp2-IDLE3[i].x*IDLE3[i].x-IDLE3[i].y*IDLE3[i].y)) : _b.z;   // recostado sobre la esfera
    const phi=dir0+b.curva*Math.sin(s*Math.PI*1.25)*1.05+0.32*Math.sin(t*vel+b.fase+s*3.4)*s;   // curva en S que se mece
    x+=Math.cos(phi)*seg; y+=Math.sin(phi)*seg;
  }
  const e=b.reach, T=b.target;
  if(e>0.001){
    const dist=_b.distanceTo(T)||1;
    _per.set(-(T.y-_b.y),T.x-_b.x,0).normalize();                     // costado, para que los brazos no se encimen
    const lado=b.lado*(0.75+0.25*Math.sin(t*0.8+b.fase));
    _c1.copy(_b).multiplyScalar(0.42).addScaledVector(_per,lado*dist*0.16);   // entra hacia el centro
    _c3.copy(T).multiplyScalar(0.5).addScaledVector(_per,lado*dist*0.08);     // y sube al dato
    const amp=Math.min(3.2,dist*0.035)*k;
    for(let i=0;i<M;i++){
      const s=i/(M-1), u=1-s;
      _q3.set(0,0,0).addScaledVector(_b,u*u*u).addScaledVector(_c1,3*u*u*s).addScaledVector(_c3,3*u*s*s).addScaledVector(T,s*s*s);
      _q3.addScaledVector(_per,Math.sin(s*Math.PI*2.3-t*6+b.fase)*amp*s*(1-s)*3);
      if(s>0.06){ const l=_q3.length(), lim=re*0.985; if(l>lim) _q3.multiplyScalar(lim/l); }   // nunca fuera de la esfera
      CEN3[i].lerpVectors(IDLE3[i],_q3,e);
    }
  } else for(let i=0;i<M;i++) CEN3[i].copy(IDLE3[i]);
  b.tip.copy(CEN3[M-1]);
  for(let i=0;i<M;i++) PROF[i]=0.28+0.72*Math.min(1,Math.max(0,0.5+0.5*CEN3[i].z/re));   // 1 al frente, tenue al fondo

  const pos=b.geo.attributes.position.array, col=b.geo.attributes.color.array;
  const ancho=octo.w*0.045*k;
  const brillo=0.55+0.45*Math.max(Math.min(e,1),octo.act*0.6);
  b.brilloBrazo=brillo;
  _c.copy(octo.mat.color);
  if(b.persona) b.tipColor.copy(b.persona.node.color); else b.tipColor.copy(octo.mat.color);
  for(let i=0;i<M;i++){
    const s=i/(M-1);
    const a=CEN3[Math.max(0,i-1)], c=CEN3[Math.min(M-1,i+1)];
    let tx=c.x-a.x, ty=c.y-a.y; const l=Math.hypot(tx,ty)||1; tx/=l; ty/=l;
    const w=(ancho*Math.pow(1-s,1.15)+0.05)*(0.6+0.4*PROF[i]);
    const j=i*3, kk=(2*M-1-i)*3;
    pos[j]=CEN3[i].x-ty*w; pos[j+1]=CEN3[i].y+tx*w; pos[j+2]=CEN3[i].z;
    pos[kk]=CEN3[i].x+ty*w; pos[kk+1]=CEN3[i].y-tx*w; pos[kk+2]=CEN3[i].z;
    _c2.lerpColors(_c,b.tipColor,s*s);
    const v=brillo*(0.5+0.5*s)*(b.persona?1.25:1)*PROF[i];
    col[j]=col[kk]=_c2.r*v; col[j+1]=col[kk+1]=_c2.g*v; col[j+2]=col[kk+2]=_c2.b*v;
  }
  b.geo.attributes.position.needsUpdate=true; b.geo.attributes.color.needsUpdate=true;

  // Ventosas: una fila de puntos junto al tentáculo, grandes al medio y pequeños en
  // los extremos, con un pulso que baja hacia la punta. Estela: puntos finos que se
  // apartan del tentáculo hacia la punta (se recogen cuando trabaja).
  const cg=octo.cuentas.geometry, cp=cg.attributes.position, cc=cg.attributes.aColor, cs=cg.attributes.aSize, cb=cg.attributes.aBrillo;
  const lado=-b.lado, rs=e>0.5 ? re*0.985 : rp;
  for(let j=0;j<NV;j++){
    const s=0.14+0.8*j/(NV-1), env=Math.pow(Math.sin(Math.PI*(j+0.6)/(NV+0.2)),0.9), pf=muestraBrazo(s,_sv,_sn), idx=b.k*NB+j;
    _sv.addScaledVector(_sn,(1.3+1.8*env)*k*lado);
    if(e<0.5) dentroSilueta(_sv,rp);
    cp.setXYZ(idx,_sv.x,_sv.y,_sv.z+0.2);
    _c2.lerpColors(COL_VENTOSA,b.tipColor,s*s*e);
    cc.setXYZ(idx,_c2.r,_c2.g,_c2.b);
    cs.setX(idx,(2.4+7.2*env)*(0.55+0.45*pf));
    cb.setX(idx,brillo*(0.7+0.5*env+0.5*Math.max(0,Math.sin(t*3.4-s*9+b.fase)))*pf);
  }
  for(let j=0;j<NE;j++){
    const s=0.3+0.7*j/(NE-1), pf=muestraBrazo(s,_sv,_sn), idx=b.k*NB+NV+j;
    _sv.addScaledVector(_sn,-(2+15*Math.pow(s-0.3,1.4))*k*lado*(1-0.7*Math.min(1,e)));
    if(_sv.length()>rs) _sv.multiplyScalar(rs/_sv.length());
    if(e<0.5) dentroSilueta(_sv,rp);
    cp.setXYZ(idx,_sv.x,_sv.y,_sv.z+0.1);
    cc.setXYZ(idx,COL_VENTOSA.r,COL_VENTOSA.g,COL_VENTOSA.b);
    cs.setX(idx,(2.1+0.9*Math.sin(j*1.7))*(0.6+0.4*pf));
    cb.setX(idx,brillo*0.7*(0.6+0.4*Math.sin(t*2.2+j*0.9+b.fase))*pf);
  }
  b.prof=PROF[M-1];
}
function actualizarPuntas(dt){
  const pp=octo.puntas.geometry.attributes, ap=octo.anillos.geometry.attributes, cg=octo.cuentas.geometry.attributes;
  for(const b of octo.brazos){
    const i=b.k;
    b.flare*=Math.exp(-dt*2.6);
    b.anillo=Math.max(0,b.anillo-dt*1.5);
    const r=Math.max(0,Math.min(1,b.reach));
    pp.position.setXYZ(i,b.tip.x,b.tip.y,b.tip.z+0.5);
    const pf=b.prof??1;
    pp.aSize.setX(i,(7+5*r+26*b.flare)*(0.6+0.4*pf));
    pp.aBrillo.setX(i,(0.28+0.5*r+3.4*b.flare)*pf);
    ap.position.setXYZ(i,b.tip.x,b.tip.y,b.tip.z+0.5);
    ap.aSize.setX(i,b.anillo>0 ? 8+42*(1-b.anillo) : 0);
    ap.aBrillo.setX(i,b.anillo*b.anillo*1.4);
  }
  for(const a of [pp,ap]){ a.position.needsUpdate=a.aSize.needsUpdate=a.aBrillo.needsUpdate=true; }
  cg.position.needsUpdate=cg.aColor.needsUpdate=cg.aSize.needsUpdate=cg.aBrillo.needsUpdate=true;
}

/* =====================================================================
   DATOS (a través de api.php)
   ===================================================================== */
async function pedir(accion,{metodo='GET', cuerpo=null, json=null, servicio='eventos', binario=false, params=''}={}){
  const t0=performance.now();
  HUD.servicio(servicio,'activo');
  const opt={method:metodo, headers:{'X-Pulpo-Pase':CONFIG.PASE}, cache:'no-store', credentials:'same-origin'};
  if(json){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(json); }
  else if(cuerpo) opt.body=cuerpo;
  let r;
  try{ r=await fetch(`${CONFIG.API}?accion=${accion}${params}`,opt); }
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
    else {
      p.ingresos=Array.isArray(r.ingresos)?r.ingresos.length:(r.ingresos||0); p.foto=!!r.foto; p.completo=r.completo??null;
      if((r.sector||'')!==p.sector){ p.sector=r.sector||''; S.cambioSector=true; }   // Jev clasifica las entidades por tandas
    }
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
  return {
    id:r.id, nombre, tok:fonetica(nombre).split(' ').filter(w=>w.length>1),
    perfil:(r.perfil&&r.perfil.clave)||'participante', ent:canonEntidad(r.entidad), muni:canonMunicipio(r.municipio),
    depto:canonSimple(r.departamento,'Departamento no reportado'), dependencia:canonSimple(r.dependencia,'Dependencia no reportada'),
    genero:canonGenero(r.genero), registro:r.registro||'', completo:r.completo??null, foto:!!r.foto, sector:r.sector||'',
    carnet:r.carnet||'', ingresos:Array.isArray(r.ingresos)?r.ingresos.length:(r.ingresos||0), propuesta:r.propuesta||null, orden:r.orden??null,
    placed:false, claimed:false, carrier:null, node:null, zona:null, poolIdx:0, esferaIdx:null, color:new THREE.Color('#3dffa0'),
    nube:{r:1.2, a:Math.random()*Math.PI*2, j:0, h:0}, brazo:null,
    ph:Math.random()*6.28, actual:new THREE.Vector3()
  };
}

/* =====================================================================
   DIMENSIONES: por qué característica se organiza la red
   ===================================================================== */
const fechaCorta=new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short'});
const nombrePerfil=k=>(S.perfiles.find(x=>x.clave===k)||{}).nombre||titulo(k.replace(/_/g,' '));
const DIM={
  perfil:{nombre:'perfil', de:p=>({key:p.perfil, label:nombrePerfil(p.perfil)}),
    orden:(a,b)=>{ const o=k=>{ const i=S.perfiles.findIndex(x=>x.clave===k); return i<0?99:i; }; return o(a.key)-o(b.key); }},
  municipio:{nombre:'municipio', de:p=>p.muni},
  departamento:{nombre:'departamento', de:p=>p.depto},
  entidad:{nombre:'entidad', de:p=>p.ent},
  dependencia:{nombre:'dependencia', de:p=>p.dependencia},
  genero:{nombre:'género', de:p=>p.genero},
  registro:{nombre:'fecha de registro', de:p=>{ if(!p.registro) return {key:'no-reporta',label:'Sin fecha de registro'};
      const [y,m,d]=p.registro.split('-').map(Number); return {key:p.registro, label:fechaCorta.format(new Date(y,m-1,d))}; },
    orden:(a,b)=>a.key<b.key?-1:(a.key>b.key?1:0)},
  estado:{nombre:'estado del registro', de:p=>p.completo===null?{key:'no-reporta',label:'Estado no reportado'}:(p.completo?{key:'completo',label:'Registro completo'}:{key:'incompleto',label:'Registro incompleto'})},
  asistencia:{nombre:'asistencia', de:p=>p.ingresos>0?{key:'si',label:'Ya ingresaron'}:{key:'no',label:'Aún sin ingresar'}},
  sector:{nombre:'sector', de:p=>p.sector?{key:p.sector,label:SECTOR_ETIQUETA[p.sector]||titulo(p.sector.replace(/_/g,' '))}:{key:'no-reporta',label:'Sector sin clasificar'}}
};
/** Sectores que Jev asigna a cada entidad (ver PULPO_SECTORES en inc/funciones.php). */
const SECTOR_ETIQUETA={gobierno_departamental:'Gobierno departamental', gobierno_municipal:'Gobierno municipal', gobierno_nacional:'Gobierno nacional',
  academia:'Academia', educacion_basica:'Colegios y escuelas', salud:'Salud', empresa:'Empresas', ong:'Fundaciones y ONG', gremio:'Gremios',
  medios:'Medios', independiente:'Independientes', otro:'Otro sector'};
const dimDisponible=d=>S.lista.some(p=>DIM[d].de(p).key!=='no-reporta');
/** Colores para grupos que no son perfiles, derivados de la paleta institucional (MIV) para fondo oscuro. */
const PALETA=['#3dffa0','#ffd500','#80beff','#ff7ad9','#c6ff5a','#4de3ff','#ffa24d','#b48cff','#7fffd4','#ff8a8a','#e8fff5','#9fd9ff'];
/** Color n de la paleta; después de los 12 institucionales sigue con tonos separados por el ángulo áureo. */
function colorPaleta(i){ return i<PALETA.length ? PALETA[i] : `hsl(${Math.round((150+i*137.508)%360)},85%,62%)`; }
/** Matiz j de un color: las entidades de un municipio (y sus personas) comparten tono con variaciones de luz. */
function matiz(base,j){ return base.clone().offsetHSL(((j%3)-1)*0.025,0,((j%5)-2)*0.055); }

/* =====================================================================
   ESFERA: perfil → municipio → entidad → persona (o el orden que se pida)
   Las personas se reparten en una espiral de Fibonacci ordenada por una curva
   de Hilbert: así cada grupo ocupa una zona compacta de la esfera.
   ===================================================================== */
function nuevoNodo(tipo,clave){
  return { tipo, clave, label:'', gkey:'', nivel:0, dim:'', color:new THREE.Color(), pos:new THREE.Vector3(), dest:new THREE.Vector3(), dir:new THREE.Vector3(0,0,1),
    suma:new THREE.Vector3(), radio:R, glow:0, lit:0, brillo:0, ph:Math.random()*6.28, parent:null, total:0, colocados:0, tam:5, idx:0, nuevo:true };
}
function hilbert(n,x,y){
  let d=0;
  for(let s=n>>1;s>0;s>>=1){
    const rx=(x&s)>0?1:0, ry=(y&s)>0?1:0;
    d+=s*s*((3*rx)^ry);
    if(ry===0){ if(rx===1){ x=n-1-x; y=n-1-y; } const t=x; x=y; y=t; }
  }
  return d;
}
const PUNTOS=new Map();
function puntosOrdenados(T){
  if(PUNTOS.has(T)) return PUNTOS.get(T);
  const ga=Math.PI*(3-Math.sqrt(5)); let n=16; while(n*n<T*4) n*=2;
  const lista=[];
  for(let i=0;i<T;i++){
    const y=1-2*(i+0.5)/T, r=Math.sqrt(1-y*y), th=ga*i, v=new THREE.Vector3(Math.cos(th)*r,y,Math.sin(th)*r);
    const u=(Math.atan2(v.z,v.x)+Math.PI)/(Math.PI*2), w=(y+1)/2;   // proyección cilíndrica de igual área
    lista.push({v, d:hilbert(n,Math.min(n-1,Math.floor(u*n)),Math.min(n-1,Math.floor(w*n)))});
  }
  lista.sort((a,b)=>a.d-b.d);
  const out=lista.map(x=>x.v);
  if(PUNTOS.size>6) PUNTOS.clear();
  PUNTOS.set(T,out); return out;
}
function construirArbol(){
  const dims=S.niveles, N=S.personas.size;
  const raiz={hijos:new Map()};
  for(const p of S.personas.values()){
    let nodo=raiz;
    for(const d of dims){
      const g=DIM[d].de(p);
      if(!nodo.hijos.has(g.key)) nodo.hijos.set(g.key,{g, dim:d, hijos:new Map(), personas:[], n:0});
      nodo=nodo.hijos.get(g.key); nodo.n++;
    }
    nodo.personas.push(p);
  }
  const huecos=[Math.max(3,Math.round(N*0.03)), N>150?1:0, 0];
  const orden=[];
  const recorrer=(nodo,nivel)=>{
    const dim=DIM[dims[nivel]];
    nodo.lista=[...nodo.hijos.values()].sort((a,b)=>((a.g.key==='no-reporta')-(b.g.key==='no-reporta')) || (dim.orden?dim.orden(a.g,b.g):0) || b.n-a.n || a.g.label.localeCompare(b.g.label,'es'));
    nodo.lista.forEach((h,i)=>{
      if(i>0) for(let k=0;k<huecos[nivel];k++) orden.push(null);
      if(nivel+1<dims.length) recorrer(h,nivel+1);
      else { h.personas.sort((a,b)=>((a.orden??1e9)-(b.orden??1e9)) || a.nombre.localeCompare(b.nombre,'es')); for(const p of h.personas) orden.push(p); }
    });
  };
  recorrer(raiz,0);
  const pts=puntosOrdenados(orden.length);
  orden.forEach((p,i)=>{ if(p) p.slot=pts[i]; });

  const usados=new Set(), nodos=[], links=[], jer=[];
  const obtener=(clave,tipo)=>{ let n=S.nodoPorClave.get(clave); if(!n){ n=nuevoNodo(tipo,clave); S.nodoPorClave.set(clave,n);} usados.add(clave); n.total=0; n.colocados=0; n.suma.set(0,0,0); return n; };
  const radios=dims.length===1?[0.7]:(dims.length===2?[0.58,0.8]:[0.52,0.7,0.86]);
  // Colores: cada valor de los niveles 1 y 2 tiene su color en toda la esfera (Pasto siempre el
  // mismo), ordenado por tamaño; el nivel 3 y las personas usan matices del color de su grupo.
  const indice=[new Map(),new Map()];
  const contar=(nodo,nivel)=>{ if(nivel>1) return; for(const h of nodo.lista){ indice[nivel].set(h.g.key,(indice[nivel].get(h.g.key)||0)+h.n); contar(h,nivel+1); } };
  contar(raiz,0);
  for(const m of indice){ [...m.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k],i)=>m.set(k,i)); }
  const colorDe=(h,nivel,j,padre)=>{
    if(nivel===0) return new THREE.Color(h.dim==='perfil' && COLOR_PERFIL[h.g.key] ? COLOR_PERFIL[h.g.key] : colorPaleta(indice[0].get(h.g.key)));
    if(nivel===1) return new THREE.Color(colorPaleta(indice[1].get(h.g.key)));
    return matiz(padre.color,j);
  };
  const crear=(nodo,nivel,padre,ruta)=>{
    nodo.lista.forEach((h,i)=>{
      const clave=`G${nivel}:${ruta}|${h.g.key}`;
      const n=obtener(clave,'grupo');
      Object.assign(n,{nivel, dim:h.dim, label:h.g.label, gkey:h.g.key, parent:padre, tam:[13,7.5,4.6][nivel], radio:R*radios[nivel]});
      n.color.copy(colorDe(h,nivel,i,padre)); jer.push(n); if(padre) links.push([padre,n]);
      if(nivel+1<dims.length) crear(h,nivel+1,n,clave);
      else for(const p of h.personas){
        const x=obtener('X:'+p.id,'persona'); x.persona=p; p.node=x; x.parent=n; x.color.copy(n.color); p.color.copy(n.color);
        x.tam=6.6; x.total=1; x.colocados=p.placed?1:0; x.dir.copy(p.slot); x.dest.copy(p.slot).multiplyScalar(R);
        nodos.push(x); links.push([n,x]);
      }
    });
  };
  crear(raiz,0,null,'');
  for(const x of nodos){ let a=x.parent; while(a){ a.suma.add(x.dir); a.total++; if(x.persona.placed) a.colocados++; a=a.parent; } }
  for(const n of jer){ if(n.suma.lengthSq()>1e-6) n.dir.copy(n.suma).normalize(); n.dest.copy(n.dir).multiplyScalar(n.radio); }
  for(const n of [...jer,...nodos]) if(n.nuevo){ n.pos.copy(n.dest); if(!S.primeraVez && n.tipo==='grupo') n.pos.multiplyScalar(0.15); n.nuevo=false; }
  for(const x of nodos){ let a=x.parent; while(a && a.nivel>1) a=a.parent; x.persona.zona=a; }
  for(const k of [...S.nodoPorClave.keys()]) if(!usados.has(k)) S.nodoPorClave.delete(k);
  S.nodos=[...jer,...nodos]; S.links=links; S.moviendo=S.primeraVez?1:260; S.primeraVez=false;
  S.hubs1=jer.filter(n=>n.nivel===0); S.hubs2=jer.filter(n=>n.nivel===1);
  resumenes(); reconstruirGeometrias(); crearEtiquetas(); HUD.datos();
}
/** Totales por perfil y por municipio para el HUD, sin importar cómo esté organizada la esfera. */
function resumenes(){
  const pp=new Map(), pm=new Map();
  for(const p of S.lista){ pp.set(p.perfil,(pp.get(p.perfil)||0)+1); if(p.muni.key!=='no-reporta') pm.set(p.muni.label,(pm.get(p.muni.label)||0)+1); }
  S.perfilNodos=[...pp.entries()].map(([perfil,total])=>({perfil,total,label:nombrePerfil(perfil)})).sort((a,b)=>DIM.perfil.orden({key:a.perfil},{key:b.perfil}));
  S.muniNodos=[...pm.entries()].map(([label,total])=>({label,total}));
}

function reconstruirGeometrias(){
  for(const o of [puntos,lineas,poolPts]) if(o){ o.parent.remove(o); o.geometry.dispose(); }
  const n=S.nodos.length, g=geoPuntos(n,null);
  S.nodos.forEach((nd,i)=>{ nd.idx=i; g.attributes.position.setXYZ(i,nd.pos.x,nd.pos.y,nd.pos.z); g.attributes.aColor.setXYZ(i,nd.color.r,nd.color.g,nd.color.b); g.attributes.aSize.setX(i,nd.tam); });
  puntos=new THREE.Points(g,matPuntos); puntos.frustumCulled=false; puntos.renderOrder=2;

  const nv=S.links.length*SEG*2, gl=new THREE.BufferGeometry();
  gl.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nv*3),3).setUsage(THREE.DynamicDrawUsage));
  gl.setAttribute('color',new THREE.BufferAttribute(new Float32Array(nv*3),3).setUsage(THREE.DynamicDrawUsage));
  lineas=new THREE.LineSegments(gl,matLinks); lineas.frustumCulled=false; lineas.renderOrder=1;

  const gp=geoPuntos(S.lista.length,null);
  S.lista.forEach((p,i)=>{ p.poolIdx=i; gp.attributes.aColor.setXYZ(i,p.color.r,p.color.g,p.color.b); });
  ordenarNube();
  poolPts=new THREE.Points(gp,matPool); poolPts.frustumCulled=false; poolPts.renderOrder=3;

  esfera.add(lineas); esfera.add(puntos); grupo.add(poolPts);
  actualizarPosLinks();
}
function actualizarPosLinks(){
  const a=lineas.geometry.attributes.position.array; let o=0;
  for(const [P,C] of S.links){
    const k=P.pos.length()/(C.pos.length()||1), qx=C.pos.x*k, qy=C.pos.y*k, qz=C.pos.z*k;
    let px=P.pos.x, py=P.pos.y, pz=P.pos.z;
    for(let j=1;j<=SEG;j++){
      const t=j/SEG, u=1-t;
      const x=u*u*P.pos.x+2*u*t*qx+t*t*C.pos.x, y=u*u*P.pos.y+2*u*t*qy+t*t*C.pos.y, z=u*u*P.pos.z+2*u*t*qz+t*t*C.pos.z;
      a[o++]=px;a[o++]=py;a[o++]=pz;a[o++]=x;a[o++]=y;a[o++]=z;
      px=x;py=y;pz=z;
    }
  }
  lineas.geometry.attributes.position.needsUpdate=true;
}
function actualizarColLinks(){
  const a=lineas.geometry.attributes.color.array, e=esfera.matrix.elements; let o=0;
  const prof=n=>{ const f=Math.min(1,Math.max(0,0.5+0.5*(e[2]*n.pos.x+e[6]*n.pos.y+e[10]*n.pos.z)/RE())); return 0.12+0.88*f*f; };
  const ruta=S.foco ? S.foco.ruta : null;
  for(const [P,C] of S.links){
    const f=ruta && ruta.has(P) && ruta.has(C) ? 1 : LIN.v;
    const bp=P.brillo*0.38*prof(P)*f, bc=C.brillo*0.66*prof(C)*f, r=C.color.r, g=C.color.g, b=C.color.b;
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
    if(mover){ n.pos.lerp(n.dest,0.06); pos.setXYZ(n.idx,n.pos.x,n.pos.y,n.pos.z); }
    n.glow*=decae;
    const meta=n.tipo==='persona' ? (n.persona.placed?1:0) : (n.colocados ? 0.3+0.7*n.colocados/n.total : 0);
    n.lit+=(meta-n.lit)*Math.min(1,dt*2.5);
    let b=(n.tipo==='persona'?0.12:0.07)+n.lit*(n.tipo==='persona'?0.8:0.62)+n.glow+n.lit*0.1*Math.sin(t*2.1+n.ph);
    if(foco){ if(foco.ruta.has(n)) b+=0.7+0.3*Math.sin(t*6); else b*=0.3; }
    n.brillo=b; br.setX(n.idx,b);
  }
  if(mover){ pos.needsUpdate=true; actualizarPosLinks(); }
  br.needsUpdate=true;
  actualizarColLinks();
}
/*
 * Nube de datos por organizar: anillos ordenados alrededor de la esfera, como un
 * cinturón inclinado. Cada persona tiene su lugar según el grupo al que va (los
 * colores quedan en arcos seguidos) y los anillos giran despacio. El pulpo toma
 * los datos desde el borde de la esfera: el punto viaja hasta la punta del
 * tentáculo, que nunca sale de la esfera.
 */
const NUBE={giro:-0.16, n:0};
function ordenarNube(){
  const lista=S.lista.filter(p=>p.node).sort((a,b)=>a.node.idx-b.node.idx), N=lista.length;
  if(!N) return;
  const na=Math.max(3,Math.min(7,Math.round(Math.sqrt(N/45)))), angosta=innerWidth<=760;   // en el celular, más pegada a la esfera
  const radios=Array.from({length:na},(_,j)=>(angosta?1.07:1.15)+j*(angosta?0.045:0.07)), suma=radios.reduce((x,y)=>x+y,0);
  let i=0;
  radios.forEach((r,j)=>{
    const n=j===na-1 ? N-i : Math.round(N*r/suma);
    for(let q=0;q<n && i<N;q++,i++) lista[i].nube={r, a:(q+0.5*(j%2))/n*Math.PI*2, j, h:((i*7919)%13-6)*0.0018};
  });
  NUBE.n=na;
}
/**
 * Posición de una persona en la nube (espacio del pulpo, sin el giro de la esfera).
 * Cada anillo es una elipse alrededor de la silueta: pasa por delante de la mitad
 * baja de la esfera y por detrás de la alta. La profundidad va comprimida para que
 * la perspectiva no la abra hacia las estadísticas.
 */
function posNube(p,t,out){
  const n=p.nube, re=RE(), a=n.a+t*0.03/Math.pow(n.r,1.5);   // los anillos de adentro giran un poco más rápido
  const ca=Math.cos(a), sa=Math.sin(a), alto=0.19*(1+(n.j-(NUBE.n-1)/2)*0.1);
  const x=ca*n.r, y=-sa*n.r*alto+n.h+Math.sin(t*0.5+p.ph)*0.005, z=sa*n.r*0.42;
  const cg=Math.cos(NUBE.giro), sg=Math.sin(NUBE.giro);
  return out.set((x*cg-y*sg)*re,(x*sg+y*cg)*re,z*re);
}
const _pn=new THREE.Vector3();
function actualizarPool(t){
  if(!poolPts) return;
  const a=poolPts.geometry.attributes;
  for(const p of S.lista){
    const i=p.poolIdx;
    if(p.placed){ a.aSize.setX(i,0); continue; }
    if(p.carrier){ p.actual.copy(p.carrier.tip); a.aSize.setX(i,8); a.aBrillo.setX(i,1.5); }
    else {
      posNube(p,t,p.actual);
      if(p.claimed && p.brazo){   // el tentáculo llega al borde y atrae el dato hacia su punta
        const f=Math.max(0,Math.min(1,(p.brazo.reach-0.5)/0.5));
        p.actual.lerp(p.brazo.tip,f*f*(3-2*f));
      }
      a.aSize.setX(i,p.claimed?6.2:5); a.aBrillo.setX(i,p.claimed?1.5:1.1);
    }
    a.position.setXYZ(i,p.actual.x,p.actual.y,p.actual.z);
  }
  a.position.needsUpdate=a.aSize.needsUpdate=a.aBrillo.needsUpdate=true;
}

/* =====================================================================
   TAREAS DEL PULPO
   ===================================================================== */
const azar=(a,b)=>a+Math.random()*(b-a);
const ancestros=n=>{ const out=[]; let a=n.parent; while(a){ out.push(a); a=a.parent; } return out; };
function factorVel(){ const n=S.pendientes.length; return n>400?0.5 : n>150?0.65 : n>40?0.8 : 1; }
const _d=new THREE.Vector3();

function colocar(p){
  if(p.placed) return;
  p.placed=true; p.claimed=false; p.carrier=null; p.brazo=null;
  S.colocados++;
  const n=p.node; n.glow=2.4;
  ancestros(n).forEach((a,d)=>{ a.colocados++; setTimeout(()=>{ a.glow=Math.max(a.glow,1.3); },(d+1)*150); });
  if(S.modo==='trabajo'){ mostrarVuelo(n, p.nombre, ancestros(n).reverse().slice(1).map(a=>a.label).join(' · '), p.color.getStyle(), 1700, false); iluminarBinario(p); }
  HUD.evento('coloca',{p});
}
function tareaColocar(b,p){
  const tok=++b.token, f=factorVel();
  b.ancla=null; b.estado='ocupado'; b.etapa='busca'; b.tarea=p; p.claimed=true; p.brazo=b;
  posNube(p,performance.now()/1000,b.target);
  anime({ targets:b, reach:[b.reach,1], duration:430*f, easing:'easeOutQuad',
    update:()=>posNube(p,performance.now()/1000,b.target),
    complete:()=>{ if(tok!==b.token) return;
      b.persona=p; p.carrier=b; p.brazo=null; b.desde.copy(p.actual); b.u=0; b.etapa='lleva';
      destello(b,0.85); HUD.evento('toma',{p,b});
      anime({ targets:b, u:1, duration:760*f, easing:'easeInOutSine',
        update:()=>{ enGrupo(p.node,b.tmp); b.target.lerpVectors(b.desde,b.tmp,b.u); },
        complete:()=>{ if(tok!==b.token) return;
          b.persona=null; b.tarea=null; b.etapa='suelta'; destello(b,1); colocar(p);
          // la esfera se acomoda un poco hacia cada dato que el pulpo organiza
          if(S.modo==='trabajo' && S.sectorNodo) orientar(_d.copy(S.sectorNodo.dir).lerp(p.node.dir,0.35).normalize(),S.frente,0.7);
          anime({ targets:b, reach:0, duration:380*f, easing:'easeInQuad',
            complete:()=>{ if(tok!==b.token) return; b.estado='libre'; b.etapa='libre'; b.proxima=performance.now()+azar(40,180)*f; } });
        } });
    } });
}
function tareaVerificar(b,p){
  const tok=++b.token;
  b.estado='ocupado'; b.etapa='verifica'; b.ancla={nodo:p.node, off:new THREE.Vector3()};
  anime({ targets:b, reach:[0,1], duration:900, easing:'easeOutSine',
    complete:()=>{ if(tok!==b.token) return;
      p.node.glow=1.7; S.verificaciones++; destello(b,0.9);
      mostrarVuelo(p.node, corto(p.nombre), 'verificado', '#b48cff', 1300, false);
      HUD.evento('verifica',{p,b});
      anime({targets:b, reach:0, duration:700, easing:'easeInOutSine', delay:250,
        complete:()=>{ if(tok!==b.token) return; b.ancla=null; b.estado='libre'; b.etapa='libre'; b.proxima=performance.now()+azar(2500,7000); } });
    } });
}
function cancelarBrazo(b){
  b.token++; anime.remove(b); b.ancla=null;
  if(b.persona){ const p=b.persona; b.persona=null; colocar(p); }
  else if(b.tarea && !b.tarea.placed){ b.tarea.claimed=false; b.tarea.brazo=null; }
  b.tarea=null; b.estado='libre'; b.etapa='libre';
}
function retraerBrazos(){
  octo.brazos.forEach((b,i)=>{
    const tok=++b.token; anime.remove(b);
    anime({targets:b, reach:0, duration:650, delay:i*40, easing:'easeInOutSine', complete:()=>{ if(tok===b.token){ b.ancla=null; b.estado='libre'; b.etapa='libre'; b.proxima=0; } }});
  });
}
function moverCuerpo(x,y,dur=1500){
  anime.remove(octo);
  anime({targets:octo, x, y, duration:dur, easing:'easeInOutSine'});
}
/**
 * El pulpo se va a otro lado de la esfera (arriba, a un costado, abajo…) y la
 * esfera gira para poner bajo sus brazos la zona que va a organizar.
 */
let ladoPulpo=Math.random()*Math.PI*2;
const _o=new THREE.Vector3();
/** Lleva el pulpo a una dirección de la cara frontal, sin bajar detrás de las estadísticas. */
function irA(dir,dur=1500){
  const r=radioPulpo(), y=Math.max(-0.1,dir.y);
  moverCuerpo(dir.x*r,y*r,dur);
}
function irCerca(frente,dur=1500){ _o.copy(frente).multiplyScalar(0.6).add(EJE_Z.clone().multiplyScalar(0.4)).normalize(); irA(_o,dur); }
/**
 * El pulpo se ubica a un lado de la esfera (izquierda o derecha, un poco arriba)
 * y la esfera gira para llevar la zona que va a organizar al lado opuesto: los
 * brazos cruzan el interior de la esfera para alcanzar ese otro extremo.
 */
function traerAlFrente(nodo,vel=1.1){
  ladoPulpo=Math.random()<0.5 ? azar(-0.15,0.85) : Math.PI-azar(-0.15,0.85);   // izquierda o derecha, de preferencia arriba
  const to=azar(0.18,0.5), ts=azar(0.8,1.15), c=Math.cos(ladoPulpo), sn=Math.sin(ladoPulpo);
  _o.set(Math.sin(to)*c,Math.sin(to)*sn,Math.cos(to));
  S.frente.set(-Math.sin(ts)*c,-Math.sin(ts)*sn*0.6,Math.cos(ts)).normalize();
  orientar(nodo.dir,S.frente,vel);
  irA(_o);
}
function textoSector(n){
  const top=n.nivel===0?n:n.parent;
  const quien=top.dim==='perfil' ? (PLURAL[top.gkey]||top.label.toLowerCase()) : top.label;
  if(n===top) return `Organiza ${quien}`;
  return n.gkey==='no-reporta' ? `Organiza ${quien}: ${n.label.toLowerCase()}` : (top.dim==='perfil' ? `Organiza ${quien} de ${n.label}` : `Organiza ${quien} › ${n.label}`);
}
function actualizarSector(now){
  S.pendientes=S.lista.filter(p=>!p.placed && !p.claimed);
  if(S.modo!=='trabajo') return;
  const pend=S.pendientes;
  if(!pend.length){
    if(!S.lista.some(p=>!p.placed)){
      if(S.estadoClave!=='vigilia'){ estado('Vigila la red: verifica registros y espera nuevas inscripciones','vigilia'); ROT.libre=true; S.sectorNodo=null; }
      if(now-S.ultimoVigia>6000){   // en vigilia pasea por la esfera
        S.ultimoVigia=now; ladoPulpo+=azar(1,2.5); const th=azar(0.2,0.75);
        irA(_d.set(Math.sin(th)*Math.cos(ladoPulpo),Math.sin(th)*Math.sin(ladoPulpo),Math.cos(th)),3200);
      }
    }
    return;
  }
  const enSector=S.sectorNodo && pend.some(p=>p.zona===S.sectorNodo);
  if(!enSector || now-S.sectorDesde>9000){
    const cuenta=new Map();
    for(const p of pend) cuenta.set(p.zona,(cuenta.get(p.zona)||0)+1);
    let mejor=null, c=-1;
    for(const [m,n] of cuenta){ if(m===S.sectorNodo && cuenta.size>1) continue; if(n>c){ c=n; mejor=m; } }
    if(!mejor) mejor=[...cuenta.keys()][0];
    S.sectorNodo=mejor; S.sectorDesde=now;
    traerAlFrente(mejor);
    estado(textoSector(mejor),'sector');
  }
}
function programar(now){
  if(!S.cargado || now<S.arranque) return;   // primero se ve la nube ordenada; el pulpo empieza tras «Iniciar»
  if(S.modo==='tour'){ pasoTour(now); return; }
  if(now-S.tickSector>400){ S.tickSector=now; actualizarSector(now); }
  if(S.modo!=='trabajo') return;
  const quedan=S.lista.some(p=>!p.placed);
  let ocupados=octo.brazos.filter(b=>b.estado==='ocupado').length;
  const sd=S.sectorNodo?S.sectorNodo.dir:null;
  for(const b of octo.brazos){
    if(b.estado!=='libre' || now<b.proxima) continue;
    if(S.pendientes.length){
      let mejor=null, md=-9;
      for(const p of S.pendientes){
        if(p.claimed||p.placed) continue;
        const cerca=-Math.hypot(p.actual.x-octo.x,p.actual.y-octo.y,p.actual.z-octo.z)/RE()*0.5;   // de la nube, lo más cerca del pulpo
        const d=(sd ? p.node.dir.dot(sd)+(p.zona===S.sectorNodo?2:0) : 0)+cerca;
        if(d>md){ md=d; mejor=p; }
      }
      if(mejor) tareaColocar(b,mejor);
    } else if(!quedan && ocupados<3){
      const listos=S.lista.filter(p=>p.placed && frenteDe(p.node)>0.45);
      if(listos.length){ tareaVerificar(b,listos[(Math.random()*listos.length)|0]); ocupados++; }
      else b.proxima=now+2000;
    }
  }
}

/* =====================================================================
   ORGANIZAR POR … (voz o texto) y recorrido por los grupos nuevos
   ===================================================================== */
const DIM_PALABRAS=[
  [/\b(sector(es)?|tipos? de (entidad|entidades|organizacion|organizaciones))\b/,'sector'],
  [/\b(municipios?|ciudad(es)?|lugar(es)?)\b/,'municipio'],
  [/\b(departamentos?|region(es)?)\b/,'departamento'],
  [/\b(dependencias?|secretarias?|oficinas?)\b/,'dependencia'],
  [/\b(entidad(es)?|empresas?|organizacion(es)?|instituciones?|universidad(es)?)\b/,'entidad'],
  [/\b(generos?|sexo|mujeres|hombres)\b/,'genero'],
  [/\b(perfil(es)?|roles?|categorias?)\b|\btipos?\b(?! de (entidad|organizacion))/,'perfil'],
  [/\b(fechas?|dias?|inscripcion(es)?)\b/,'registro'],
  [/\b(estado|completos?|incompletos?)\b/,'estado'],
  [/\b(asistencia|ingresos?|llegada|presentes?|asistentes?)\b/,'asistencia']
];
// Solo verbos: «organización» o «clasificación» como sustantivo no cuentan.
const VERBO_ORGANIZAR=/\b(re)?(organiza|ordena|agrupa|clasifica|distribuye|separa|acomoda)(r|lo|los|la|las|me|melos|nos)?\b/;
/** Reconoce «organiza por municipio», «agrúpalos por entidad y municipio», «por género», «vista inicial». */
function comandoOrganizar(texto){
  const n=norm(texto);
  if(/\b(vista (inicial|normal)|como estaba|restablece\w*|reinicia\w*)\b/.test(n)) return {dims:NIVELES_BASE.slice()};
  const verbo=VERBO_ORGANIZAR.test(n), por=n.match(/\b(por|segun)\b(.*)$/);
  if(!por || (!verbo && !/^(por|segun)\b/.test(n))) return null;
  const hallados=[]; let resto=por[2];
  for(const [re,d] of DIM_PALABRAS){
    const m=resto.match(re);
    if(m){ hallados.push([m.index,d]); resto=resto.slice(0,m.index)+' '.repeat(m[0].length)+resto.slice(m.index+m[0].length); }   // «tipo de entidad» no cuenta también como «entidad»
  }
  if(!hallados.length) return verbo ? {error:'No reconozco esa característica. Prueba con municipio, departamento, entidad, perfil, fecha de registro o asistencia.'} : null;
  return {dims:[...new Set(hallados.sort((a,b)=>a[0]-b[0]).map(x=>x[1]))]};
}
function organizarPor(pedidas,origen,decision=null){
  let dims=[], nota='';
  for(const d of pedidas){
    if(dimDisponible(d)){ dims.push(d); continue; }
    if(d==='dependencia'){ if(!dims.includes('entidad')) dims.push('entidad'); nota=' La API no trae dependencia: uso la entidad.'; continue; }
    if(d==='genero'){ aviso('La API de eventos no envía el género de las personas, así que no puedo organizarlas por género.'); return; }
    if(d==='sector'){ aviso('Para organizar por sector, active Jev en el asistente (paso 4): él clasifica cada entidad.'); return; }
    if(pedidas.length===1){ aviso(`La API de eventos no trae datos de ${DIM[d].nombre}.`); return; }
  }
  if(!dims.length) return;
  dims=[...dims,...NIVELES_BASE.filter(d=>!dims.includes(d))].slice(0,3);
  if(S.foco){ clearTimeout(S.focoTimer); ocultarPanel(); S.foco=null; }
  S.niveles=dims; construirArbol();
  for(const b of octo.brazos) cancelarBrazo(b);
  const grupos=[...S.hubs1].sort((a,b)=>b.total-a.total).slice(0,8);
  S.modo='tour'; S.tour={grupos, i:-1, siguiente:performance.now()+900};
  const nombre=[...new Set(pedidas.map(d=>d==='dependencia' && !dims.includes(d) ? 'entidad' : d).filter(d=>dims.includes(d)))].map(d=>DIM[d].nombre).join(' y ');
  estado(`Organiza por ${nombre}`,'tour');
  aviso(`Organizado por ${nombre}: ${fmt(S.hubs1.length)} ${S.hubs1.length===1?'grupo':'grupos'}.${nota}${decision?` Lo decidió ${decision.motor} (confianza ${Math.round(decision.confianza*100)} %).`:''}`);
  HUD.evento('organiza',{texto:nombre, n:S.hubs1.length});
  if(origen==='voz') hablar(`Listo. Organicé por ${nombre}.`);
}
function pasoTour(now){
  const T=S.tour; if(!T || now<T.siguiente) return;
  T.i++;
  if(T.i>=T.grupos.length){ S.tour=null; S.modo='trabajo'; S.sectorDesde=0; S.sectorNodo=null; S.estadoClave=''; retraerBrazos(); return; }
  const g=T.grupos[T.i]; T.siguiente=now+1800;
  traerAlFrente(g,1.6); g.glow=2.4;
  mostrarVuelo(g, g.label, `${fmt(g.total)} ${g.total===1?'persona':'personas'}`, g.color.getStyle(), 1700);
  const miembros=S.nodos.filter(x=>x.tipo==='persona' && ancestros(x).includes(g));
  octo.brazos.forEach((b,i)=>{
    const x=miembros.length ? miembros[(Math.random()*miembros.length)|0] : g, tok=++b.token;
    anime.remove(b); b.ancla={nodo:x, off:new THREE.Vector3()}; b.estado='tour'; b.etapa='verifica';
    anime({targets:b, reach:[b.reach,1], duration:700, delay:i*60, easing:'easeOutSine', complete:()=>{ if(tok===b.token){ destello(b,0.8); x.glow=1.6; } }});
  });
  estado(`Grupo ${T.i+1} de ${T.grupos.length}: ${g.label}`,'tour');
}

/* =====================================================================
   FOCO: persona encontrada por voz, texto o cámara
   ===================================================================== */
const FRENTE_FOCO=new THREE.Vector3();
/** La persona encontrada queda a la izquierda (el panel abre a la derecha) o arriba en móvil (el panel abre abajo). */
function frenteFoco(){ return innerWidth<=760 ? FRENTE_FOCO.set(0,0.34,1).normalize() : FRENTE_FOCO.set(-0.42,0.04,1).normalize(); }
function enfocar(p,origen,coincidencias=[],extra={}){
  if(!p || !p.node) return;
  clearTimeout(S.focoTimer);
  S.modo='foco'; S.tour=null;
  for(const b of octo.brazos) cancelarBrazo(b);
  if(!p.placed) colocar(p);
  const n=p.node;
  S.foco={p, origen, ruta:new Set([n,...ancestros(n)])};
  if(origen!=='confirmar') iluminarBinario(p,true);   // sin confirmar, el nombre no se escribe en el fondo
  ancestros(n).forEach((a,i)=>setTimeout(()=>{ a.glow=2; },i*120));
  n.glow=3;
  const F=frenteFoco();
  orientar(n.dir,F,2.4);
  irCerca(F,1100);
  octo.brazos.forEach((b,i)=>{
    const tok=b.token;
    b.ancla={nodo:n, off:new THREE.Vector3((i-3.5)*2.1,(i%2?1.8:-1.6),0)};
    b.estado='foco'; b.etapa='foco';
    anime({targets:b, reach:[0,1], duration:1000, delay:i*70, easing:'easeOutElastic(1, .75)',
      complete:()=>{ if(tok===b.token) destello(b,1.2); }});
  });
  estado(origen==='camara' ? `Reconoció a ${corto(p.nombre)} frente a la cámara` : (origen==='confirmar' ? `Cree reconocer a ${corto(p.nombre)}: espera confirmación` : `Encontró a ${corto(p.nombre)}`),'foco');
  mostrarPanel(p,origen,coincidencias,extra);
  programarCierre(CONFIG.FOCO_MS+Math.min(8000,coincidencias.length*1200));
}
function programarCierre(ms){ clearTimeout(S.focoTimer); S.focoTimer=setTimeout(soltarFoco,ms); PANEL.ms=ms; }
function soltarFoco(){
  ocultarPanel();
  if(!S.foco) return;
  S.foco=null; S.modo='trabajo'; S.sectorDesde=0; S.sectorNodo=null; S.estadoClave='';
  retraerBrazos();
}

/* =====================================================================
   PANEL LATERAL, NOMBRES QUE VUELAN, ETIQUETAS, AVISOS
   ===================================================================== */
const _p=new THREE.Vector3(), _v=new THREE.Vector3(), _v2=new THREE.Vector3(), CERO=new THREE.Vector3();
function aPantalla(v){ _p.copy(v).applyMatrix4(grupo.matrixWorld).project(camera); return {x:(_p.x+1)/2*W, y:(1-_p.y)/2*H}; }
const iniciales=n=>n.split(' ').filter(w=>!MINUS.has(w.toLowerCase())).slice(0,2).map(w=>w.charAt(0)).join('').toUpperCase();

/* ---------------- Fotos de la API (a través de api.php) ---------------- */
const FOTOS=new Map();   // id → URL temporal (blob:), como máximo 40 en memoria
async function fotoURL(p){
  if(FOTOS.has(p.id)){ const u=FOTOS.get(p.id); FOTOS.delete(p.id); FOTOS.set(p.id,u); return u; }
  let u='';
  if(p.foto && CONFIG.ROSTROS_API && !DEMO) u=URL.createObjectURL(await pedir('foto',{params:'&id='+p.id, servicio:'fotos', binario:true}));
  else if(CONFIG.FOTO_URL && (p.carnet || CONFIG.FOTO_URL.includes('{id}'))) return CONFIG.FOTO_URL.replace('{carnet}',encodeURIComponent(p.carnet)).replace('{id}',p.id);
  if(!u) return '';
  FOTOS.set(p.id,u);
  if(FOTOS.size>40){ const [k,v]=FOTOS.entries().next().value; URL.revokeObjectURL(v); FOTOS.delete(k); }
  return u;
}
async function ponerFoto(cont,p,mostrar=true){
  const img=cont.querySelector('img'), ini=cont.querySelector('span');
  ini.textContent=iniciales(p.nombre); cont.style.setProperty('--c',p.color.getStyle());
  cont.classList.remove('con-foto'); img.removeAttribute('src'); cont.dataset.id=String(p.id);
  cont.classList.toggle('reservada',!mostrar);
  if(!mostrar) return;   // sin el 80 % de coincidencia solo se ven las iniciales
  try{
    const u=await fotoURL(p);
    if(u && cont.dataset.id===String(p.id)){ img.onload=()=>cont.classList.add('con-foto'); img.src=u; }
  }catch(_){}
}

/* ---------------- Panel lateral ---------------- */
const PANEL={el:$('#panel'), pista:$('#pCoincLista'), timer:null, cierre:null, idx:0, pausa:false, ms:0, saliendo:false};
const ACCION_TXT={saludar:'saludar', confirmar:'pedir confirmación', ignorar:'ignorar', elegir:'elegir a esta persona', dudosa:'mostrar opciones'};
/** La foto solo aparece cuando la coincidencia llega a este valor (o la persona lo confirmó). */
const FOTO_MIN=0.8;
function mostrarPanel(p,origen,coinc,extra={}){
  const el=PANEL.el;
  clearTimeout(PANEL.cierre);
  const coin=extra.coincidencia, conFoto=(coin ?? 1)>=FOTO_MIN;
  el.classList.toggle('bienvenida',origen==='camara');
  el.classList.toggle('solo-lista',!p);
  el.classList.toggle('sin-confirmar',!!p && origen==='confirmar' && !conFoto);
  const med=$('#pMedidor');
  med.hidden=!p || coin==null;
  if(coin!=null){
    const v=Math.round(coin*100);
    med.classList.toggle('alta',coin>=FOTO_MIN);
    med.querySelector('b').textContent=`${v} %`;
    med.querySelector('i').style.width=`${v}%`;
    med.setAttribute('aria-label',`Coincidencia del ${v} por ciento`);
  }
  prepararEntrenar(p,origen,extra);
  $('#pSaludo').textContent=extra.saludo || (!p ? '¿Buscas a alguna de estas personas?'
    : (origen==='camara' ? CONFIG.SALUDO.replace('{nombre}',nombreHablado(p)) : (origen==='confirmar' ? 'Creo reconocerte' : (origen==='voz' ? 'Encontré a' : 'Resultado de la búsqueda'))));
  const dec=$('#pDecision'), d=extra.decision;
  dec.hidden=!d; dec.textContent=d ? `Decisión de ${d.motor}: ${ACCION_TXT[d.accion]||d.accion} · confianza ${Math.round(d.confianza*100)} %` : '';
  if(p){
    $('#pNombre').textContent=p.nombre;
    $('#pEntidad').textContent=p.ent.label;
    ponerFoto($('#pFoto'),p,conFoto);
    const datos=[['Perfil',nombrePerfil(p.perfil)],['Municipio',p.muni.label]];
    if(p.depto.key!=='no-reporta') datos.push(['Departamento',p.depto.label]);
    if(p.sector) datos.push(['Sector',DIM.sector.de(p).label]);
    if(p.dependencia.key!=='no-reporta') datos.push(['Dependencia',p.dependencia.label]);
    if(p.genero.key!=='no-reporta') datos.push(['Género',p.genero.label]);
    datos.push(['Ingresos',p.ingresos ? `${fmt(p.ingresos)} ${p.ingresos===1?'registro':'registros'} de entrada` : 'Aún sin ingreso registrado']);
    const dl=$('#pDatos'); dl.replaceChildren();
    for(const [k,v] of datos){ const dt=document.createElement('dt'), dd=document.createElement('dd'); dt.textContent=k; dd.textContent=v; dl.append(dt,dd); }
    $('#pDot').style.background=p.color.getStyle();
    const ch=$('#pCharla');
    if(p.propuesta && p.propuesta.titulo){
      const ag=p.propuesta.agenda, sp=document.createElement('span');
      sp.textContent=ag ? `charla · día ${ag.dia}, ${ag.hora}${ag.salon?' · salón '+ag.salon:''}` : 'charla aprobada';
      ch.replaceChildren(sp,document.createTextNode(p.propuesta.titulo.replace(/^[“"]|[”"]$/g,'')));
      ch.hidden=false;
    } else ch.hidden=true;
  }
  ponerCoincidencias(coinc,p,extra.puntajes);
  // Si el panel se estaba cerrando, se cancela el cierre para que no desaparezca el nuevo resultado.
  const entra=el.hidden || PANEL.saliendo;
  anime.remove(el); PANEL.saliendo=false;
  if(entra){ el.hidden=false; anime({targets:el, opacity:[0,1], translateX:[innerWidth<=760?0:40,0], translateY:[innerWidth<=760?24:0,0], duration:450, easing:'easeOutCubic'}); }
  else el.style.opacity=1;
}
function ocultarPanel(){
  const el=PANEL.el; clearInterval(PANEL.timer); clearTimeout(PANEL.cierre);
  CONF.p=null;
  if(el.hidden) return;
  anime.remove(el); PANEL.saliendo=true;
  anime({targets:el, opacity:0, duration:300, easing:'easeInQuad', complete:()=>{ PANEL.saliendo=false; el.hidden=true; $('#guiaLinea').style.display='none'; }});
}
/**
 * Coincidencias: una fila de tarjetas que se desliza sola; al tocar una, se enfoca esa persona.
 * Cada tarjeta muestra la foto solo si su coincidencia con lo buscado llega al 80 %.
 */
function ponerCoincidencias(lista,actual,puntajes=null){
  clearInterval(PANEL.timer); PANEL.idx=0;
  const pista=PANEL.pista; pista.replaceChildren(); pista.style.transform='translateX(0)';
  $('#pCoinc').hidden=!lista.length; $('#pCoincN').textContent=lista.length?`${fmt(lista.length)}`:'';
  for(const q of lista){
    const li=document.createElement('li'), b=document.createElement('button');
    b.type='button'; b.className='coinc';
    const av=document.createElement('span'); av.className='foto mini';
    av.append(document.createElement('img'),document.createElement('span'));
    const tx=document.createElement('span'), nb=document.createElement('b'), sm=document.createElement('small');
    tx.className='tx'; nb.textContent=q.nombre; sm.textContent=`${q.ent.label} · ${q.muni.label}`; tx.append(nb,sm);
    b.append(av,tx); b.setAttribute('aria-label',`Ver a ${q.nombre}`);
    b.onclick=()=>enfocar(q,'texto',[actual,...lista].filter(x=>x && x!==q),{puntajes});
    li.append(b); pista.append(li);
    ponerFoto(av,q,!puntajes || (puntajes.get(q) ?? 0)>=FOTO_MIN);
  }
  if(lista.length>1) PANEL.timer=setInterval(avanzarCarrusel,2600);
}
function avanzarCarrusel(){
  if(PANEL.pausa) return;
  const pista=PANEL.pista, n=pista.children.length; if(n<2) return;
  PANEL.idx=(PANEL.idx+1)%n;
  const x=pista.children[PANEL.idx].offsetLeft-pista.children[0].offsetLeft, max=Math.max(0,pista.scrollWidth-pista.parentElement.clientWidth);
  pista.style.transform=`translateX(${-Math.min(x,max)}px)`;
  if(x>=max) PANEL.idx=n-1;   // al llegar al final, la siguiente vuelta empieza de nuevo
}
PANEL.el.addEventListener('pointerenter',()=>{ PANEL.pausa=true; if(S.foco) clearTimeout(S.focoTimer); else clearTimeout(PANEL.cierre); });
PANEL.el.addEventListener('pointerleave',()=>{ PANEL.pausa=false; if(S.foco) programarCierre(CONFIG.FOCO_MS); else PANEL.cierre=setTimeout(ocultarPanel,6000); });
PANEL.el.addEventListener('focusin',()=>{ PANEL.pausa=true; });
$('#pCerrar').addEventListener('click',()=>{ if(S.foco){ clearTimeout(S.focoTimer); soltarFoco(); } else ocultarPanel(); });
function soloCoincidencias(lista,decision=null,puntajes=null){
  if(S.foco){ clearTimeout(S.focoTimer); S.foco=null; S.modo='trabajo'; retraerBrazos(); }
  for(const q of lista) q.node.glow=1.8;
  mostrarPanel(null,'texto',lista,{decision,puntajes});
  PANEL.cierre=setTimeout(ocultarPanel,14000);
}
/** Línea punteada desde la persona encontrada hasta el panel. */
function posicionarGuia(){
  const ln=$('#guiaLinea');
  if(PANEL.el.hidden || !S.foco || frenteDe(S.foco.p.node)<0.2){ ln.style.display='none'; return; }
  const s=aPantalla(enGrupo(S.foco.p.node,_v)), r=$('#pFicha').getBoundingClientRect();
  const ex=innerWidth<=760 ? r.left+r.width/2 : r.left, ey=innerWidth<=760 ? r.top : r.top+r.height/2;
  ln.setAttribute('x1',s.x); ln.setAttribute('y1',s.y); ln.setAttribute('x2',ex); ln.setAttribute('y2',ey);
  ln.style.display='';
}

/* ---------------- Nombres que aparecen al organizar ---------------- */
const VUELOS=[];
function crearVuelos(){
  const cont=$('#vuelos');
  for(let i=0;i<8;i++){ const el=document.createElement('div'), b=document.createElement('b'), s=document.createElement('small'); el.className='vuelo'; el.append(b,s); cont.append(el); VUELOS.push({el,b,s,nodo:null,t0:0,vida:0,carril:0,x:0,y:0}); }
}
/**
 * Muestra un nombre junto al dato. Cada etiqueta busca un «carril» vertical libre
 * para no tapar a las demás; si el pulpo coloca muy rápido, las de trabajo se
 * espacian (como mínimo 0,35 s) y siempre se ve la más reciente.
 */
let ultimoVuelo=0;
function mostrarVuelo(nodo,titulo,sub,color,vida=1800,prioridad=true){
  const ahora=performance.now();
  if(!prioridad && ahora-ultimoVuelo<350) return;
  ultimoVuelo=ahora;
  const s=aPantalla(enGrupo(nodo,_v2)), ALTO=40;
  const activos=VUELOS.filter(x=>x.nodo && Math.abs(x.x-s.x)<170);
  let carril=0;
  while(carril<4 && activos.some(x=>Math.abs((x.y-x.carril*ALTO)-(s.y-carril*ALTO))<ALTO-4)) carril++;
  const v=VUELOS.find(x=>!x.nodo) || VUELOS.reduce((a,b)=>a.t0<b.t0?a:b);
  Object.assign(v,{nodo, t0:ahora, vida, carril:carril%4, x:s.x, y:s.y});
  v.b.textContent=titulo; v.s.textContent=sub||''; v.s.hidden=!sub; v.el.style.setProperty('--c',color);
}
function actualizarVuelos(now){
  for(const v of VUELOS){
    if(!v.nodo) continue;
    const k=(now-v.t0)/v.vida;
    if(k>=1 || !v.nodo.pos){ v.nodo=null; v.el.style.opacity=0; continue; }
    const s=aPantalla(enGrupo(v.nodo,_v2)), fr=Math.max(0,Math.min(1,(frenteDe(v.nodo)+0.2)*1.6));
    v.x=s.x; v.y=s.y;
    v.el.style.opacity=Math.min(1,k*6,(1-k)*3.2)*fr;
    v.el.style.transform=`translate(${Math.round(s.x)}px,${Math.round(s.y-12-v.carril*40-k*10)}px) translate(-50%,-100%)`;
  }
}

/* ---------------- Fondo binario: los nombres en unos y ceros ---------------- */
/**
 * Filas de bits (UTF-8 de los nombres inscritos) que suben despacio detrás de la
 * esfera, sin marco. Cuando el pulpo coloca o encuentra a alguien, una fila se
 * ilumina con su nombre y sus bits en el color de su grupo. Se dibuja a 24 cuadros
 * por segundo y se recorta alrededor de la esfera, la barra y las estadísticas.
 */
const BIN={cv:$('#binario'), ctx:null, filas:[], alto:18, ancho:7.2, cols:0, cy:0, r:0, arriba:0, abajo:0, ult:0, dibujo:0,
  vel:matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 13};
const UTF8=new TextEncoder();
function bitsDe(txt){ let s=''; for(const b of UTF8.encode(txt)) s+=b.toString(2).padStart(8,'0')+' '; return s; }
function bitsAzar(n){ let s=''; for(let i=0;i<n;i++) s+=(i%9===8)?' ':(Math.random()<0.5?'0':'1'); return s; }
function textoBinario(){
  let s='';
  while(s.length<BIN.cols) s+=(S.lista.length ? bitsDe(S.lista[(Math.random()*S.lista.length)|0].nombre) : bitsAzar(72))+'  ';
  return s;
}
function reciclarFila(f){ f.txt=textoBinario(); f.x=-((Math.random()*9)|0)*BIN.ancho; f.luz=0; f.p=null; }
function ajustarBinario(cy,r,arriba,abajo){
  const cv=BIN.cv; if(!cv) return;
  cv.width=W; cv.height=H;   // fondo tenue: no hace falta resolución de retina
  BIN.ctx=cv.getContext('2d'); BIN.ctx.font='500 12px "JetBrains Mono", monospace'; BIN.ctx.textBaseline='top';
  BIN.ancho=BIN.ctx.measureText('0').width||7.2;
  Object.assign(BIN,{cy,r,arriba,abajo,cols:Math.ceil(W/BIN.ancho)+12});
  const n=Math.ceil(H/BIN.alto)+2;
  while(BIN.filas.length<n) BIN.filas.push({y:0,x:0,txt:'',luz:0,p:null,cab:'',bits:'',t0:0,vida:1});
  BIN.filas.length=n;
  BIN.filas.forEach((f,i)=>{ f.y=i*BIN.alto; if(f.txt.length<BIN.cols) reciclarFila(f); });
}
/** Ilumina una fila con el nombre de la persona (las de trabajo, como mucho cada 0,45 s). */
function iluminarBinario(p,fuerte=false){
  if(!BIN.ctx || !p) return;
  const ahora=performance.now();
  if(!fuerte && ahora-BIN.ult<450) return;
  BIN.ult=ahora;
  // Con espacio a los lados, en la mitad baja (para que se vea subir); en pantallas angostas, sobre la esfera.
  const lados=W/2-BIN.r>140, techo=BIN.cy-BIN.r*1.12;
  const libres=BIN.filas.filter(f=>!f.luz && (lados ? f.y>BIN.arriba+(BIN.abajo-BIN.arriba)*0.35 && f.y<BIN.abajo-BIN.alto*2 : f.y>BIN.arriba+BIN.alto*2 && f.y<techo));
  const f=libres[(Math.random()*libres.length)|0]; if(!f) return;
  f.p=p; f.cab=p.nombre.toUpperCase(); f.bits=bitsDe(p.nombre); f.t0=ahora; f.vida=fuerte?7000:3600; f.luz=fuerte?1:0.7;
  f.x=Math.max(16,Math.round((W/2-BIN.r)*0.08)); f.txt=' '.repeat(f.cab.length+3)+f.bits+' '+textoBinario();
  f.color=p.color.getStyle();
}
function actualizarBinario(now,dt){
  const c=BIN.ctx; if(!c) return;
  for(const f of BIN.filas){
    f.y-=BIN.vel*dt;
    if(f.y<-BIN.alto){ f.y+=BIN.filas.length*BIN.alto; reciclarFila(f); }
    if(f.luz && now-f.t0>f.vida) f.luz=0;
  }
  if(now-BIN.dibujo<41) return;   // ~24 cuadros por segundo
  BIN.dibujo=now;
  c.globalCompositeOperation='source-over';
  c.clearRect(0,0,W,H);
  c.fillStyle='rgba(61,255,160,.12)';
  for(const f of BIN.filas) if(!f.luz && f.y>BIN.arriba-BIN.alto && f.y<BIN.abajo) c.fillText(f.txt,f.x,f.y);
  // Filas iluminadas: el nombre en claro y sus bits que se «decodifican» de izquierda a derecha.
  for(const f of BIN.filas){
    if(!f.luz) continue;
    const x0=f.x, k=(now-f.t0)/f.vida, a=f.luz*Math.min(1,k*8,(1-k)*3);
    const pre=f.cab.length+3, n=Math.min(f.bits.length,Math.floor(k*f.vida/14));
    c.fillStyle='rgba(61,255,160,.12)'; c.fillText(f.txt.slice(pre+n),x0+(pre+n)*BIN.ancho,f.y);
    c.globalAlpha=a; c.fillStyle='#f2fff9'; c.fillText(f.cab,x0,f.y);
    c.fillStyle=f.color; c.fillText(f.bits.slice(0,n),x0+pre*BIN.ancho,f.y);
    c.globalAlpha=1;
  }
  // Recortes suaves: la esfera, la barra superior y las estadísticas quedan limpias.
  c.globalCompositeOperation='destination-out';
  const g=c.createRadialGradient(W/2,BIN.cy,BIN.r*0.9,W/2,BIN.cy,BIN.r*1.22);
  g.addColorStop(0,'rgba(0,0,0,1)'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.fillRect(0,0,W,H);
  const gs=c.createLinearGradient(0,BIN.arriba-10,0,BIN.arriba+60);
  gs.addColorStop(0,'rgba(0,0,0,1)'); gs.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=gs; c.fillRect(0,0,W,BIN.arriba+60);
  const gi=c.createLinearGradient(0,BIN.abajo-70,0,BIN.abajo);
  gi.addColorStop(0,'rgba(0,0,0,0)'); gi.addColorStop(1,'rgba(0,0,0,1)');
  c.fillStyle=gi; c.fillRect(0,BIN.abajo-70,W,H);
  c.globalCompositeOperation='source-over';
}

/* ---------------- Etiquetas de los grupos sobre la esfera ---------------- */
function crearEtiquetas(){
  const cont=$('#etiquetas'); cont.replaceChildren(); S.etiquetas=[];
  for(const n of [...S.hubs1].sort((a,b)=>b.total-a.total).slice(0,14)){
    const el=document.createElement('div'); el.className='etq perfil'; el.style.color=n.color.getStyle();
    el.append(document.createTextNode(n.label)); const sm=document.createElement('small'); el.append(sm);
    cont.append(el); S.etiquetas.push({el,n,sm,tipo:'perfil',w:0,radio:R+16});
  }
  const vistos=new Set();
  for(const n of [...S.hubs2].sort((a,b)=>b.total-a.total).filter(n=>n.total>=6 && !vistos.has(n.label) && vistos.add(n.label)).slice(0,9)){
    const el=document.createElement('div'); el.className='etq muni'; el.textContent=n.label; el.style.color=n.color.getStyle();
    cont.append(el); S.etiquetas.push({el,n,tipo:'muni',w:0,radio:R*0.74});
  }
  medirEtiquetas();
}
/** El ancho de cada etiqueta se mide aparte para no forzar el diseño en cada cuadro. */
function medirEtiquetas(){ for(const e of S.etiquetas){ if(e.sm) e.sm.textContent=fmt(e.n.total); e.w=e.el.offsetWidth; } }
function actualizarEtiquetas(){
  const c=aPantalla(CERO);
  for(const e of S.etiquetas){
    const n=e.n;
    const rad=e.tipo==='perfil' ? e.radio*ESC.v : e.radio*ESC.v;
    _v.copy(n.dir).multiplyScalar(rad).applyQuaternion(esfera.quaternion);
    const fz=_v.z/rad, s=aPantalla(_v);
    const ax=e.tipo==='perfil' ? (s.x>c.x+30?0:(s.x<c.x-30?-1:-0.5)) : -0.5;
    const x=Math.max(8,Math.min(W-e.w-8,s.x+ax*e.w));
    e.el.style.transform=`translate(${x}px,${s.y}px) translateY(-50%)`;
    let op=(n.colocados?(e.tipo==='perfil'?0.95:0.7):0.25)*Math.max(0,Math.min(1,(fz+0.1)*2.4));
    if(S.foco) op=S.foco.ruta.has(n)?Math.max(0.35,op):0.06;
    e.el.style.opacity=op;
  }
}
let avisoTimer=null;
function aviso(texto,opciones=[]){
  const el=$('#aviso'); $('#avisoTexto').textContent=texto;
  const op=$('#avisoOpciones'); op.replaceChildren();
  for(const p of opciones){ const b=document.createElement('button'); b.type='button'; b.textContent=p.nombre; b.onclick=()=>{ el.hidden=true; enfocar(p,'texto'); }; op.append(b); }
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
   También entiende «organiza por municipio» y similares.
   ===================================================================== */
async function buscar(texto,origen){
  texto=(texto||'').trim();
  if(!texto){ vozEstado(); return; }
  if(!S.cargado){ aviso('Los registros aún se están cargando.'); return; }
  const cmd=comandoOrganizar(texto);
  if(cmd){
    S.escuchando=false; vozEstado();
    HUD.evento('texto',{verbo:'orden', texto:`«${texto}»`, color:'#ffd500'});
    if(cmd.error) aviso(cmd.error); else organizarPor(cmd.dims,origen);
    return;
  }
  vozEstado(`Buscando «${texto}»…`);
  if(CONF.p){   // «sí» o «no» por voz mientras la pantalla pregunta «¿Eres tú?»
    if(/^(s[ií]|claro|correcto|as[ií] es|(s[ií],? )?soy yo)[.!]?$/i.test(texto)){ vozEstado(); responder(true); return; }
    if(/^no([,.]? (soy( yo)?|lo soy|es))?[.!]?$/i.test(texto)){ vozEstado(); responder(false); return; }
  }
  S.escuchando=true;
  const q=tokensConsulta(texto);
  const ranking=S.lista.map(p=>({p,s:puntaje(q,p)})).sort((a,b)=>b.s-a.s);
  const [top,seg]=ranking;
  const cand=()=>ranking.slice(0,25).map(x=>({id:x.p.id, nombre:x.p.nombre, entidad:x.p.ent.label, municipio:x.p.muni.label}));
  let elegido=null, iaRespondio=false, decision=null, dudoso=null;
  if(top && top.s>=0.97 && (!seg || seg.s<0.85)) elegido=top.p;   // nombre exacto: no hace falta preguntarle a nadie
  else if(CONFIG.JEV_BUSQUEDA && !DEMO){
    // Jev decide en una sola llamada qué se pidió y a quién; la pantalla actúa según la confianza.
    try{
      const r=await pedir('jev_orden',{metodo:'POST', json:{texto, candidatos:cand()}, servicio:'jev'});
      iaRespondio=true;
      HUD.evento('jev',{texto:r.intencion.valor==='organizar' ? `organizar por ${r.caracteristica.valor}` : r.intencion.valor.replace('_',' '), confianza:r.intencion.confianza, ms:r.ms});
      if(r.intencion.valor==='organizar' && r.caracteristica.valor!=='ninguna' && r.intencion.confianza>=0.5 && r.caracteristica.confianza>=0.4){
        S.escuchando=false; vozEstado();
        organizarPor([r.caracteristica.valor],origen,{motor:'Jev', accion:'organizar', confianza:r.caracteristica.confianza});
        return;
      }
      const pj=r.persona.id!=null ? S.personas.get(Number(r.persona.id))||null : null;
      if(pj && r.persona.confianza>=0.6){ elegido=pj; decision={motor:'Jev', accion:'elegir', confianza:r.persona.confianza}; }
      else if(pj && r.persona.confianza>=0.3){ dudoso=pj; decision={motor:'Jev', accion:'dudosa', confianza:r.persona.confianza}; }
      else if(r.intencion.valor==='otra' && r.intencion.confianza>=0.7){
        S.escuchando=false; vozEstado();
        aviso('Puedo buscar a una persona inscrita o reorganizar la esfera. Prueba con un nombre o con «organiza por municipio».');
        return;
      }
    }catch(e){ console.warn(e); }
  }
  if(!elegido && !iaRespondio && CONFIG.GEMINI && !DEMO){
    try{
      const r=await pedir('gemini',{metodo:'POST', json:{texto, candidatos:cand()}, servicio:'ia'});
      iaRespondio=true;
      if(r && r.id!=null && (r.confianza??1)>=0.5){ elegido=S.personas.get(Number(r.id))||null; if(elegido) decision={motor:'Gemini', accion:'elegir', confianza:r.confianza??1}; }
    }catch(e){ console.warn(e); }
  }
  if(!elegido && !iaRespondio && top && top.s>=0.8) elegido=top.p;
  S.escuchando=false; vozEstado();
  let coinc=ranking.filter(x=>x.s>=0.55 && x.p!==elegido).slice(0,20).map(x=>x.p);
  if(dudoso) coinc=[dudoso,...coinc.filter(x=>x!==dudoso)];
  // Coincidencia de cada persona con lo buscado: el parecido del nombre o, si decidió la IA, su confianza.
  const puntajes=new Map(ranking.slice(0,40).map(x=>[x.p,Math.min(1,x.s)]));
  if(decision && (elegido||dudoso)){ const x=elegido||dudoso; puntajes.set(x,Math.max(puntajes.get(x)||0,decision.confianza)); }
  HUD.evento('busqueda',{p:elegido, texto, origen});
  if(elegido) enfocar(elegido,origen,coinc,{decision, puntajes, coincidencia:puntajes.get(elegido)??1});
  else if(coinc.length) soloCoincidencias(coinc,decision,puntajes);
  else aviso(`No encontré a «${texto}».`);
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
const VIS={ listo:false, activo:false, video:$('#video'), hud:$('#hud'), caras:[], vistos:[], conteo:{female:0, male:0}, bienvenidas:0, onda:[], estables:new Map() };
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
    encolarRostros();
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
/**
 * La persona más parecida y la distancia a la segunda (para saber si hay margen).
 * Se descarta a quien ya dijo «no soy» con un rostro casi igual a este.
 */
function mejorCoincidencia(desc){
  let id=null, dist=9, dist2=9;
  for(const [pid,lista] of S.rostros){
    let m=9; for(const ref of lista){ const d=faceapi.euclideanDistance(desc,ref); if(d<m) m=d; }
    if(m<dist2 && rechazado(pid,desc)) continue;
    if(m<dist){ dist2=dist; dist=m; id=pid; } else if(m<dist2) dist2=m;
  }
  return {id,dist,dist2};
}
function rechazado(pid,desc){
  const l=S.negativos.get(pid); if(!l) return false;
  for(const n of l) if(faceapi.euclideanDistance(desc,n)<0.4) return true;
  return false;
}

/* ---------------- Aprendizaje: «¿Eres tú?» sí / no ---------------- */
/**
 * Coincidencia (0 a 1) de un rostro con la foto de inscripción. Parte de una curva
 * según la distancia (50 % en el umbral configurado, 80 % unos 0,05 por debajo) y
 * se corrige con las respuestas «sí / no» que las personas han dado con distancias
 * parecidas. En el servidor solo quedan esos conteos, sin nombres ni rostros.
 */
const APR={bins:{}, si:0, no:0};
const tramo=d=>(Math.floor(Math.max(0,Math.min(1.5,d))*40)/40).toFixed(3);
function coincidencia(d){
  if(d==null || d>=9) return 0;
  const base=1/(1+Math.exp((d-CONFIG.UMBRAL_ROSTRO)/0.035));
  const t=Number(tramo(d));
  let si=0, no=0;
  for(const [dt,w] of [[0,1],[-0.025,0.5],[0.025,0.5]]){ const b=APR.bins[tramo(t+dt+1e-6)]; if(b){ si+=w*b.si; no+=w*b.no; } }
  const k=4;   // la curva pesa como 4 respuestas; con más respuestas manda lo aprendido
  return (si+k*base)/(si+no+k);
}
async function cargarAprendizaje(){
  if(DEMO) return;
  try{ Object.assign(APR,await pedir('aprendizaje',{servicio:'camara'})); }catch(e){ console.warn(e); }
}
/** Lo que la pantalla está preguntando ahora («¿Eres tú?» o «¿Acerté?»). */
const CONF={p:null, d:0, desc:null, origen:'', tipo:'bienvenida', decision:null};
function prepararEntrenar(p,origen,extra){
  const el=$('#pEntrenar'), cara=extra.cara;
  const pregunta=!!p && !!cara && (origen==='camara' || origen==='confirmar');
  el.hidden=!pregunta; el.classList.remove('respondida');
  CONF.p=pregunta ? p : null;
  if(!pregunta) return;
  Object.assign(CONF,{d:cara.dist, desc:cara.r.descriptor, origen, tipo:extra.tipo||'bienvenida', decision:extra.decision||null});
  $('#pPregunta').textContent=origen==='confirmar' ? '¿Eres tú?' : '¿Acerté?';
  for(const b of el.querySelectorAll('button')) b.disabled=false;
}
/** Respuesta de la persona: se guarda el conteo y su rostro mejora la referencia en memoria. */
async function responder(si){
  const p=CONF.p; if(!p) return;
  const {d,desc,origen,tipo,decision}=CONF;
  CONF.p=null;
  const el=$('#pEntrenar');
  el.classList.add('respondida');
  for(const b of el.querySelectorAll('button')) b.disabled=true;
  $('#pPregunta').textContent=si ? 'Gracias: así aprendo a reconocerte' : 'Gracias, lo tendré en cuenta';
  const mapa=si ? S.rostros : S.negativos, l=mapa.get(p.id)||[];
  l.push(desc); if(l.length>6) l.splice(si?1:0,1);   // la foto de inscripción se conserva
  mapa.set(p.id,l);
  APR[si?'si':'no']++;
  const k=tramo(d); APR.bins[k]=APR.bins[k]||{si:0,no:0}; APR.bins[k][si?'si':'no']++;
  HUD.evento('entrena',{si, coincidencia:coincidencia(d)});
  if(!DEMO) pedir('entrenar',{metodo:'POST', json:{distancia:d, respuesta:si?'si':'no'}, servicio:'camara'}).then(r=>Object.assign(APR,r)).catch(e=>console.warn(e));
  if(si && origen==='confirmar') setTimeout(()=>{ if(S.foco && S.foco.p===p) saludar(p,tipo,decision,null,1); },700);
  else programarCierre(si ? 2400 : 1400);
}
$('#pSi').addEventListener('click',()=>responder(true));
$('#pNo').addEventListener('click',()=>responder(false));
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
  const ahora=performance.now(), presentes=new Set();
  for(const c of VIS.caras){
    if(c.id==null || c.dist>=CONFIG.UMBRAL_ROSTRO+0.08) continue;   // también los casos dudosos: se pregunta «¿Eres tú?»
    presentes.add(c.id);
    const n=(VIS.estables.get(c.id)||0)+1; VIS.estables.set(c.id,n);
    if(n>=3 && S.modo!=='foco' && ahora-(S.saludados.get(c.id)||-1e9)>90000){
      const p=S.personas.get(c.id); if(!p) continue;
      S.saludados.set(c.id,ahora);
      const coin=coincidencia(c.dist);
      if(CONFIG.JEV_CAMARA && !DEMO) decidirConJev(p,c,res.length,n,coin);
      else reaccionar(p,c,coin);
    }
  }
  for(const id of [...VIS.estables.keys()]) if(!presentes.has(id)) VIS.estables.delete(id);
}
const SALUDOS={
  bienvenida:()=>CONFIG.SALUDO,
  regreso:()=>'Qué bueno verte de nuevo, {nombre}',
  charla:p=>{ const ag=p.propuesta&&p.propuesta.agenda; return ag&&ag.hora ? `Te damos la bienvenida, {nombre}. Tu charla es a las ${ag.hora}` : CONFIG.SALUDO; },
  expositor:()=>'Gracias por compartir tu charla, {nombre}'
};
function minutosParaCharla(p){
  const ag=p.propuesta&&p.propuesta.agenda; if(!ag||!ag.fecha||!ag.hora) return null;
  const t=Date.parse(`${ag.fecha}T${ag.hora}:00-05:00`); return isNaN(t) ? null : Math.round((t-Date.now())/60000);
}
function saludar(p,tipo='bienvenida',decision=null,cara=null,coin=1){
  VIS.bienvenidas++;
  const texto=(SALUDOS[tipo]||SALUDOS.bienvenida)(p).replace('{nombre}',nombreHablado(p));
  enfocar(p,'camara',[],{saludo:texto, decision, cara, coincidencia:coin});
  hablar(texto);
  HUD.evento('bienvenida',{p, texto});
}
/** Pide confirmación en silencio: sin foto ni datos si la coincidencia no llega al 80 %. */
function confirmarRostro(p,cara,coin,decision=null,tipo='bienvenida'){
  enfocar(p,'confirmar',[],{cara, coincidencia:coin, decision, tipo});
}
/** Regla sin Jev: saluda con 80 % o más, pregunta desde el 30 % y si no, espera. */
function reaccionar(p,c,coin,decision=null,tipo='bienvenida'){
  if(coin>=FOTO_MIN) saludar(p,tipo,decision,c,coin);
  else if(coin>=0.3) confirmarRostro(p,c,coin,decision,tipo);
}
/**
 * Jev decide qué hacer con un rostro parecido a una persona inscrita: saludar,
 * pedir confirmación en silencio o ignorar. Solo recibe números y el perfil.
 * Si no responde, se aplica la regla de siempre (saludar si pasa el umbral).
 */
async function decidirConJev(p,c,caras,cuadros,coin){
  let r;
  try{
    r=await pedir('jev_camara',{metodo:'POST', servicio:'jev', json:{d1:c.dist, d2:c.dist2, cuadros, calidad:c.r.detection.score,
      ancho:Math.round(c.r.detection.box.width), caras, perfil:p.perfil, ingresos:p.ingresos, charla_min:minutosParaCharla(p), coincidencia:coin}});
  }catch(e){ if(S.modo!=='foco') reaccionar(p,c,coin); return; }
  const decision={motor:'Jev', accion:r.accion, confianza:r.confianza};
  HUD.evento('jev',{texto:`cámara: ${ACCION_TXT[r.accion]||r.accion}`, confianza:r.confianza, ms:r.ms});
  if(S.modo==='foco') return;
  // Jev puede pedir silencio, pero nunca saludar en voz alta ni mostrar la foto sin el 80 % de coincidencia.
  if((r.accion==='ignorar' && r.confianza>=0.5) || coin<0.3) S.saludados.set(p.id,performance.now()-60000);   // reintenta en 30 s
  else if(r.accion==='saludar' && coin>=FOTO_MIN) saludar(p,r.saludo,decision,c,coin);
  else confirmarRostro(p,c,coin,decision,r.saludo);
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
/**
 * Rostros de referencia: las fotos que las personas subieron al inscribirse
 * (campo `foto` de la API de eventos, vía api.php) se convierten en huellas
 * faciales en la memoria del navegador. No se guardan imágenes ni huellas.
 */
const REF={cola:[], hechas:0, conRostro:0, total:0, activo:false};
function encolarRostros(){
  if(!VIS.listo) return;
  for(const p of S.lista){
    if(p.refEncolada || S.rostros.has(p.id)) continue;
    const conFoto=(p.foto && CONFIG.ROSTROS_API && !DEMO) || (CONFIG.FOTO_URL && (p.carnet || CONFIG.FOTO_URL.includes('{id}')));
    if(!conFoto) continue;
    p.refEncolada=true; REF.cola.push(p); REF.total++;
  }
  if(REF.cola.length && !REF.activo) procesarRostros();
}
async function procesarRostros(){
  REF.activo=true;
  if(REF.hechas===0) HUD.evento('texto',{verbo:'rostros', texto:`${fmt(REF.total)} fotos de referencia por revisar`, color:'#4de3ff'});
  while(REF.cola.length && VIS.activo){
    const p=REF.cola.shift();
    try{
      const img=await imagenReferencia(p);
      if(img){
        const r=await faceapi.detectSingleFace(img,new faceapi.TinyFaceDetectorOptions({inputSize:416, scoreThreshold:0.4})).withFaceLandmarks().withFaceDescriptor();
        if(r){ S.rostros.set(p.id,[r.descriptor]); REF.conRostro++; }
      }
    }catch(e){ if(/pase/i.test(e.message||'')) break; }
    REF.hechas++;
    if(REF.hechas===REF.total || REF.hechas%50===0) HUD.evento('texto',{verbo:'rostros', texto:`${fmt(REF.conRostro)} rostros listos de ${fmt(REF.hechas)} fotos`, color:'#4de3ff'});
    await new Promise(r=>setTimeout(r,80));   // deja respirar a la animación y a la cámara
  }
  REF.activo=false;
}
async function imagenReferencia(p){
  if(p.foto && CONFIG.ROSTROS_API && !DEMO) return faceapi.bufferToImage(await pedir('foto',{params:'&id='+p.id, servicio:'fotos', binario:true}));
  if(CONFIG.FOTO_URL) return faceapi.fetchImage(CONFIG.FOTO_URL.replace('{carnet}',encodeURIComponent(p.carnet)).replace('{id}',p.id));
  return null;
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
  else if(e.key==='Escape'){ cerrarBuscador(); if(S.foco){ clearTimeout(S.focoTimer); soltarFoco(); } else ocultarPanel(); }
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
$('#btnIniciar').onclick=()=>{
  $('#inicio').hidden=true;
  S.arranque=Math.min(S.arranque,performance.now()+2600);
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
  const deptos=['Nariño','Nariño','Nariño','Putumayo','Cauca',''];
  const mk=perfil=>({id:id++, nombre:`${pick(nombres)} ${pick(nombres)} ${pick(apellidos)} ${pick(apellidos)}`, perfil:{clave:perfil}, entidad:pick(ents), municipio:pick(munis), departamento:pick(deptos), registro:`2026-10-${String(1+((Math.random()*20)|0)).padStart(2,'0')}`, completo:Math.random()>0.2, carnet:'STIC-2026-'+String(id).padStart(6,'0'), ingresos:Math.random()>0.6?1:0});
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
    S.cargado=true; estado(`${fmt(S.lista.length)} registros en la nube, listos para organizar`,'inicio');
    if(S.arranque<Infinity) S.arranque=Math.max(S.arranque,performance.now()+2200);
    HUD.evento('texto',{verbo:'sync', texto:`${fmt(S.personas.size)} registros recibidos`, color:'#ffd500'});
    encolarRostros(); cargarAprendizaje();
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
      if(nuevos || (S.cambioSector && S.niveles.includes('sector'))){ construirArbol(); if(nuevos) HUD.evento('nuevos',{n:nuevos}); S.estadoClave=''; encolarRostros(); }
      S.cambioSector=false;
    }catch(e){ console.warn('Refresco fallido',e); }
  },CONFIG.REFRESCO_MS);
}

crearPulpo(); crearGlobo(); crearVuelos(); HUD.iniciar(); ajustar(); vozEstado();
if(document.fonts) document.fonts.ready.then(ajustar);   // el ancho de los dígitos depende de la fuente
let tPrev=performance.now();
function cuadro(now){
  requestAnimationFrame(cuadro);
  const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now; const t=now/1000;
  actualizarRotacion(dt);
  actualizarLineas(now);
  actualizarBinario(now,dt);
  programar(now);
  actualizarPulpo(dt,t);
  for(const b of octo.brazos) actualizarBrazo(b,t);
  actualizarPuntas(dt);
  actualizarNodos(dt,t);
  actualizarPool(t);
  scene.updateMatrixWorld();
  actualizarEtiquetas();
  actualizarVuelos(now);
  posicionarGuia();
  renderer.render(scene,camera);
  HUD.cuadro(now,dt);
}
requestAnimationFrame(cuadro);
arrancar();
