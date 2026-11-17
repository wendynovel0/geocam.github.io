'use strict';
const $=id=>document.getElementById(id);
let mapa,marcador,circulo,posActual=null,stream=null,fotoBlob=null,urls=[];

/* ---------- Privacidad ---------- */
const consent=()=>{try{return localStorage.getItem('consent')==='1'}catch{return false}};
if(consent())$('consentimiento').hidden=true;
$('aceptar').onclick=()=>{try{localStorage.setItem('consent','1')}catch{}$('consentimiento').hidden=true};

/* ---------- IndexedDB ---------- */
const dbp=new Promise((ok,err)=>{
  const r=indexedDB.open('asistente-db',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('registros',{keyPath:'id',autoIncrement:true}).createIndex('fecha','fecha');
  r.onsuccess=()=>ok(r.result);r.onerror=()=>err(r.error);
});
const tx=async(modo,fn)=>{const db=await dbp;return new Promise((ok,err)=>{const t=db.transaction('registros',modo),s=t.objectStore('registros'),q=fn(s);t.oncomplete=()=>ok(q&&q.result);t.onerror=()=>err(t.error)})};
const agregar=r=>tx('readwrite',s=>s.add(r));
const todos=()=>tx('readonly',s=>s.getAll());
const borrar=id=>tx('readwrite',s=>s.delete(id));
const limpiar=()=>tx('readwrite',s=>s.clear());

/* ---------- Mapa ---------- */
function iniciarMapa(){
  if(typeof L==='undefined'){$('mapa').textContent='No se pudo cargar Leaflet (¿sin conexión la primera vez?).';return}
  mapa=L.map('mapa').setView([20.97,-89.62],12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(mapa);
}
function pintar(lat,lng,acc){
  if(!mapa)return;
  if(marcador){mapa.removeLayer(marcador);mapa.removeLayer(circulo)}
  marcador=L.marker([lat,lng],{icon:L.divIcon({className:'pin',html:'<span></span>',iconSize:[28,28]})}).addTo(mapa).bindPopup('Estás aquí').openPopup();
  circulo=L.circle([lat,lng],{radius:acc||20,color:'#111',weight:2,fillColor:'#c6f432',fillOpacity:.25}).addTo(mapa);
  mapa.setView([lat,lng],16);
}

/* ---------- Geolocalización ---------- */
const mensajesGeo={1:'Permiso de ubicación denegado. Actívalo en el candado de la barra de direcciones (o Ajustes del sitio) y vuelve a intentar.',2:'No se pudo determinar la ubicación. Revisa el GPS o tu conexión.',3:'Se agotó el tiempo de espera. Intenta de nuevo.'};
function ubicar(){
  const al=$('alertaPerm');al.hidden=true;
  if(!('geolocation' in navigator)){al.textContent='Tu navegador no soporta geolocalización.';al.hidden=false;return}
  $('infoUbic').textContent='Obteniendo ubicación…';
  navigator.geolocation.getCurrentPosition(p=>{
    posActual={lat:p.coords.latitude,lng:p.coords.longitude,precision:p.coords.accuracy};
    $('infoUbic').textContent=`Lat ${posActual.lat.toFixed(5)}, Lng ${posActual.lng.toFixed(5)} (±${Math.round(posActual.precision)} m)`;
    $('btnGuardar').disabled=false;pintar(posActual.lat,posActual.lng,posActual.precision);
  },e=>{$('infoUbic').textContent='Sin ubicación.';al.textContent=mensajesGeo[e.code]||e.message;al.hidden=false},
  {enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function coordsGuardar(){
  if(!posActual)return null;
  const d=$('aprox').checked?2:6;
  return{lat:+posActual.lat.toFixed(d),lng:+posActual.lng.toFixed(d),precision:Math.round(posActual.precision),aproximada:$('aprox').checked};
}
$('btnUbicar').onclick=ubicar;
$('btnGuardar').onclick=async()=>{await agregar({tipo:'ubicacion',fecha:Date.now(),...coordsGuardar()});render()};

/* ---------- Cámara ---------- */
const mensajesCam={NotAllowedError:'Permiso de cámara denegado. Actívalo en los ajustes del sitio o usa la opción de seleccionar archivo.',NotFoundError:'No se encontró ninguna cámara.',NotReadableError:'La cámara está en uso por otra aplicación.'};
async function abrirCam(){
  const al=$('alertaCam');al.hidden=true;
  if(!navigator.mediaDevices?.getUserMedia){al.textContent='Cámara no disponible (se requiere HTTPS o localhost). Usa la opción de archivo.';al.hidden=false;return}
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
    $('video').srcObject=stream;$('video').hidden=false;$('vista').hidden=true;
    $('btnFoto').disabled=false;$('btnCerrarCam').disabled=false;
  }catch(e){al.textContent=mensajesCam[e.name]||('Error de cámara: '+e.message);al.hidden=false}
}
function cerrarCam(){stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('video').hidden=true;$('btnFoto').disabled=true;$('btnCerrarCam').disabled=true}
function mostrarVista(blob){fotoBlob=blob;const u=URL.createObjectURL(blob);urls.push(u);$('vista').src=u;$('vista').hidden=false;$('btnGuardarFoto').disabled=false}
$('btnCam').onclick=abrirCam;$('btnCerrarCam').onclick=cerrarCam;
$('btnFoto').onclick=()=>{
  const v=$('video'),c=$('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
  c.getContext('2d').drawImage(v,0,0);c.toBlob(b=>{mostrarVista(b);cerrarCam()},'image/jpeg',.8);
};
$('archivo').onchange=e=>{const f=e.target.files[0];if(f)mostrarVista(f)};
$('btnGuardarFoto').onclick=async()=>{
  if(!fotoBlob)return;
  let c={};
  if($('conUbic').checked){if(!posActual){$('alertaCam').textContent='Primero obtén tu ubicación o desmarca "Incluir ubicación".';$('alertaCam').hidden=false;return}c=coordsGuardar()}
  await agregar({tipo:'foto',fecha:Date.now(),nota:$('nota').value.trim(),foto:fotoBlob,...c});
  fotoBlob=null;$('vista').hidden=true;$('nota').value='';$('btnGuardarFoto').disabled=true;$('alertaCam').hidden=true;render();
};
window.addEventListener('pagehide',cerrarCam);

/* ---------- Registros ---------- */
async function render(){
  urls.forEach(u=>u!==$('vista').src&&URL.revokeObjectURL(u));urls=[];
  const regs=(await todos()).sort((a,b)=>b.fecha-a.fecha),ul=$('lista');ul.replaceChildren();
  $('conteo').textContent=`(${regs.length})`;
  for(const r of regs){
    const li=document.createElement('li');let m;
    if(r.foto){m=document.createElement('img');m.alt='Foto guardada';m.className='blob';const u=URL.createObjectURL(r.foto);urls.push(u);m.src=u}
    else{m=document.createElement('div');m.className='ico blob';m.textContent='📍'}
    const t=document.createElement('div');t.className='txt';
    t.textContent=`${new Date(r.fecha).toLocaleString()}${r.lat!=null?` · ${r.lat}, ${r.lng}${r.aproximada?' (aprox.)':''}`:''}${r.nota?` · ${r.nota}`:''}`;
    const s=document.createElement('span');s.className='sticker';s.textContent=r.foto?'FOTO':'UBICACIÓN';t.prepend(s);
    const bm=document.createElement('button');bm.textContent='🗺️';bm.title='Ver en mapa';bm.disabled=r.lat==null;
    bm.onclick=()=>{if(mapa){mapa.setView([r.lat,r.lng],16);L.popup().setLatLng([r.lat,r.lng]).setContent(r.tipo).openOn(mapa);scrollTo({top:0,behavior:'smooth'})}};
    const bb=document.createElement('button');bb.textContent='🗑️';bb.title='Eliminar';bb.className='peligro';
    bb.onclick=async()=>{await borrar(r.id);render()};
    li.append(m,t,bm,bb);ul.append(li);
  }
}
$('btnBorrarTodo').onclick=async()=>{if(confirm('¿Borrar TODOS los registros y fotos de este dispositivo?')){await limpiar();render()}};
$('btnExportar').onclick=async()=>{
  const datos=(await todos()).map(({foto,...r})=>({...r,tieneFoto:!!foto}));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}));
  a.download='registros.json';a.click();URL.revokeObjectURL(a.href);
};

/* ---------- Red y SW ---------- */
const red=()=>{$('estadoRed').textContent=navigator.onLine?'en línea':'sin conexión';$('estadoRed').classList.toggle('off',!navigator.onLine)};
addEventListener('online',red);addEventListener('offline',red);red();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(console.error));
iniciarMapa();render();
