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
function header(){const ub=$("#userBtn");ub.innerHTML=USER?avatarHtml(ME,24)+"<span>"+esc((userName()||"Mi cuenta").split(" ")[0])+"</span>":"Ingresar";ub.setAttribute("aria-label",USER?"Mi perfil":"Iniciar sesión o crear cuenta");ub.setAttribute("aria-expanded","false");ub.onclick=e=>{e.stopPropagation();USER?toggleUserMenu():go("login")};fillUserMenu();const n=count();$("#cartBtn").textContent=`Carrito: ${n} ${n===1?"ítem":"ítems"}`}
function help(){
 const q=(t,b)=>`<details class="panel"><summary>${t}</summary><div style="margin-top:10px;color:var(--mute)">${b}</div></details>`;
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Ayuda</h1><p class="sub">Respuestas rápidas para comprar en STELLAR VAULT.</p><div class="helpg">
 ${q("¿Cómo compro?","<ol><li><b>Carrito:</b> añade productos y revisa tu carrito.</li><li><b>Entrega y pago:</b> elige envío o retiro, completa tus datos y paga.</li><li><b>Confirmación:</b> recibe tu comprobante en tu correo.</li></ol><p style='margin:8px 0 0'>Con “Comprar ahora” saltas directo al paso 2.</p>")}
 ${q("¿Cómo funciona la entrega?","Enviamos por Servientrega solo dentro de Ecuador. El envío cuesta "+SHIPC()+" y es gratis desde "+FREE()+" USD. También puedes retirar tu pedido en tienda sin costo.")}
 ${q("¿Qué métodos de pago aceptan?","Pago en físico (efectivo al recibir tu pedido o al retirarlo en tienda) y DeUna (pago con QR desde tu celular).")}
 ${q("¿Qué es una preventa?","Es una reserva de un producto que aún no llega. La fecha estimada aparece en la ficha del producto.")}
 ${q("¿Puedo cambiar o quitar productos?","Sí, desde el carrito puedes cambiar la cantidad o eliminar un producto con el ícono de papelera. Si te equivocas, usa “Deshacer”.")}
 ${q("¿Necesito más ayuda?","Escríbenos al correo o al teléfono que aparecen en la sección Contacto, al final de la página.")}</div>`}
function homeRow(t,sub,html,link){
 if(!html)return"";
 return `<section class="hrow"><div class="sech"><div><h2 class="h2" style="margin:0">${t}</h2><p class="sub" style="margin:2px 0 0">${sub}</p></div>${link?`<button class="alink" onclick="${link}">Ver todas →</button>`:""}</div>${html}</section>`}
const gridOf=l=>l.length?`<div class="grid">${l.map(card).join("")}</div>`:"";
function packCard(k){
 const sum=packSum(k),price=packPrice(k);
 return `<article class="pack" aria-label="${esc(k.name)}"><div class="pk-top"><span class="pk-pct">📦 −${k.pct}%</span><h3>${esc(k.name)}</h3></div>
 <div class="pk-covers">${k.ids.map(i=>`<a href="${prodUrl(i)}" class="pk-c" tabindex="-1" aria-hidden="true">${cover(P[i],70)}</a>`).join('<span class="pk-plus" aria-hidden="true">+</span>')}</div>
 <ul class="pk-l">${k.ids.map(i=>`<li><a href="${prodUrl(i)}">${esc(P[i].name)}</a><span>${money(P[i].price)}</span></li>`).join("")}</ul>
 <div class="price"><s class="was">${money(sum)}</s> ${money(price)} USD<small>Ahorras ${money(sum-price)}</small></div>
 ${k.ids.some(i=>P[i].pre)?`<div class="stock p">● Incluye preventa</div>`:`<div class="stock">● Todo en stock</div>`}
 <button class="btn" onclick="addPack(${k.id})">Añadir pack al carrito</button></article>`}
function ofertas(){
 const reb=P.filter(p=>p.was).sort((a,b)=>pctOff(b)-pctOff(a));
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Ofertas</h1><p class="sub">Dos formas de ahorrar: packs de una misma serie y rebajas en productos elegidos.</p>
 <section class="hrow" aria-labelledby="ofp"><div class="sech"><div><h2 class="h2" id="ofp" style="margin:0">📦 Packs (${PACKS.length})</h2><p class="sub" style="margin:2px 0 0">Compra los productos de una misma serie juntos y llévatelos con descuento.</p></div></div><div class="grid packs">${PACKS.map(packCard).join("")}</div></section>
 <section class="hrow" aria-labelledby="ofr"><div class="sech"><div><h2 class="h2" id="ofr" style="margin:0">🏷️ Rebajas (${reb.length})</h2><p class="sub" style="margin:2px 0 0">Descuentos en productos elegidos de cada categoría.</p></div><button class="alink" onclick="goCat(['m','n','f'],'rebaja')">Ver en el catálogo →</button></div>${gridOf(reb)}</section>`}
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
 
 ${homeRow("🏷️ En rebaja","Descuentos en productos elegidos de cada categoría",gridOf(P.filter(p=>p.was).sort((a,b)=>pctOff(b)-pctOff(a)).slice(0,4)),"go('ofer')")}
 ${homeRow("📦 Packs","Figuras y libros de una misma serie con descuento",PACKS.length?`<div class="grid packs">${[...PACKS].sort((a,b)=>(packSum(b)-packPrice(b))-(packSum(a)-packPrice(a))).slice(0,3).map(packCard).join("")}</div>`:"","go('ofer')")}
 ${homeRow("🛒 Los más comprados","Lo que más se llevan nuestros clientes",gridOf(P.filter(p=>p.sold>0).sort((a,b)=>b.sold-a.sold).slice(0,4)))}
 <h2 class="h2" style="margin:8px 0 16px">Selección de la tienda</h2><div class="grid">${P.filter(p=>p.dest).map(card).join("")}</div>
 <div class="cta"><button class="btn" style="width:auto;padding:0 28px" onclick="go('cat')">Ver todo el catálogo</button></div>`}
function catalog(){
 const list=P.filter(p=>F.cats.has(p.cat)&&(F.av==="all"||(F.av==="stock"?!p.pre:F.av==="pack"?packsOf(p.id).length>0:F.av==="rebaja"?!!p.was:!!p.pre))&&(p.name+p.by+CAT[p.cat]).toLowerCase().includes(F.q.toLowerCase()));
 list.sort((a,b)=>"mnf".indexOf(a.cat)-"mnf".indexOf(b.cat)||a.id-b.id);
 const cnt=c=>P.filter(p=>p.cat===c).length;
 const key=[...F.cats].join()+"|"+F.av+"|"+F.q;if(key!==catKey){catKey=key;catPage=1}
 const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));if(catPage>pages)catPage=pages;
 const from=(catPage-1)*PAGE_SIZE,part=list.slice(from,from+PAGE_SIZE);
 $("#app").innerHTML=`<h1 class="h2" id="cat" tabindex="-1">Catálogo de artículos</h1><p class="sub">${list.length?`Mostrando ${from+1}–${from+part.length} de ${list.length} producto${list.length===1?"":"s"}`:"Sin resultados"}</p>
 <div class="layout"><aside class="panel"><h2>Filtros</h2><small>Refina tu búsqueda</small>
 <div class="lbl">CATEGORÍAS</div>
 ${CATS().map(([k,t])=>`<label class="opt"><input type="checkbox" ${F.cats.has(k)?"checked":""} onchange="togCat('${k}')"><span>${t}</span><span>${cnt(k)}</span></label>`).join("")}
 <div class="lbl">DISPONIBILIDAD</div>
 ${[["all","Todos",P.length],["stock","En stock",P.filter(p=>!p.pre).length],["pre","Preventa oficial",P.filter(p=>p.pre).length],["pack","📦 En pack",P.filter(p=>packsOf(p.id).length).length],["rebaja","🏷️ Rebajas",P.filter(p=>p.was).length]].map(([k,t,n])=>`<label class="opt"><input type="radio" name="av" ${F.av===k?"checked":""} onchange="F.av='${k}';render()"><span>${t}</span><span>${n}</span></label>`).join("")}
 <button class="reset" onclick="F={cats:new Set(['m','n','f']),av:'all',q:''};$('#q').value='';render()">Restablecer filtros</button>
 <div class="note">Envío gratis desde ${FREE()} USD</div></aside>
 <section>${list.length?CATS().filter(([k])=>part.some(p=>p.cat===k)).map(([k,t])=>{const g=part.filter(p=>p.cat===k),tot=list.filter(p=>p.cat===k).length;return `<section class="cgroup" aria-labelledby="cg${k}"><h2 class="cgh" id="cg${k}">${t} <span>${tot} título${tot===1?"":"s"}</span></h2><div class="grid">${g.map(card).join("")}</div></section>`}).join("")+pager(list.length,catPage,PAGE_SIZE,"cat"):`<div class="panel empty">No encontramos productos con esos filtros.</div>`}</section></div>`;
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
 return `<article class="prod" style="--tint:${p.tint};--tc:${p.tc};--c:${p.c}"><button class="fav${fv?" on":""}" data-fav="${p.id}" onclick="toggleFavUI(${p.id})" aria-pressed="${fv}" aria-label="${fv?"Quitar de favoritos":"Añadir a favoritos"}: ${esc(p.name)}">${fv?"♥":"♡"}</button>${packsOf(p.id).length?`<span class="ribbon pk">📦 En pack</span>`:""}${p.was?`<span class="ribbon dsc">🏷️ −${pctOff(p)}%</span>`:""}<a class="thumb" href="${prodUrl(p.id)}" tabindex="-1" aria-hidden="true">${cover(p)}</a>
 <span class="tag">${CAT[p.cat]}</span><h3><a href="${prodUrl(p.id)}">${p.name}</a></h3><p>${p.by}</p><p>${p.pub}</p>${st}${inCart?`<div class="stock" style="color:var(--acc);margin-top:-6px">✓ ${inCart} en tu carrito</div>`:""}
 <div class="price">${priceHtml(p)} USD<small>IVA incl.</small></div>${packsOf(p.id).length?`<div class="promo-n">En pack: hasta −${Math.max(...packsOf(p.id).map(k=>k.pct))}%</div>`:""}
 <button class="btn" ${out?"disabled":""} data-add="${p.id}" onclick="add(${p.id})">${out?"Máximo en carrito":p.pre?"Reservar en preventa":"Añadir al carrito"}</button></article>`}
let tt;function toast(m,lbl,fn,kind){if(typeof LEAVING!=="undefined"&&LEAVING){SS.set("sv_toast",[m,lbl,fn,kind]);return} // el aviso se muestra en la página siguiente
 const t=$("#toast");t.className="toast "+(kind||"ok");t.innerHTML=`<span aria-hidden="true" class="ti">${kind==="del"?"🗑":kind==="warn"?"🔒":"✓"}</span><span>${esc(m)}</span>${lbl===null?"":`<button onclick="${fn||"openCart()"}">${lbl||"Ver carrito"}</button>`}`;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),5000)}
// Líneas del resumen con el descuento de cada pack aplicado (solo si hay)
function promoRows(){const r=packInfo();return r.total>0?`<div class="row">Productos<b>${money(bruto())}</b></div>${r.lineas.map(l=>`<div class="row promo-r">📦 ${esc(l.nombre)}${l.sets>1?" ×"+l.sets:""}<b>−${money(l.monto)}</b></div>`).join("")}`:""}
const pctOff=p=>Math.round((1-p.price/p.was)*100);
const priceHtml=p=>`${p.was?`<s class="was" aria-label="Precio anterior ${money(p.was)}">${money(p.was)}</s> `:""}${money(p.price)}`;
function drawer(){
 const ids=Object.keys(cart);
 $("#drawer").innerHTML=`<div class="dh"><h2 id="dT">Tu carrito (${count()})</h2><button class="x" onclick="closeCart()" aria-label="Cerrar">✕</button></div>
 ${rm?`<div class="undo" role="status"><span>${esc(P[rm.id].name)} eliminado.</span><button class="link" onclick="undoRm()">Deshacer</button></div>`:""}
 <div style="flex:1">${ids.length?ids.map(id=>{const p=P[id],q=cart[id];return `<div class="item" style="--c:${p.c}"><div class="mini" role="img" aria-label="Portada de ${esc(p.name)}" style="background:url('${esc(p.imgs[0]||'')}') center/cover,var(--c)"></div><div class="t"><a href="${prodUrl(id)}" onclick="closeCart()" style="text-decoration:none">${p.name}</a>${p.promo?`<span class="promo-t">3x2</span>`:""}<div class="qty"><button data-k="${id}m" onclick="setQty(${id},-1)" ${q<=1?'style="visibility:hidden" tabindex="-1" aria-hidden="true"':""} aria-label="Quitar una unidad de ${esc(p.name)}">−</button>${q}<button data-k="${id}p" onclick="setQty(${id},1)" aria-label="Añadir una unidad de ${esc(p.name)}">+</button><button class="trash" onclick="setQty(${id},-99)" aria-label="Eliminar ${esc(p.name)} del carrito">${TRASH}</button></div></div><b>${money(p.price*q)}</b></div>`}).join(""):`<div class="empty">Tu carrito está vacío.<br><button class="btn" style="width:auto;padding:0 20px;margin-top:14px" onclick="closeCart();go('cat')">Ver catálogo</button></div>`}</div>
 ${ids.length>1?`<button class="link" style="margin:0 0 12px;align-self:flex-start" onclick="clearCart()">Vaciar carrito</button>`:""}
 ${promoRows()}<div class="row">Subtotal<b>${money(sub())}</b></div><div class="row">Envío<b>${money(ship())}</b></div>
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
 <div class="or" aria-hidden="true"><span>o</span></div>
 <div id="gbtn" class="gwrap">${GOOGLE_ID?"":`<button type="button" class="gfake" onclick="googleNoConfig()"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> <span>${up?"Registrarse con Google":"Continuar con Google"}</span></button>`}</div>
 <p class="foot" style="margin-bottom:0">${up?"¿Ya tienes cuenta?":"¿Aún no tienes cuenta?"} <button type="button" class="alink" onclick="setAM('${up?"in":"up"}')">${up?"Inicia sesión":"Crea una aquí"}</button></p></form></div>`}
function acct(){
 const u={name:(ME&&ME.nombre)||USER},os=ordersOf();
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Mis pedidos</h1><p class="sub">${esc(u.name)} · ${esc(USER)} · <button class="alink" onclick="logout()">Cerrar sesión</button></p>
 <div style="max-width:720px">${!ORD.loaded?`<div class="panel empty">Cargando tus pedidos…</div>`:os.length?os.map((o,i)=>[o,i]).reverse().slice(0,ordShow).map(([o,i])=>`<article class="panel ord"><div class="oh"><b>${esc(o.no)}</b><span>${new Date(o.date).toLocaleDateString("es-EC",{day:"numeric",month:"long",year:"numeric"})}</span><span class="st ${o.estado==="cancelado"?"cx":o.paid?"pd2":""}">${o.estado==="cancelado"?"Cancelado":o.paid?"Pagado":"Pago pendiente"}</span></div>
 <ul>${o.items.map(it=>`<li>${esc(it.n)} × ${it.q} · ${money(it.pr*it.q)}</li>`).join("")}</ul>
 <div class="row" style="margin:4px 0">${esc(o.dm)} · ${esc(o.method)}</div><div class="row t" style="margin:8px 0 12px;font-size:16px">Total<span>${money(o.total)} USD</span></div>
 <button class="btn" style="width:auto;padding:0 20px;height:38px" onclick="reorder(${i})">Volver a comprar</button></article>`).join("")+(os.length>ordShow?`<div class="pager"><button class="btn" style="width:auto;padding:0 22px" onclick="ordShow+=5;render()">Mostrar más pedidos (${os.length-ordShow} restantes)</button></div>`:""):`<div class="panel empty">Aún no tienes pedidos.<br><button class="btn" style="width:auto;padding:0 20px;margin-top:14px" onclick="goCat(['m','n','f'])">Ver catálogo</button></div>`}</div>`}
