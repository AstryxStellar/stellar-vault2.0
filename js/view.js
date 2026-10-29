/* ===== VISTA: genera el HTML y manipula el DOM. Solo lee el modelo. ===== */
const $=s=>document.querySelector(s), money=n=>"$"+n.toFixed(2);
const TRASH='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
/* Foto de fondo del banner (opcional): ruta o data URI. Ej: HERO_BG="img/tienda.jpg" */
const HERO_BG="";
const PET=(w,r,st)=>`<svg class="petal" style="${st}" width="${w}" height="${w}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g fill="#fff" transform="rotate(${r} 20 20)">${[0,1,2,3,4].map(i=>`<ellipse cx="20" cy="9" rx="6" ry="9" transform="rotate(${i*72} 20 20)"/>`).join("")}</g></svg>`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let lastFocus=null;
function setBg(on){$("header").inert=on;$("#app").inert=on}
function openLayer(ov,box,target){if(!ov.classList.contains("on"))lastFocus=document.activeElement;ov.classList.add("on");setBg(true);(target||box.querySelector("button,input:not([disabled])")||box).focus()}
function closeLayer(ov){ov.classList.remove("on");if(!document.querySelector(".ov.on")){setBg(false);if(lastFocus&&document.contains(lastFocus))lastFocus.focus()}}
$("#hlogo").src=LOGO;$("#flogo").src=LOGO;document.head.insertAdjacentHTML("beforeend",`<link rel="icon" href="${LOGO}">`);
function header(){$("#nHome").toggleAttribute("aria-current",false);$("#nCat").toggleAttribute("aria-current",false);$("#nHelp").toggleAttribute("aria-current",false);if(view==="help")$("#nHelp").setAttribute("aria-current","page");if(view==="home")$("#nHome").setAttribute("aria-current","page");if(view==="cat")$("#nCat").setAttribute("aria-current","page");["fav","acct"].forEach(v=>{const b=$(v==="fav"?"#nFav":"#nOrd");view===v?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current")});const ub=$("#userBtn");ub.textContent=USER?"👤 "+(userName()||"Mi cuenta").split(" ")[0]:"Ingresar";ub.setAttribute("aria-label",USER?"Mi cuenta y pedidos":"Iniciar sesión o crear cuenta");ub.onclick=()=>go(USER?"acct":"login");const n=count();$("#cartBtn").textContent=`Carrito: ${n} ${n===1?"ítem":"ítems"}`}
function help(){
 const q=(t,b)=>`<details class="panel"><summary>${t}</summary><div style="margin-top:10px;color:var(--mute)">${b}</div></details>`;
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Ayuda</h1><p class="sub">Respuestas rápidas para comprar en STELLAR VAULT.</p><div class="helpg">
 ${q("¿Cómo compro?","<ol><li><b>Carrito:</b> añade productos y revisa tu carrito.</li><li><b>Entrega y pago:</b> elige envío o retiro, completa tus datos y paga.</li><li><b>Confirmación:</b> recibe tu comprobante en tu correo.</li></ol><p style='margin:8px 0 0'>Con “Comprar ahora” saltas directo al paso 2.</p>")}
 ${q("¿Cómo funciona la entrega?","Enviamos por Servientrega solo dentro de Ecuador. El envío cuesta "+SHIPC()+" y es gratis desde "+FREE()+" USD. También puedes retirar tu pedido en tienda sin costo.")}
 ${q("¿Qué métodos de pago aceptan?","Pago en físico (efectivo al recibir tu pedido o al retirarlo en tienda) y DeUna (pago con QR desde tu celular).")}
 ${q("¿Qué es una preventa?","Es una reserva de un producto que aún no llega. La fecha estimada aparece en la ficha del producto.")}
 ${q("¿Puedo cambiar o quitar productos?","Sí, desde el carrito puedes cambiar la cantidad o eliminar un producto con el ícono de papelera. Si te equivocas, usa “Deshacer”.")}
 ${q("¿Necesito más ayuda?","Escríbenos al correo o al teléfono que aparecen en la sección Contacto, al final de la página.")}</div>`}
function home(){
 $("#app").innerHTML=`<section class="hero2" aria-labelledby="hh" ${HERO_BG?`style="--hbg:linear-gradient(90deg,rgba(42,26,46,.88),rgba(42,26,46,.4)),url('${esc(HERO_BG)}') center/cover"`:""}>
 ${PET(70,10,"left:42%;top:14px")}${PET(44,40,"left:6%;bottom:18px")}${PET(90,-20,"right:30%;bottom:-24px")}${PET(36,15,"right:4%;top:20px")}
 <div class="hx"><p class="kick2">Figuras · Mangas · Más</p><h1 id="hh" tabindex="-1">Bienvenido a STELLAR VAULT</h1>
 <p class="lead">Tu bóveda de anime: mangas, novelas ligeras y figuras coleccionables en un solo lugar.</p>
 <div class="hbtn"><button class="btn" onclick="goCat(['m','n','f'])">Ver catálogo</button><button class="btn ghost" onclick="goCat(['m','n','f'],'pre')">Preventas oficiales</button></div>
 <ul class="chips"><li>Envío gratis desde ${FREE()} USD</li><li><button class="chipbtn" onclick="goCat(['f'])">Figuras coleccionables →</button></li></ul></div>
 <img class="hlogo" src="${LOGO}" alt="Logo de STELLAR VAULT: ilustración anime en un círculo rojo y negro" width="260" height="260">
</section>
 <div class="tiles">${CATS().map(([k,t])=>[k,t,P.findIndex(x=>x.cat===k)]).map(([k,t,i])=>`<button class="tile" onclick="setCat('${k}')" aria-label="Ver ${t} (${P.filter(x=>x.cat===k).length} títulos)" style="--tint:${P[i].tint};--c:${P[i].c}"><div class="tw">${cover(P[i],46)}</div><div><b>${t}</b><span>${P.filter(x=>x.cat===k).length} títulos · Ver todos →</span></div></button>`).join("")}</div>
 
 <h2 class="h2" style="margin:8px 0 16px">Selección de la tienda</h2><div class="grid">${P.filter(p=>p.dest).map(card).join("")}</div>
 <div class="cta"><button class="btn" style="width:auto;padding:0 28px" onclick="go('cat')">Ver todo el catálogo</button></div>`}
function catalog(){
 const list=P.filter(p=>F.cats.has(p.cat)&&(F.av==="all"||(F.av==="stock"?!p.pre:!!p.pre))&&(p.name+p.by+CAT[p.cat]).toLowerCase().includes(F.q.toLowerCase()));
 list.sort((a,b)=>"mnf".indexOf(a.cat)-"mnf".indexOf(b.cat)||a.id-b.id);
 const cnt=c=>P.filter(p=>p.cat===c).length;
 $("#app").innerHTML=`<h1 class="h2" id="cat" tabindex="-1">Catálogo de artículos</h1><p class="sub">Mostrando ${list.length} producto${list.length===1?"":"s"}</p>
 <div class="layout"><aside class="panel"><h2>Filtros</h2><small>Refina tu búsqueda</small>
 <div class="lbl">CATEGORÍAS</div>
 ${CATS().map(([k,t])=>`<label class="opt"><input type="checkbox" ${F.cats.has(k)?"checked":""} onchange="togCat('${k}')"><span>${t}</span><span>${cnt(k)}</span></label>`).join("")}
 <div class="lbl">DISPONIBILIDAD</div>
 ${[["all","Todos"],["stock","En stock"],["pre","Preventa oficial"]].map(([k,t])=>`<label class="opt"><input type="radio" name="av" ${F.av===k?"checked":""} onchange="F.av='${k}';render()"><span>${t}</span></label>`).join("")}
 <button class="reset" onclick="F={cats:new Set(['m','n','f']),av:'all',q:''};$('#q').value='';render()">Restablecer filtros</button>
 <div class="note">Envío gratis desde ${FREE()} USD</div></aside>
 <section>${list.length?CATS().filter(([k])=>list.some(p=>p.cat===k)).map(([k,t])=>{const g=list.filter(p=>p.cat===k);return `<section class="cgroup" aria-labelledby="cg${k}"><h2 class="cgh" id="cg${k}">${t} <span>${g.length} título${g.length===1?"":"s"}</span></h2><div class="grid">${g.map(card).join("")}</div></section>`}).join(""):`<div class="panel empty">No encontramos productos con esos filtros.</div>`}</section></div>`;
}
function coverCss(p,w=100){
 const t=p.name.toUpperCase().split(/ (?=VOL|1\/)/);
 return `<div class="cover ${p.cat==="f"?"fig":""}" style="--w:${w}px" role="img" aria-label="Portada de ${esc(p.name)}"><div><b>${t[0].slice(0,14)}</b>${p.cat==="f"?"FIGURA A ESCALA":(t[1]||"")}</div></div>`}
function img(p,i,w,alt){return `<img class="pi" src="${esc(p.imgs[i])}" alt="${alt}" style="--w:${w}px" referrerpolicy="no-referrer" onerror="fb(this,${p.id},${i},${w})">`}
function fb(el,id,i,w){el.outerHTML=slideCss(P[id],i,w)} // si la imagen no carga, vuelve al marcador CSS
function cover(p,w=100){return p.imgs&&p.imgs[0]?img(p,0,w,"Portada de "+esc(p.name)):coverCss(p,w)}
function card(p){
 const inCart=cart[p.id]||0, out=!p.pre&&inCart>=p.stock;
 const st=p.pre?`<div class="stock p">● ${p.pre}</div>`:p.stock<=3?`<div class="stock w">● Últimas ${p.stock} unidades</div>`:`<div class="stock">● En stock · ${p.stock} unidades</div>`;
 const fv=FAV.has(p.id);
 return `<article class="prod" style="--tint:${p.tint};--tc:${p.tc};--c:${p.c}"><button class="fav${fv?" on":""}" data-fav="${p.id}" onclick="toggleFavUI(${p.id})" aria-pressed="${fv}" aria-label="${fv?"Quitar de favoritos":"Añadir a favoritos"}: ${esc(p.name)}">${fv?"♥":"♡"}</button><a class="thumb" href="#/p/${p.id}" tabindex="-1" aria-hidden="true">${cover(p)}</a>
 <span class="tag">${CAT[p.cat]}</span><h3><a href="#/p/${p.id}">${p.name}</a></h3><p>${p.by}</p><p>${p.pub}</p>${st}${inCart?`<div class="stock" style="color:var(--acc);margin-top:-6px">✓ ${inCart} en tu carrito</div>`:""}
 <div class="price">${money(p.price)} USD<small>IVA incl.</small></div>
 <button class="btn" ${out?"disabled":""} data-add="${p.id}" onclick="add(${p.id})">${out?"Máximo en carrito":p.pre?"Reservar en preventa":"Añadir al carrito"}</button></article>`}
let tt;function toast(m,lbl,fn,kind){const t=$("#toast");t.className="toast "+(kind||"ok");t.innerHTML=`<span aria-hidden="true" class="ti">${kind==="del"?"🗑":kind==="warn"?"🔒":"✓"}</span><span>${esc(m)}</span>${lbl===null?"":`<button onclick="${fn||"openCart()"}">${lbl||"Ver carrito"}</button>`}`;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),5000)}
function drawer(){
 const ids=Object.keys(cart);
 $("#drawer").innerHTML=`<div class="dh"><h2 id="dT">Tu carrito (${count()})</h2><button class="x" onclick="closeCart()" aria-label="Cerrar">✕</button></div>
 ${rm?`<div class="undo" role="status"><span>${esc(P[rm.id].name)} eliminado.</span><button class="link" onclick="undoRm()">Deshacer</button></div>`:""}
 <div style="flex:1">${ids.length?ids.map(id=>{const p=P[id],q=cart[id];return `<div class="item" style="--c:${p.c}"><div class="mini" role="img" aria-label="Portada de ${esc(p.name)}" style="background:url('${esc(p.imgs[0]||'')}') center/cover,var(--c)"></div><div class="t"><a href="#/p/${id}" onclick="closeCart()" style="text-decoration:none">${p.name}</a><div class="qty"><button data-k="${id}m" onclick="setQty(${id},-1)" ${q<=1?'style="visibility:hidden" tabindex="-1" aria-hidden="true"':""} aria-label="Quitar una unidad de ${esc(p.name)}">−</button>${q}<button data-k="${id}p" onclick="setQty(${id},1)" aria-label="Añadir una unidad de ${esc(p.name)}">+</button><button class="trash" onclick="setQty(${id},-99)" aria-label="Eliminar ${esc(p.name)} del carrito">${TRASH}</button></div></div><b>${money(p.price*q)}</b></div>`}).join(""):`<div class="empty">Tu carrito está vacío.<br><button class="btn" style="width:auto;padding:0 20px;margin-top:14px" onclick="closeCart();go('cat')">Ver catálogo</button></div>`}</div>
 ${ids.length>1?`<button class="link" style="margin:0 0 12px;align-self:flex-start" onclick="clearCart()">Vaciar carrito</button>`:""}
 <div class="row">Subtotal<b>${money(sub())}</b></div><div class="row">Envío<b>${money(ship())}</b></div>
 <div class="row t">Total<span>${money(total())} USD</span></div><div class="foot" style="text-align:left;margin:0 0 16px">Envío gratis desde ${FREE()} USD. Envíos por Servientrega solo dentro de Ecuador. IVA incluido.</div>
 <button class="btn" ${ids.length?"":"disabled"} onclick="closeCart();go('co')">Ir a pagar</button>`}
const CF={name:["Nombre completo","","name","Nombre y apellido"],tel:["Teléfono","","tel","Número de celular"],email:["Correo electrónico","","email","Correo para tu comprobante"],prov:["Provincia",""],city:["Ciudad",""],addr:["Dirección","","street-address","Calle principal, número y referencia"],type:["Tipo de vivienda",""],edif:["Edificio o torre (opcional)","","","Nombre del edificio o torre"],piso:["Piso","","","Número de piso"],unit:["N.º de departamento u oficina","","","Número"],ref:["Referencia adicional (opcional)","","","Cerca de…, color de la casa, etc."]};
function login(){
 if(PENDING){$("#app").innerHTML=PENDING.verified
  ?`<div style="max-width:440px;margin:0 auto"><h1 class="h2" tabindex="-1">¡Correo verificado!</h1><div class="panel" style="text-align:center"><div class="check" aria-hidden="true">✓</div><p style="margin:0 0 16px">Tu correo <b>${esc(PENDING.email)}</b> ya quedó verificado y tu cuenta está activa.</p><button class="btn" onclick="goLoginVerified()">Iniciar sesión</button></div></div>`
  :`<div style="max-width:440px;margin:0 auto"><h1 class="h2" tabindex="-1">Revisa tu correo</h1><div class="panel">${PENDING.error?`<div class="err" role="alert" style="margin-top:0">⚠ ${esc(PENDING.error)}</div>`:""}<div class="info" style="margin-top:0">Enviamos un enlace de verificación a <b>${esc(PENDING.email)}</b>. Ábrelo y verás un aviso de que ya quedó verificado; después puedes cerrar esa ventana y volver aquí.</div>${PENDING.seg?`<p class="foot" style="margin:0 0 12px" role="status">⏳ Esperando tu verificación… esta pantalla se actualiza sola.</p>`:""}${PENDING.simulado?`<div class="info">Modo de prueba: el servidor no tiene correo configurado, así que el correo se guardó en <code>server/correos/</code> y su enlace aparece en la consola del servidor.</div>`:""}<button class="btn" onclick="resendMail()">Reenviar correo de verificación</button><p class="foot" style="margin-bottom:0"><button class="alink" onclick="goLoginVerified()">Ya verifiqué, iniciar sesión</button></p></div></div>`;return}
 const up=AM==="up";
 $("#app").innerHTML=`<div style="max-width:440px;margin:0 auto"><h1 class="h2" tabindex="-1">${up?"Crear cuenta":"Iniciar sesión"}</h1><p class="sub">${up?"Crea tu cuenta con tu correo. Te enviaremos un enlace para verificarlo.":"Ingresa para comprar, comentar y guardar favoritos."}</p>
 <form class="panel" onsubmit="authSubmit(event)" novalidate>
 <div class="err" id="aerr" role="alert" tabindex="-1" hidden style="margin-top:0"></div>
 ${up?`<div class="f" style="margin-top:0"><label for="a_n">Nombre completo</label><input id="a_n" autocomplete="name" placeholder="Nombre y apellido"></div>`:""}
 <div class="f" ${up?"":'style="margin-top:0"'}><label for="a_e">Correo electrónico</label><input id="a_e" type="email" autocomplete="email" placeholder="nombre@correo.com"></div>
 <div class="f"><label for="a_p">Contraseña</label><input id="a_p" type="password" autocomplete="${up?"new-password":"current-password"}" placeholder="${up?"Mínimo 6 caracteres":"Tu contraseña"}"></div>
 <button class="btn" style="margin-top:20px" type="submit">${up?"Crear cuenta":"Iniciar sesión"}</button>
 ${up?"":`<p class="foot" style="margin-bottom:0"><button type="button" class="alink" onclick="resendFromLogin()">¿Aún no verificas tu correo? Reenviar enlace de verificación</button></p>`}
 <p class="foot" style="margin-bottom:0">${up?"¿Ya tienes cuenta?":"¿Aún no tienes cuenta?"} <button type="button" class="alink" onclick="setAM('${up?"in":"up"}')">${up?"Inicia sesión":"Crea una aquí"}</button></p></form></div>`}
function acct(){
 const u={name:(ME&&ME.nombre)||USER},os=ordersOf();
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Mis pedidos</h1><p class="sub">${esc(u.name)} · ${esc(USER)} · <button class="alink" onclick="logout()">Cerrar sesión</button></p>
 <div style="max-width:720px">${!ORD.loaded?`<div class="panel empty">Cargando tus pedidos…</div>`:os.length?os.map((o,i)=>[o,i]).reverse().map(([o,i])=>`<article class="panel ord"><div class="oh"><b>${esc(o.no)}</b><span>${new Date(o.date).toLocaleDateString("es-EC",{day:"numeric",month:"long",year:"numeric"})}</span><span class="st ${o.paid?"pd2":""}">${o.paid?"Pagado":"Pago pendiente"}</span></div>
 <ul>${o.items.map(it=>`<li>${esc(it.n)} × ${it.q} · ${money(it.pr*it.q)}</li>`).join("")}</ul>
 <div class="row" style="margin:4px 0">${esc(o.dm)} · ${esc(o.method)}</div><div class="row t" style="margin:8px 0 12px;font-size:16px">Total<span>${money(o.total)} USD</span></div>
 <button class="btn" style="width:auto;padding:0 20px;height:38px" onclick="reorder(${i})">Volver a comprar</button></article>`).join(""):`<div class="panel empty">Aún no tienes pedidos.<br><button class="btn" style="width:auto;padding:0 20px;margin-top:14px" onclick="goCat(['m','n','f'])">Ver catálogo</button></div>`}</div>`}
function checkout(){
 const sel=(k,opts,ph,x="")=>`<select id="co_${k}" required aria-required="true" ${CE[k]?'aria-invalid="true"':""} aria-describedby="co_${k}_e" ${x}><option value="">${ph}</option>${opts.map(o=>`<option ${V[k]===o?"selected":""}>${o}</option>`).join("")}</select>`;
 const ctl=k=>k==="prov"?sel("prov",PROV,"Selecciona tu provincia",'oninput="coProv(this)" autocomplete="address-level1"'):k==="city"?sel("city",CITY[V.prov]||[],V.prov?"Selecciona tu ciudad":"Primero elige la provincia",`oninput="coIn('city',this)" autocomplete="address-level2" ${V.prov?"":"disabled"}`):k==="type"?`<select id="co_type" oninput="setType(this.value)">${["Casa","Departamento","Oficina"].map(o=>`<option ${V.type===o?"selected":""}>${o}</option>`).join("")}</select>`:`<input id="co_${k}" value="${esc(V[k])}" type="${k==="email"?"email":k==="tel"?"tel":"text"}" placeholder="${CF[k][3]||""}" autocomplete="${CF[k][2]||"off"}" ${/opcional/.test(CF[k][0])?"":'required aria-required="true"'} ${CE[k]?'aria-invalid="true"':""} aria-describedby="co_${k}_e" oninput="coIn('${k}',this)">`;
 const fld=(k,w)=>`<div class="f ${CE[k]?"bad":""}" style="${w?"grid-column:1/-1":""}"><label for="co_${k}">${CF[k][0]}</label>${ctl(k)}<small id="co_${k}_e">⚠ ${(typeof CE[k]==="string"&&CE[k])||msgFor("checkout",k)}</small></div>`;
 const mt=(v,t,d)=>`<label class="mt ${DM===v?"on":""}"><input type="radio" name="dm" value="${v}" ${DM===v?"checked":""} onchange="setDM('${v}')"><span><b>${t}</b><small>${d}</small></span></label>`;
 $("#app").innerHTML=`<button class="link back" onclick="go('cat')">← Volver al catálogo</button>${steps(2)}<h1 tabindex="-1">Finaliza tu pedido</h1><p class="sub">Elige cómo recibir tu pedido y cómo pagarlo en esta misma página.</p>
 ${Object.keys(CE).length?`<div class="err" id="coAlert" role="alert">Completa los datos para continuar. Revisa los campos marcados.</div>`:""}
 <div class="layout co" style="grid-template-columns:1fr 400px"><div style="display:grid;gap:24px" ${busy?"inert":""}>
 <section class="panel"><fieldset class="meth" style="margin:0"><legend style="font-size:18px;margin-bottom:12px">Método de entrega</legend>${mt("ship","Envío a domicilio","Por Servientrega · solo dentro de Ecuador · "+SHIPC()+" (gratis desde "+FREE()+")")}${mt("pick","Retiro en tienda","Sin costo · Quito, Ecuador")}</fieldset></section>
 <section class="panel" aria-labelledby="hDir"><h2 id="hDir" style="font-size:18px;margin:0 0 8px">${DM==="ship"?"Dirección de entrega":"Datos de contacto"}</h2>
 ${DM==="pick"?`<div class="info" style="margin-top:0">Retira tu pedido en nuestra tienda en Quito, Ecuador. Te avisaremos por teléfono cuando esté listo.</div>`:`<div class="info" style="margin-top:0">Entregamos por Servientrega, solo dentro de Ecuador.</div>`}
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">${fld("name")}${fld("tel")}${fld("email",1)}${DM==="ship"?fld("prov")+fld("city")+fld("addr",1)+fld("type")+(V.type!=="Casa"?"<div></div>"+fld("edif",1)+fld("piso")+fld("unit"):"")+fld("ref",1):""}</div></section>
 ${payPanel()}
 <section class="panel"><h2 style="font-size:18px;margin:0 0 8px">Artículos en tu pedido</h2>${Object.keys(cart).map(id=>`<div class="item" style="--c:${P[id].c}"><div class="mini" role="img" aria-label="Portada de ${esc(P[id].name)}" style="width:56px;height:56px;background:url('${esc(P[id].imgs[0]||'')}') center/cover,var(--c)"></div><div class="t">${P[id].name}<div style="font-weight:400;font-size:12px;color:var(--mute)">${cart[id]} unidad${cart[id]>1?"es":""}</div></div><b>${money(P[id].price*cart[id])}</b></div>`).join("")}</section></div>
 <aside class="panel sum"><h2 style="font-size:18px;margin:0 0 12px">Resumen del pedido</h2><div class="row">Subtotal<b>${money(sub())}</b></div><div class="row">${DM==="pick"?"Retiro en tienda":"Envío"}<b>${money(ship())}</b></div><div class="row t">Total<span>${money(total())} USD</span></div>
 <button class="btn" style="margin-top:16px" ${busy?"disabled":""} onclick="submitPay()">${busy?`<span class="spin"></span>${M==="fisico"?"Registrando tu pedido…":"Verificando pago con DeUna…"}`:M==="fisico"?"Confirmar pedido":"Ya realicé el pago con DeUna"}</button><button class="btn" style="margin-top:10px;background:none;color:var(--acc);border:2px solid var(--acc)" ${busy?"disabled":""} onclick="go('cat')">Seguir explorando</button><div id="payStat" role="status" tabindex="-1" class="foot">${busy?"Registrando tu pedido. No cierres esta página.":"Revisa tus datos antes de confirmar tu pedido"}</div></aside></div>`}
/* ---- Detalle de producto ---- */
const SL=p=>p.cat==="f"?["Vista frontal","Vista trasera"]:["Portada"];
const nImg=p=>p.cat==="f"?2:1,lab=(p,i)=>SL(p)[i]||"Vista "+(i+1),capt=(p,i)=>nImg(p)>1?`${lab(p,i)} (${i+1} de ${nImg(p)})`:lab(p,i);
function slide(p,i,w){return p.imgs&&p.imgs[i]?img(p,i,w,lab(p,i)+" de "+esc(p.name)):slideCss(p,i,w)}
function slideCss(p,i,w){
 const lab=`${SL(p)[i]} de ${esc(p.name)}`,L='<i></i><i></i><i style="width:70%"></i><i></i><i style="width:45%"></i>';
 if(i===0)return coverCss(p,w);
 if(i===1)return `<div class="cover back ${p.cat==="f"?"fig":""}" style="--w:${w}px" role="img" aria-label="${lab}"><i style="width:55%;height:calc(var(--w)*.06)"></i>${L}${L}</div>`;
 if(i===2)return `<div class="cover pg" style="--w:${w}px" role="img" aria-label="${lab}">${L}${L}${L}</div>`;
 return `<div class="cover tilt ${p.cat==="f"?"fig":""}" style="--w:${w*.85}px" role="img" aria-label="${lab}"><div><b>${esc(p.name.slice(0,18))}</b></div></div>`}
function detail(){
 const p=P[cur],n=nImg(p),cl=CM[p.id]||[],avg=cl.length?cl.reduce((a,c)=>a+c.r,0)/cl.length:0,rm=room(p.id),mx=Math.min(rm,p.pre?CONFIG.max_cantidad_preventa:CONFIG.max_cantidad_stock);
 const sc=(p.name.match(/1\/\d/)||[""])[0], f=p.cat==="f";
 const bul=f?[`Figura coleccionable${sc?" a escala "+sc:""}.`,`${/^Serie/.test(p.pub)?p.pub:"Licencia: "+p.pub}.`,p.pre?`Preventa oficial: ${p.pre.split("· ")[1]}.`:`Stock limitado: ${p.stock} unidades.`]:[`${p.cat==="m"?"Tomo individual":"Volumen de novela ligera"} · ${p.pub}.`,`Autor: ${p.by}.`,"Precio con IVA incluido. Envío gratis desde "+FREE()+" USD."];
 const rows=[[f?"Fabricante":"Autor",p.by],[f?"Licencia":"Editorial",p.pub],["Categoría",CAT[p.cat]],["Formato",f?(sc?`Figura a escala ${sc}`:"Figura coleccionable"):p.cat==="m"?"Tomo (manga)":"Novela ligera"],...(f?[]:[["Idioma",/inglés|Yen|Seven/i.test(p.pub)?"Inglés":/español/i.test(p.pub)?"Español":"Por confirmar"]]),["Disponibilidad",p.pre||(p.stock+" unidades")],["Precio",money(p.price)+" USD (IVA incl.)"]];
 const rel=P.filter(x=>x.cat===p.cat&&x.id!==p.id).slice(0,3);
 $("#app").innerHTML=`<nav class="crumb" aria-label="Ruta"><button onclick="go('home')">Inicio</button> › <button onclick="go('cat')">Catálogo</button> › <button onclick="setCat('${p.cat}')">${CATP[p.cat]}</button> › <span aria-current="page">${p.name}</span></nav>
 <button class="link back" style="margin-left:0" onclick="go('cat')">← Volver al catálogo</button>
 <div class="pd" style="--tint:${p.tint};--tc:${p.tc};--c:${p.c}">
 <section aria-label="Galería de imágenes"><div class="gal">${n>1?`<div class="th" role="group" aria-label="Vistas del producto">${Array.from({length:n},(_,i)=>i).map(i=>`<button aria-pressed="${i===GI}" aria-label="${lab(p,i)}" onclick="pick(${i})">${slide(p,i,34)}</button>`).join("")}</div>`:""}
 <div style="flex:1"><div class="big" id="bigimg">${slide(p,GI,280)}</div><div class="cap" id="cap" aria-live="polite">${capt(p,GI)}</div></div></div></section>
 <section><span class="tag">${CAT[p.cat]}</span><h1 tabindex="-1" style="margin-top:10px">${p.name}</h1>
 <p style="margin:0 0 8px;color:var(--mute)">${/confirmar/.test(p.by)?"":`por <b style="color:var(--acc)">${p.by}</b> · `}${p.pub}</p>
 ${cl.length?`<div><span class="stars" role="img" aria-label="Calificación promedio ${avg.toFixed(1)} de 5">${"★".repeat(Math.round(avg))}${"☆".repeat(5-Math.round(avg))}</span> <small>${avg.toFixed(1)} · ${cl.length} comentario${cl.length>1?"s":""}</small></div>`:""}<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
 <div style="font-size:24px;font-weight:800">${money(p.price)} <small style="font:400 13px Inter,Arial,sans-serif;color:var(--mute)">USD · IVA incluido</small></div>
 <h2 style="font-size:16px;margin:18px 0 4px">Acerca de este artículo</h2><ul>${bul.map(b=>`<li>${b}</li>`).join("")}</ul></section>
 <aside class="panel buy" aria-label="Comprar"><div class="big-p">${money(p.price)}</div>
 <div style="font-size:13px;color:var(--mute);margin:4px 0 10px">${p.price>=CONFIG.envio_gratis_desde?"Envío gratis":"Envío desde "+SHIPC()+" · gratis desde "+FREE()+" USD"} por Servientrega (solo Ecuador)<br>O retira gratis en tienda (Quito)</div>
 <div class="stock ${p.pre?"p":p.stock<=3?"w":""}" style="margin:0 0 8px">● ${p.pre||(p.stock<=3?"Últimas "+p.stock+" unidades":"En stock")}</div>
 ${rm>0?`<label for="qty" style="font-weight:700;font-size:13px;display:block">Cantidad</label><select id="qty">${Array.from({length:mx},(_,i)=>`<option>${i+1}</option>`).join("")}</select>
 <button class="btn" data-add="buy" onclick="add(${p.id},+$('#qty').value)">${p.pre?"Reservar en preventa":"Añadir al carrito"}</button><button class="btn alt" onclick="buy(${p.id})">Comprar ahora</button>`:`<p style="font-weight:600">Ya tienes el máximo disponible en tu carrito.</p><button class="btn" onclick="openCart()">Ver carrito</button>`}
 <button class="btn alt" data-fav="${p.id}" onclick="toggleFavUI(${p.id})" aria-pressed="${FAV.has(p.id)}" style="margin-top:10px">${FAV.has(p.id)?"♥ Quitar de favoritos":"♡ Añadir a favoritos"}</button>
 <div class="foot" style="margin-top:12px">🔒 Pago seguro · Conexión cifrada TLS</div></aside></div>
 <section class="sec" aria-labelledby="hd"><h2 id="hd">Descripción</h2><p style="max-width:720px">${D[p.id]}</p></section>
 <section class="sec" aria-labelledby="hs"><h2 id="hs">Detalles del producto</h2><table class="sp"><tbody>${rows.map(([a,b])=>`<tr><th scope="row">${a}</th><td>${b}</td></tr>`).join("")}</tbody></table></section>
 <section class="sec" aria-labelledby="ho"><h2 id="ho" tabindex="-1">Comentarios${cl.length?` (${cl.length})`:""}</h2>
 ${USER?`<form class="cform" onsubmit="addCom(event,${p.id})" novalidate>
 <p style="margin:0">Comentando como <b>${esc(userName())}</b></p>
 <div class="f"><label for="cm_r">Calificación</label><select id="cm_r"><option value="5">★★★★★ · Excelente</option><option value="4">★★★★☆ · Muy bueno</option><option value="3">★★★☆☆ · Bueno</option><option value="2">★★☆☆☆ · Regular</option><option value="1">★☆☆☆☆ · Malo</option></select></div>
 <div class="f"><label for="cm_t">Tu comentario sobre este producto</label><textarea id="cm_t" rows="4" maxlength="500" placeholder="Cuéntanos qué te pareció" required aria-required="true" aria-describedby="cm_te"></textarea><small id="cm_te">⚠ ${msgFor("comentario","texto")}</small></div>
 <button class="btn" style="width:auto;padding:0 24px;margin-top:14px" type="submit">Publicar comentario</button></form>`:`<div class="panel" style="max-width:640px">Para comentar necesitas <button class="alink" onclick="AM='in';go('login')">iniciar sesión</button> o <button class="alink" onclick="AM='up';go('login')">crear una cuenta</button>.</div>`}
 <p id="cstat" role="status" aria-live="polite" style="font-size:13px;color:var(--green);font-weight:600;min-height:20px"></p>
 ${cl.length?[...cl].reverse().map(c=>`<article class="rev"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${esc(c.n)}</b> <span class="stars" role="img" aria-label="${c.r} de 5">${"★".repeat(c.r)}${"☆".repeat(5-c.r)}</span><div style="font-size:12px;color:var(--mute)">${new Date(c.d).toLocaleDateString("es-EC",{day:"numeric",month:"long",year:"numeric"})}</div></div>${ME&&c.uid===ME.id?`<button class="trash" aria-label="Eliminar tu comentario" onclick="delCom(${p.id},${c.id})">${TRASH}</button>`:""}</div><p style="margin:8px 0 0;white-space:pre-wrap">${esc(c.t)}</p></article>`).join(""):`<p style="color:var(--mute)">Aún no hay comentarios. ¡Sé el primero en opinar!</p>`}</section>
 ${rel.length?`<section class="sec" aria-labelledby="hr"><h2 id="hr">También te puede interesar</h2><div class="grid">${rel.map(card).join("")}</div></section>`:""}`}
const steps=n=>`<ol class="steps" aria-label="Progreso de la compra">${["Carrito","Entrega y pago","Confirmación"].map((t,i)=>`<li class="${i+1<n?"ok":i+1===n?"cur":""}" ${i+1===n?'aria-current="step"':""}>${i+1<n?"✓ ":""}${i+1}. ${t}</li>`).join("")}</ol>`;
function qr(){const n=25;let x=Math.round(total()*100)+7;const rnd=()=>(x=(x*1103515245+12345)&0x7fffffff)/0x7fffffff;let d="";
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){const r0=i<8?0:i>=n-8?n-7:-1,c0=j<8?0:j>=n-8?n-7:-1;let on;
  if(r0>=0&&c0>=0&&!(r0>0&&c0>0)){const a=i-r0,b=j-c0;on=(a>=0&&a<7&&b>=0&&b<7)&&(a===0||a===6||b===0||b===6||(a>1&&a<5&&b>1&&b<5))}else on=rnd()>.55;
  if(on)d+=`M${j} ${i}h1v1h-1z`}
 return `<svg class="qr" viewBox="-1 -1 27 27" role="img" aria-label="Código QR de demostración para pagar con DeUna"><path d="${d}" fill="#2a1a2e"/></svg>`}
function payPanel(){
 const mt=(v,t,d)=>`<label class="mt ${M===v?"on":""}"><input type="radio" name="m" value="${v}" ${M===v?"checked":""} onchange="setM('${v}')"><span><b>${t}</b><small>${d}</small></span></label>`;
 const fis=`<div class="info">${DM==="pick"?"Pagas en efectivo en la tienda cuando retiras tu pedido.":"Pagas en efectivo cuando recibes tu pedido por Servientrega."} No necesitas ingresar datos de tarjeta.</div><p style="margin:12px 0 0;font-weight:700">Monto a pagar en físico: ${money(total())} USD</p>`;
 const deuna=`<div class="info">Paga desde tu celular con la app DeUna, sin escribir los datos de tu tarjeta.</div>${qr()}<p class="qrc">QR de demostración (no es un código real)</p>
 <ol class="dsteps"><li>Abre la app DeUna y toca “Pagar con QR”.</li><li>Escanea el código y revisa el monto.</li><li>Confirma el pago y vuelve aquí.</li></ol>`;
 return `<section class="panel" aria-labelledby="hPay"><h2 id="hPay" style="font-size:18px;margin:0 0 12px">Pago</h2>
 <fieldset class="meth" style="margin:0"><legend>Método de pago</legend>${mt("fisico","Pago en físico","Efectivo al recibir o al retirar")}${mt("deuna","DeUna","Pago con QR desde el celular")}</fieldset>
 ${M==="fisico"?fis:deuna}</section>`}
function done(){
 const pend=!order.paid,pick=order.dm==="Retiro en tienda";
 $("#app").innerHTML=`<div style="max-width:640px;margin:0 auto">${steps(3)}<div class="ok-t"><div class="check" aria-hidden="true">✓</div><h1 tabindex="-1">¡Pedido confirmado!</h1><p style="color:var(--mute);font-size:13px;margin:0">${pend?`Pagarás ${money(order.total)} USD en efectivo ${pick?"al retirarlo en tienda":"al recibirlo"}.`:"Tu pago con DeUna fue verificado."} Enviamos el comprobante a <b>${esc(order.email)}</b>.</p></div>
 <div class="rec"><h2 style="margin:0 0 4px;font-size:15px;display:flex;justify-content:space-between">Comprobante<span style="color:${pend?"#b45309":"var(--green)"};font-size:12px">${pend?"PAGO PENDIENTE":"PAGADO"}</span></h2>
 <div class="row">N.º de pedido<b>${order.no}</b></div><div class="row">Método de pago<b>${order.method}</b></div><div class="row">Entrega<b>${order.dm}</b></div><div class="row">Artículos<b>${order.units} unidad${order.units>1?"es":""}</b></div><div class="row">${pend?"Total a pagar":"Total pagado"}<b>${money(order.total)} USD</b></div></div>
 ${USER?`<p style="text-align:center"><button class="alink" onclick="go('acct')">Ver mi historial de pedidos</button></p>`:`<p style="text-align:center;color:var(--mute);font-size:13px">¿Quieres ver este pedido después? <button class="alink" onclick="AM='up';go('login')">Crea una cuenta</button> con el correo ${esc(order.email)}.</p>`}
 <button class="btn g" onclick="finish()">Finalizar y volver al inicio</button></div>`}
function markCommentErrors(bad){for(const k of["t"]){const f=$("#cm_"+k).closest(".f"),i=$("#cm_"+k);f.classList.toggle("bad",bad[k]);bad[k]?i.setAttribute("aria-invalid","true"):i.removeAttribute("aria-invalid")}}

function favs(){
 const list=[...FAV].map(i=>P[i]).filter(Boolean);
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Mis favoritos</h1><p class="sub">${list.length?list.length+" producto"+(list.length===1?"":"s")+" guardado"+(list.length===1?"":"s"):"Toca el ♡ de un producto para guardarlo aquí."}</p>
 ${list.length?`<div class="grid">${list.map(card).join("")}</div>`:`<div class="panel empty">Aún no tienes favoritos.<br><button class="btn" style="width:auto;padding:0 20px;margin-top:14px" onclick="goCat(['m','n','f'])">Ver catálogo</button></div>`}`}