function checkout(){
 const sel=(k,opts,ph,x="")=>`<select id="co_${k}" required aria-required="true" ${CE[k]?'aria-invalid="true"':""} aria-describedby="co_${k}_e" ${x}><option value="">${ph}</option>${opts.map(o=>`<option ${V[k]===o?"selected":""}>${o}</option>`).join("")}</select>`;
 const ctl=k=>k==="prov"?sel("prov",PROV,"Selecciona tu provincia",'oninput="coProv(this)" autocomplete="address-level1"'):k==="city"?sel("city",CITY[V.prov]||[],V.prov?"Selecciona tu ciudad":"Primero elige la provincia",`oninput="coIn('city',this)" autocomplete="address-level2" ${V.prov?"":"disabled"}`):k==="type"?`<select id="co_type" oninput="setType(this.value)">${["Casa","Departamento","Oficina"].map(o=>`<option ${V.type===o?"selected":""}>${o}</option>`).join("")}</select>`:`<input id="co_${k}" value="${esc(V[k])}" type="${k==="email"?"email":k==="tel"?"tel":"text"}" placeholder="${CF[k][3]||""}" autocomplete="${CF[k][2]||"off"}" ${/opcional/.test(CF[k][0])?"":'required aria-required="true"'} ${CE[k]?'aria-invalid="true"':""} aria-describedby="co_${k}_e" oninput="coIn('${k}',this)">`;
 const fld=(k,w)=>`<div class="f ${CE[k]?"bad":""}" style="${w?"grid-column:1/-1":""}"><label for="co_${k}">${CF[k][0]}</label>${ctl(k)}<small id="co_${k}_e">⚠ ${(typeof CE[k]==="string"&&CE[k])||msgFor("checkout",k)}</small></div>`;
 const mt=(v,t,d)=>`<label class="mt ${DM===v?"on":""}"><input type="radio" name="dm" value="${v}" ${DM===v?"checked":""} onchange="setDM('${v}')"><span><b>${t}</b><small>${d}</small></span></label>`;
 $("#app").innerHTML=`<button class="link back" onclick="go('cat')">← Volver al catálogo</button>${steps(2)}<h1 tabindex="-1">Finaliza tu pedido</h1><p class="sub">Elige cómo recibir tu pedido y cómo pagarlo en esta misma página.</p>
 ${PAYMSG?`<div class="err" role="alert">⚠ ${esc(PAYMSG)}</div>`:""}
 ${Object.keys(CE).length?`<div class="err" id="coAlert" role="alert">Completa los datos para continuar. Revisa los campos marcados.</div>`:""}
 <div class="layout co" style="grid-template-columns:1fr 400px"><div style="display:grid;gap:24px" ${busy?"inert":""}>
 <section class="panel"><fieldset class="meth" style="margin:0"><legend style="font-size:18px;margin-bottom:12px">Método de entrega</legend>${mt("ship","Envío a domicilio","Por Servientrega · solo dentro de Ecuador · "+SHIPC()+" (gratis desde "+FREE()+")")}${mt("pick","Retiro en tienda","Sin costo · Quito, Ecuador")}</fieldset></section>
 <section class="panel" aria-labelledby="hDir"><h2 id="hDir" style="font-size:18px;margin:0 0 8px">${DM==="ship"?"Dirección de entrega":"Datos de contacto"}</h2>
 ${DM==="pick"?`<div class="info" style="margin-top:0">Retira tu pedido en nuestra tienda en Quito, Ecuador. Te avisaremos por teléfono cuando esté listo.</div>`:`<div class="info" style="margin-top:0">Entregamos por Servientrega, solo dentro de Ecuador.</div>`}
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">${fld("name")}${fld("tel")}${fld("email",1)}${DM==="ship"?fld("prov")+fld("city")+fld("addr",1)+fld("type")+(V.type!=="Casa"?"<div></div>"+fld("edif",1)+fld("piso")+fld("unit"):"")+fld("ref",1):""}</div></section>
 ${payPanel()}
 <section class="panel"><h2 style="font-size:18px;margin:0 0 8px">Artículos en tu pedido</h2>${Object.keys(cart).map(id=>`<div class="item" style="--c:${P[id].c}"><div class="mini" role="img" aria-label="Portada de ${esc(P[id].name)}" style="width:56px;height:56px;background:url('${esc(P[id].imgs[0]||'')}') center/cover,var(--c)"></div><div class="t">${P[id].name}<div style="font-weight:400;font-size:12px;color:var(--mute)">${cart[id]} unidad${cart[id]>1?"es":""}</div></div><b>${money(P[id].price*cart[id])}</b></div>`).join("")}</section></div>
 <aside class="panel sum"><h2 style="font-size:18px;margin:0 0 12px">Resumen del pedido</h2>${promoRows()}<div class="row">Subtotal<b>${money(sub())}</b></div><div class="row">${DM==="pick"?"Retiro en tienda":"Envío"}<b>${money(ship())}</b></div><div class="row t">Total<span>${money(total())} USD</span></div>
 <button class="btn" style="margin-top:16px" ${busy?"disabled":""} onclick="submitPay()">${busy?`<span class="spin"></span>${M==="fisico"?"Registrando tu pedido…":"Conectando con DeUna…"}`:M==="fisico"?"Confirmar pedido":M==="qr"?"Generar código QR":"Pagar con DeUna"}</button><button class="btn" style="margin-top:10px;background:none;color:var(--acc);border:2px solid var(--acc)" ${busy?"disabled":""} onclick="go('cat')">Seguir explorando</button><div id="payStat" role="status" tabindex="-1" class="foot">${busy?"Registrando tu pedido. No cierres esta página.":"Revisa tus datos antes de confirmar tu pedido"}</div></aside></div>`}
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
 <div style="font-size:24px;font-weight:800">${priceHtml(p)} <small style="font:400 13px Inter,Arial,sans-serif;color:var(--mute)">USD · IVA incluido</small></div>${p.was?`<div class="promo-box dscbox">🏷️ <b>Rebaja del ${pctOff(p)}%</b> · ahorras ${money(p.was-p.price)}</div>`:""}
 <h2 style="font-size:16px;margin:18px 0 4px">Acerca de este artículo</h2><ul>${bul.map(b=>`<li>${b}</li>`).join("")}</ul></section>
 <aside class="panel buy" aria-label="Comprar"><div class="big-p">${priceHtml(p)}</div>${packsOf(p.id).map(k=>`<div class="promo-box">📦 <b>${esc(k.name)}</b> · −${k.pct}%<br>${k.ids.map(i=>esc(P[i].name)).join(" + ")}<br><b>${money(packPrice(k))}</b> <s class="was">${money(packSum(k))}</s> · ahorras ${money(packSum(k)-packPrice(k))}<br><button class="btn" style="margin-top:8px" onclick="addPack(${k.id})">Añadir pack al carrito</button></div>`).join("")}
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
 ${cl.length?[...cl].reverse().slice(0,comShow[p.id]||5).map(c=>`<article class="rev"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${esc(c.n)}</b> <span class="stars" role="img" aria-label="${c.r} de 5">${"★".repeat(c.r)}${"☆".repeat(5-c.r)}</span><div style="font-size:12px;color:var(--mute)">${new Date(c.d).toLocaleDateString("es-EC",{day:"numeric",month:"long",year:"numeric"})}</div></div>${ME&&c.uid===ME.id?`<button class="trash" aria-label="Eliminar tu comentario" onclick="delCom(${p.id},${c.id})">${TRASH}</button>`:""}</div><p style="margin:8px 0 0;white-space:pre-wrap">${esc(c.t)}</p></article>`).join("")+(cl.length>(comShow[p.id]||5)?`<button class="btn alt" style="width:auto;padding:0 22px" onclick="comShow[${p.id}]=(comShow[${p.id}]||5)+5;render()">Ver más comentarios (${cl.length-(comShow[p.id]||5)} más)</button>`:""):`<p style="color:var(--mute)">Aún no hay comentarios. ¡Sé el primero en opinar!</p>`}</section>
 ${rel.length?`<section class="sec" aria-labelledby="hr"><h2 id="hr">También te puede interesar</h2><div class="grid">${rel.map(card).join("")}</div></section>`:""}`}
const steps=n=>`<ol class="steps" aria-label="Progreso de la compra">${["Carrito","Entrega y pago","Confirmación"].map((t,i)=>`<li class="${i+1<n?"ok":i+1===n?"cur":""}" ${i+1===n?'aria-current="step"':""}>${i+1<n?"✓ ":""}${i+1}. ${t}</li>`).join("")}</ol>`;
function payPanel(){
 const mt=(v,t,d)=>`<label class="mt ${M===v?"on":""}"><input type="radio" name="m" value="${v}" ${M===v?"checked":""} onchange="setM('${v}')"><span><b>${t}</b><small>${d}</small></span></label>`;
 const fis=`<div class="info">${DM==="pick"?"Pagas en efectivo en la tienda cuando retiras tu pedido.":"Pagas en efectivo cuando recibes tu pedido por Servientrega."} No necesitas ingresar datos de tarjeta.</div><p style="margin:12px 0 0;font-weight:700">Monto a pagar en físico: ${money(total())} USD</p>`;
 const test='<p class="qrc">Modo de prueba: es una simulación, no se cobra dinero real.</p>';
 const deuna=`<div class="info">Te llevamos a la pantalla de pago de DeUna. Confirmas el pago allí y regresas automáticamente a la tienda.</div><ol class="dsteps"><li>Pulsa «Pagar con DeUna».</li><li>Confirma el monto en la pantalla de pago.</li><li>Vuelves aquí con tu pedido confirmado y te enviamos el comprobante por correo.</li></ol>${test}`;
 const qrp=`<div class="info">Generamos un código QR para pagar desde tu celular. Esta pantalla se actualiza sola cuando completas el pago.</div><ol class="dsteps"><li>Pulsa «Generar código QR».</li><li>Escanea el código con la cámara de tu celular.</li><li>Confirma el pago en la pantalla que se abre.</li></ol>${test}`;
 return `<section class="panel" aria-labelledby="hPay"><h2 id="hPay" style="font-size:18px;margin:0 0 12px">Pago</h2>
 <fieldset class="meth meth3" style="margin:0"><legend>Método de pago</legend>${mt("fisico","Pago en físico","Efectivo al recibir o al retirar")}${mt("deuna","DeUna · Pagar en línea","Te llevamos a la pantalla de pago")}${mt("qr","DeUna · Código QR","Escanea con tu celular")}</fieldset>
 ${M==="fisico"?fis:M==="qr"?qrp:deuna}</section>`}
function done(){
 const pend=!order.paid,pick=order.dm==="Retiro en tienda";
 $("#app").innerHTML=`<div style="max-width:640px;margin:0 auto">${steps(3)}<div class="ok-t"><div class="check" aria-hidden="true">✓</div><h1 tabindex="-1">¡Pedido confirmado!</h1><p style="color:var(--mute);font-size:13px;margin:0">${pend?`Pagarás ${money(order.total)} USD en efectivo ${pick?"al retirarlo en tienda":"al recibirlo"}.`:"Tu pago con DeUna fue verificado."} Enviamos el comprobante a <b>${esc(order.email)}</b>.</p></div>
 <div class="rec"><h2 style="margin:0 0 4px;font-size:15px;display:flex;justify-content:space-between">Comprobante<span style="color:${pend?"#b45309":"var(--green)"};font-size:12px">${pend?"PAGO PENDIENTE":"PAGADO"}</span></h2>
 <div class="row">N.º de pedido<b>${order.no}</b></div>${order.name?`<div class="row">Cliente<b>${esc(order.name)}</b></div>`:""}${order.tel?`<div class="row">Teléfono<b>${esc(order.tel)}</b></div>`:""}<div class="row">Método de pago<b>${order.method}</b></div><div class="row">Entrega<b>${order.dm}</b></div><div class="row">Artículos<b>${order.units} unidad${order.units>1?"es":""}</b></div><div class="row">${pend?"Total a pagar":"Total pagado"}<b>${money(order.total)} USD</b></div></div>
 ${USER?`<p style="text-align:center"><button class="alink" onclick="go('acct')">Ver mi historial de pedidos</button></p>`:`<p style="text-align:center;color:var(--mute);font-size:13px">¿Quieres ver este pedido después? <button class="alink" onclick="AM='up';go('login')">Crea una cuenta</button> con el correo ${esc(order.email)}.</p>`}
 <button class="btn g" onclick="finish()">Finalizar y volver al inicio</button></div>`}
function markCommentErrors(bad){for(const k of["t"]){const f=$("#cm_"+k).closest(".f"),i=$("#cm_"+k);f.classList.toggle("bad",bad[k]);bad[k]?i.setAttribute("aria-invalid","true"):i.removeAttribute("aria-invalid")}}

function favs(){
 const list=[...FAV].map(i=>P[i]).filter(Boolean);
 const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));if(favPage>pages)favPage=pages;
 const from=(favPage-1)*PAGE_SIZE,part=list.slice(from,from+PAGE_SIZE);
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Mis favoritos</h1><p class="sub">${list.length?list.length+" producto"+(list.length===1?"":"s")+" guardado"+(list.length===1?"":"s"):"Toca el ♡ de un producto para guardarlo aquí."}</p>
 ${list.length?`<div class="grid">${part.map(card).join("")}</div>${pager(list.length,favPage,PAGE_SIZE,"fav")}`:`<div class="panel empty">Aún no tienes favoritos.<br><button class="btn" style="width:auto;padding:0 20px;margin-top:14px" onclick="goCat(['m','n','f'])">Ver catálogo</button></div>`}`}

/* ---- Paginación, avatar y perfil ---- */
const PAGE_SIZE=12;
let catPage=1,catKey="",favPage=1,ordShow=5,comShow={};
function pager(total,page,size,key){
 const n=Math.ceil(total/size);if(n<=1)return"";
 const nums=[...new Set([1,page-1,page,page+1,n])].filter(p=>p>=1&&p<=n).sort((a,b)=>a-b);
 const b=(p,l,dis,lab)=>`<button class="pg${p===page&&!dis?" cur":""}" ${dis?"disabled":""} ${p===page&&!dis?'aria-current="page"':""} onclick="goPage('${key}',${p})" aria-label="${lab||"Página "+p}">${l}</button>`;
 let out="",prev=0;
 for(const p of nums){if(p-prev>1)out+='<span class="pgd" aria-hidden="true">…</span>';out+=b(p,p);prev=p}
 return `<nav class="pager" aria-label="Paginación">${b(page-1,"‹ Anterior",page<=1,"Página anterior")}${out}${b(page+1,"Siguiente ›",page>=n,"Página siguiente")}</nav><p class="pginfo">Página ${page} de ${n}</p>`}
function initials(n){return String(n||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()||"?"}
function avatarHtml(u,size=24){
 const s=`width:${size}px;height:${size}px;font-size:${Math.round(size*.42)}px`;
 return u&&u.foto?`<img class="av" style="${s}" src="${esc(u.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;av&quot; style=&quot;${s}&quot;>${esc(initials(u.nombre))}</span>'">`
  :`<span class="av" style="${s}" aria-hidden="true">${esc(initials(u&&u.nombre))}</span>`}

function perfil(){
 const m=ME||{},dr=PF.draft||{},v=k=>esc(dr[k]!==undefined?dr[k]:(m[k]||""));
 const prov=dr.prov!==undefined?dr.prov:(m.prov||""),city=dr.city!==undefined?dr.city:(m.city||"");
 const err=k=>PE[k]?`<small style="display:block">⚠ ${esc(PE[k])}</small>`:"<small></small>";
 const fotoVista={nombre:m.nombre,foto:("foto" in PF)?(PF.foto||m.fotoGoogle):m.foto};
 const tieneSubida=("foto" in PF)?!!PF.foto:m.fotoSubida;
 $("#app").innerHTML=`<h1 class="h2" tabindex="-1">Mi perfil</h1><p class="sub">Actualiza tus datos. Se usan para rellenar tu pedido más rápido. · <button class="alink" onclick="go('acct')">Ver mis pedidos</button> · <button class="alink" onclick="logout()">Cerrar sesión</button></p>
 <div style="max-width:720px;display:grid;gap:20px">
 <section class="panel" aria-labelledby="pfT"><h2 id="pfT" style="margin-bottom:6px">Apariencia</h2><p style="margin:0 0 12px;color:var(--mute)">Elige cómo quieres ver la tienda. Se guarda en este dispositivo.</p>
  <fieldset class="meth" style="margin:0;min-width:0;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))"><legend style="position:absolute;left:-9999px">Tema de la tienda</legend>${[["light","☀️ Claro","Fondo blanco"],["dark","🌙 Oscuro","Fondo oscuro"],["auto","💻 Automático","Como tu dispositivo"]].map(([k,t,d])=>`<label class="mt ${themeMode()===k?"on":""}"><input type="radio" name="tema" value="${k}" ${themeMode()===k?"checked":""} onchange="setTheme('${k}')"><span><b>${t}</b><small>${d}</small></span></label>`).join("")}</fieldset></section>
 <section class="panel" aria-labelledby="pfF"><h2 id="pfF" style="margin-bottom:14px">Foto de perfil</h2>
  <div class="prof"><div id="pf_av">${avatarHtml(fotoVista,110)}</div><div>
   <input id="pf_file" type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="pickPhoto(this)">
   <button class="btn" style="width:auto;padding:0 20px;height:40px" onclick="$('#pf_file').click()">Cambiar foto</button>
   ${tieneSubida?`<button class="btn alt" style="width:auto;padding:0 20px;height:40px;margin:8px 0 0 8px" onclick="resetPhoto()">${m.fotoGoogle?"Usar mi foto de Google":"Quitar foto"}</button>`:""}
   <p class="foot" style="text-align:left;margin:10px 0 0">${m.fotoGoogle?"Si no subes otra foto, se usa la de tu cuenta de Google y se actualiza cada vez que inicias sesión con Google.":"Sube una imagen JPG, PNG o WEBP; se recorta en cuadrado."}</p>
  </div></div></section>
 <form class="panel" onsubmit="saveProfile(event)" novalidate aria-labelledby="pfD"><h2 id="pfD" style="margin-bottom:6px">Mis datos</h2>
  <div class="f ${PE.nombre?"bad":""}"><label for="pf_nombre">Nombre completo</label><input id="pf_nombre" value="${v("nombre")}" maxlength="80" autocomplete="name">${err("nombre")}</div>
  <div class="f"><label for="pf_email">Correo electrónico</label><input id="pf_email" value="${esc(m.email||"")}" disabled aria-describedby="pf_em"><small id="pf_em" style="display:block;color:var(--mute)">El correo no se puede cambiar porque es con el que verificaste tu cuenta.</small></div>
  <div class="f ${PE.telefono?"bad":""}"><label for="pf_telefono">Teléfono</label><input id="pf_telefono" type="tel" value="${v("telefono")}" placeholder="Número de celular" autocomplete="tel">${err("telefono")}</div>
  <div class="f"><label for="pf_prov">Provincia</label><select id="pf_prov" onchange="pfProv()"><option value="">Selecciona tu provincia</option>${PROV.map(o=>`<option ${prov===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  <div class="f ${PE.city?"bad":""}"><label for="pf_city">Ciudad</label><select id="pf_city" ${prov?"":"disabled"}><option value="">${prov?"Selecciona tu ciudad":"Primero elige la provincia"}</option>${(CITY[prov]||[]).map(o=>`<option ${city===o?"selected":""}>${esc(o)}</option>`).join("")}</select>${err("city")}</div>
  <div class="f ${PE.addr?"bad":""}"><label for="pf_addr">Dirección de entrega</label><input id="pf_addr" value="${v("addr")}" placeholder="Calle principal, número y referencia" autocomplete="street-address">${err("addr")}</div>
  <button class="btn" style="width:auto;padding:0 26px;margin-top:18px" type="submit">Guardar cambios</button></form>
 ${m.registro==="google"?`<section class="panel"><h2 style="margin-bottom:6px">Contraseña</h2><p style="margin:0;color:var(--mute)">Tu cuenta entra con Google, así que no tiene contraseña en la tienda.</p></section>`
 :`<form class="panel" onsubmit="savePassword(event)" novalidate aria-labelledby="pfP"><h2 id="pfP" style="margin-bottom:6px">Cambiar contraseña</h2>
  <div class="err" id="pf_perr" role="alert" tabindex="-1" hidden></div>
  <div class="f"><label for="pf_pa">Contraseña actual</label><input id="pf_pa" type="password" autocomplete="current-password"></div>
  <div class="f"><label for="pf_pn">Nueva contraseña</label><input id="pf_pn" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div>
  <button class="btn" style="width:auto;padding:0 26px;margin-top:18px" type="submit">Cambiar contraseña</button></form>`}
 </div>`}

function qrpay(){
 const url=location.origin+PAGO.url;
 let svg="";try{const k=qrcode(0,"M");k.addData(url);k.make();svg=k.createSvgTag({cellSize:6,margin:2,scalable:true})}catch(e){}
 $("#app").innerHTML=`<div style="max-width:520px;margin:0 auto">${steps(2)}<h1 class="h2" tabindex="-1">Escanea para pagar con DeUna</h1><p class="sub">Pedido ${esc(order.no)} · Total ${money(order.total)} USD</p>
 <div class="panel" style="text-align:center">${svg?`<div class="qrbox" role="img" aria-label="Código QR para pagar el pedido ${esc(order.no)}">${svg}</div>`:`<div class="info">No se pudo dibujar el código QR. Usa el botón de abajo para abrir la pantalla de pago.</div>`}
 <p class="qrc" role="status">⏳ Esperando el pago… esta pantalla se actualiza sola. El código vence en 15 minutos.</p>
 <a class="btn" style="display:grid;place-items:center;text-decoration:none" href="${esc(PAGO.url)}" target="_blank" rel="noopener">Abrir la pantalla de pago en este dispositivo</a>
 <button class="btn" style="margin-top:10px;background:none;color:var(--acc);border:2px solid var(--acc)" onclick="cancelQr()">Cancelar pago</button>
 <p class="foot">Modo de prueba: es una simulación, no se cobra dinero real.</p></div></div>`}

/* ---- Menú de la cuenta (perfil y cerrar sesión) ---- */
function fillUserMenu(){
 const m=$("#uMenu");if(!m)return;m.hidden=true;
 m.innerHTML=USER?`<div class="uhead"><b>${esc(userName()||"Mi cuenta")}</b><small>${esc(USER)}</small></div>
 <button role="menuitem" onclick="closeUserMenu();go('perfil')">👤 Mi perfil</button>
 <hr><button role="menuitem" class="out" onclick="closeUserMenu();logout()">⎋ Cerrar sesión</button>`:""}
function closeUserMenu(){const m=$("#uMenu");if(m&&!m.hidden){m.hidden=true;$("#userBtn").setAttribute("aria-expanded","false")}}
function toggleUserMenu(){const m=$("#uMenu"),abrir=m.hidden;m.hidden=!abrir;$("#userBtn").setAttribute("aria-expanded",String(abrir));if(abrir){const f=m.querySelector("button");f&&f.focus()}}
