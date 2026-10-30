/* ===== CONTROLADOR: rutas, eventos del usuario; une modelo y vista. ===== */
let view="home",CE={},cur=0,GI=0,AM="in",busy=false,READY=false,PENDING=null,PF={},PE={};
/* Cada vista es una página HTML independiente (index.html, catalogo.html, producto.html…).
   Dentro de pagar.html los pasos del pago (QR, confirmación) cambian sin recargar. */
const PAGE={home:"index.html",cat:"catalogo.html",prod:"producto.html",fav:"favoritos.html",acct:"pedidos.html",co:"pagar.html",qrpay:"pagar.html",ok:"pagar.html",login:"ingresar.html",perfil:"perfil.html",help:"ayuda.html"};
const HERE=document.body.dataset.page||"home";
// Datos que pasan de una página a la siguiente (avisos, página a la que volver después de iniciar sesión)
const SS={get(k){try{const v=sessionStorage.getItem(k);sessionStorage.removeItem(k);return v==null?null:JSON.parse(v)}catch(e){return null}},set(k,v){try{sessionStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let LEAVING=false,BACK=null;
const prodUrl=i=>"producto.html?id="+P[i].dbId;
function go(v,qs){
 if(PAGE[v]!==PAGE[HERE]||qs){LEAVING=true;saveCart();location.href=PAGE[v]+(qs?"?"+qs:"");return}
 view=v;if(v==="co"){CE={};PAYMSG=""}if(v!=="qrpay")stopQr();if(v==="acct")ORD.fresh=false;if(v==="perfil"){PF={};PE={}}render();scrollTo(0,0);const h=$("#app h1");h&&h.focus()}
function goBack(){const b=BACK;BACK=null;if(b&&/^[a-z]+\.html/.test(b)&&!/^ingresar/.test(b)){LEAVING=true;saveCart();location.href=b}else go("home")}
function goCat(cats,av){
 if(HERE==="cat"){F={cats:new Set(cats),av:av||"all",q:""};$("#q").value="";catPage=1;render();scrollTo(0,0);const h=$("#app h1");h&&h.focus();return}
 const qs=[cats.length===3?"":"cat="+cats.join(","),av&&av!=="all"?"disp="+av:""].filter(Boolean).join("&");go("cat",qs||undefined)}
function setCat(k){goCat([k])}
function render(){
 if(!READY)return;
 if((view==="acct"||view==="fav"||view==="perfil"||view==="co")&&!USER){needLogin(view==="co"?"Inicia sesión para pagar tu pedido.":"Inicia sesión para continuar.");return}
 if(view==="qrpay"&&!PAGO)view="co";
 if(view==="acct"&&!ORD.fresh){ORD.fresh=true;loadOrders().then(()=>{if(view==="acct")render()})}
 header();
 if(view==="co"&&!count()){$("#app").innerHTML=`<div class="panel empty" style="max-width:520px;margin:0 auto"><h1 class="h2" tabindex="-1">Tu carrito está vacío</h1><p>Añade productos para finalizar un pedido.</p><a class="btn" style="width:auto;padding:0 24px;display:inline-flex;align-items:center;text-decoration:none" href="catalogo.html">Ver catálogo</a></div>`;document.title="Finalizar pedido – STELLAR VAULT";return}
 if(view==="prod"&&!P[cur]){$("#app").innerHTML=`<div class="panel empty" style="max-width:520px;margin:0 auto"><h1 class="h2" tabindex="-1">Producto no encontrado</h1><p>El producto que buscas no existe o ya no está disponible.</p><a class="btn" style="width:auto;padding:0 24px;display:inline-flex;align-items:center;text-decoration:none" href="catalogo.html">Ver catálogo</a></div>`;document.title="Producto no encontrado – STELLAR VAULT";return}
 if(view==="co")prefillCheckout();
 view==="home"?home():view==="cat"?catalog():view==="help"?help():view==="prod"?detail():view==="ok"?done():view==="login"?login():view==="acct"?acct():view==="fav"?favs():view==="perfil"?perfil():view==="qrpay"?qrpay():checkout();
 if(view==="login"&&!PENDING)setTimeout(initGoogle,0);
 saveCart();
 document.title=(view==="prod"?P[cur].name:{home:"Inicio",cat:"Catálogo",help:"Ayuda",login:AM==="up"?"Crear cuenta":"Iniciar sesión",acct:"Mis pedidos",fav:"Favoritos",perfil:"Mi perfil",qrpay:"Pagar con DeUna",co:"Finalizar pedido",ok:"Pedido confirmado"}[view])+" – STELLAR VAULT"}
function togCat(k){F.cats.has(k)?F.cats.delete(k):F.cats.add(k);render()}
// Buscar desde cualquier página lleva al catálogo con el texto escrito.
$("#q").oninput=e=>{F.q=e.target.value;if(HERE!=="cat"){SS.set("sv_buscar",1);go("cat","q="+encodeURIComponent(F.q));return}catPage=1;render()};

/* --- Carrito --- */
function needLogin(msg){PENDING=null;AM="in";if(HERE!=="login")SS.set("sv_volver",location.pathname.slice(1)+location.search);go("login");toast(msg,null,null,"warn")}
function add(id,n=1){if(!USER){needLogin("Inicia sesión para añadir productos al carrito.");return}n=cartAdd(id,n);if(n<=0)return;
 const a=document.activeElement,key=a&&a.dataset&&a.dataset.add;
 render();toast(`${n>1?n+" × ":""}${P[id].name} añadido al carrito`);
 const b=key&&document.querySelector(`[data-add="${key}"]:not([disabled])`);(b||$("#toast button")).focus()}
function buy(id){if(!USER){needLogin("Inicia sesión para comprar.");return}const n=Math.min(+$("#qty").value||1,room(id));if(n>0)cartAdd(id,n);go("co")}
function setQty(id,d){const name=P[id].name,removed=cartChange(id,d);render();drawer();
 if(removed)toast(`${name} eliminado del carrito`,"Deshacer","undoRm()","del");else if(cart[id])toast(`${name}: ${cart[id]} en el carrito`,null);
 const k=(removed&&$("#drawer .undo button"))||document.querySelector(`[data-k="${id}${d>0?"p":"m"}"]`)||$("#drawer .x");k&&k.focus()}
function clearCart(){if(!cartClear())return;render();drawer();toast("Carrito vaciado","Deshacer","undoAll()","del");$("#drawer .x").focus()}
function undoAll(){if(!cartUndoClear())return;$("#toast").classList.remove("on");render();drawer();$("#drawer .x").focus()}
function undoRm(){if(!cartUndoRemove())return;$("#toast").classList.remove("on");render();drawer();$("#drawer .x").focus()}
function openCart(){$("#toast").classList.remove("on");drawer();openLayer($("#drawerOv"),$("#drawer"))}
function closeCart(){cartForget();if($("#drawerOv").classList.contains("on"))closeLayer($("#drawerOv"))}

/* --- Comentarios --- */
async function addCom(e,id){
 e.preventDefault();
 if(!USER){needLogin("Inicia sesión para comentar.");return}
 const t=$("#cm_t").value.trim(),r=+$("#cm_r").value,bad=commentErrors(t,r);
 markCommentErrors(bad);
 if(bad.t){$("#cm_t").focus();return}
 const res=await addComment(id,t,r);render();
 $("#cstat").textContent=res.ok?"Comentario publicado y guardado.":res.error;$("#ho").focus()}
async function delCom(pid,cid){if(!await deleteComment(pid,cid))return;render();$("#cstat").innerHTML='Comentario eliminado. <button class="link" style="margin:0" onclick="undoCom()">Deshacer</button>';$("#cstat button").focus()}
async function undoCom(){if(!await restoreComment())return;render();$("#cstat").textContent="Comentario restaurado.";$("#ho").focus()}

/* --- Checkout y pago --- */
function coIn(k,el){V[k]=el.value;if(CE[k]){delete CE[k];el.closest(".f").classList.remove("bad");el.removeAttribute("aria-invalid");clearAlert()}}
function coProv(el){coIn("prov",el);V.city="";const c=$("#co_city");c.innerHTML=`<option value="">${V.prov?"Selecciona tu ciudad":"Primero elige la provincia"}</option>${(CITY[V.prov]||[]).map(x=>`<option>${x}</option>`).join("")}`;c.disabled=!V.prov}
function setType(v){V.type=v;checkout();$("#co_type").focus()}
function setDM(v){DM=v;CE={};checkout();$("input[name=dm]:checked").focus()}
function clearAlert(){if(!Object.keys(CE).length){const a=$("#coAlert");a&&a.remove()}}
function setM(m){M=m;checkout();$("input[name=m]:checked").focus()}
async function submitPay(){
 if(busy)return;
 CE=validateCo();PAYMSG="";
 if(Object.keys(CE).length){checkout();const e=document.querySelector(".f.bad input,.f.bad select");e&&e.focus();return}
 busy=true;checkout();$("#payStat").focus();
 try{
  const [d]=await Promise.all([placeOrder(),new Promise(r=>setTimeout(r,600))]);
  busy=false;
  if(d.pago&&M==="qr"){view="qrpay";render();startQrPoll();scrollTo(0,0);const h=$("#app h1");h&&h.focus();return}
  if(d.pago){LS.set("sv_cart_pend",{cart,ts:Date.now()});location.href=d.pago.url;return} // pasa a la pantalla de pago
  view="ok";render();scrollTo(0,0);$("#app h1").focus()
 }catch(e){
  busy=false;
  if(e.errores)CE=e.errores;else toast(e.message||"No se pudo registrar tu pedido. Intenta de nuevo.",null,null,"del");
  checkout();const f=document.querySelector(".f.bad input,.f.bad select");f&&f.focus()}}
let qrT=null;
function stopQr(){clearInterval(qrT);qrT=null}
function startQrPoll(){stopQr();qrT=setInterval(async()=>{
 if(view!=="qrpay"||!PAGO){stopQr();return}
 try{const d=await api("GET","/api/pagos/estado?t="+PAGO.token);
  if(d.estado==="aprobado"){stopQr();await finishPaid(d.numero);view="ok";render();scrollTo(0,0);toast("¡Pago realizado! Te enviamos el comprobante por correo.",null)}
  else if(["rechazado","cancelado","expirado"].includes(d.estado)){stopQr();payFailed(d.estado==="rechazado"?"saldo":d.estado)}}catch(e){}},2500)}
async function cancelQr(){if(!PAGO)return;stopQr();try{await api("POST","/api/pagos/"+PAGO.token+"/rechazar",{motivo:"cancelado"})}catch(e){}payFailed("cancelado")}
function payFailed(m){
 PAGO=null;PAYMSG={saldo:"El pago fue rechazado: saldo insuficiente en la cuenta DeUna. No se realizó ningún cobro.",cancelado:"El pago se canceló. No se realizó ningún cobro.",expirado:"El tiempo para pagar venció. No se realizó ningún cobro."}[m]||"El pago no se completó. No se realizó ningún cobro.";
 loadData().catch(()=>{});view="co";render();scrollTo(0,0);const h=$("#app h1");h&&h.focus()}
function pick(i){GI=i;const p=P[cur];$("#bigimg").innerHTML=slide(p,i,280);$("#cap").textContent=capt(p,i);document.querySelectorAll(".th button").forEach((b,j)=>b.setAttribute("aria-pressed",j===i))}
function finish(){DM="ship";M="fisico";go("home")}

/* --- Cuenta e historial --- */
function setAM(m){AM=m;render();const h=$("#app h1");h&&h.focus()}
async function authSubmit(e){
 e.preventDefault();const up=AM==="up",em=$("#a_e").value.trim().toLowerCase(),pw=$("#a_p").value,nm=up?$("#a_n").value.trim():"";
 const r=up?await registerUser(nm,em,pw):await loginUser(em,pw);
 if(r.pendiente||r.noVerificado){PENDING={email:r.email||em,simulado:r.simulado,error:r.error,seg:r.seguimiento};render();startPoll();const h=$("#app h1");h&&h.focus();return}
 if(r.error){const b=$("#aerr");b.textContent="⚠ "+r.error;b.hidden=false;b.focus();return}
 const first=r.user.name.split(" ")[0];
 goBack();toast(up?`Cuenta creada. ¡Bienvenido, ${first}!`:`Sesión iniciada. ¡Hola, ${first}!`,null)}
function googleNoConfig(){toast("El inicio con Google aún no está configurado en el servidor.",null,null,"warn")}
function initGoogle(tries=0){
 const box=$("#gbtn");if(!box||!GOOGLE_ID)return;
 if(!window.google||!google.accounts){if(tries<20)setTimeout(()=>initGoogle(tries+1),300);return}
 google.accounts.id.initialize({client_id:GOOGLE_ID,callback:onGoogle,ux_mode:"popup"});
 google.accounts.id.renderButton(box,{theme:"outline",size:"large",shape:"pill",width:Math.min(380,box.offsetWidth||380),locale:"es",text:AM==="up"?"signup_with":"signin_with"})}
async function onGoogle(resp){
 const box=$("#gbtn");box&&box.insertAdjacentHTML("afterend",'<p class="foot" id="gwait" role="status"><span class="spin"></span> Iniciando sesión con Google…</p>');
 const r=await googleLogin(resp.credential);
 if(r.error){const w=$("#gwait");w&&w.remove();toast(r.error,null,null,"warn");return}
PENDING=null;stopPoll();goBack();toast("Sesión iniciada con Google. ¡Hola, "+r.user.name.split(" ")[0]+"!",null)}
let pollT=null;
function stopPoll(){clearInterval(pollT);pollT=null}
function startPoll(){stopPoll();if(!PENDING||!PENDING.seg)return;pollT=setInterval(async()=>{if(!PENDING||PENDING.verified||view!=="login"){stopPoll();return}try{const d=await api("GET","/api/verificacion-estado?s="+PENDING.seg);if(d.verificado){PENDING.verified=true;PENDING.error=null;stopPoll();render();toast("¡Correo verificado! Ya puedes iniciar sesión.",null)}}catch(e){}},3000)}
function goLoginVerified(){const em=PENDING&&PENDING.email;PENDING=null;AM="in";stopPoll();render();const e=$("#a_e");if(em&&e)e.value=em;const p=$("#a_p");p&&p.focus()}
async function resendFromLogin(){const em=(($("#a_e")||{}).value||"").trim().toLowerCase(),e=checkRules("login",{email:em});if(Object.keys(e).length){const b=$("#aerr");b.textContent="⚠ Escribe tu correo arriba para reenviarte el enlace.";b.hidden=false;b.focus();return}PENDING={email:em};await resendMail()}
async function resendMail(){if(!PENDING)return;try{const d=await resendVerification(PENDING.email);PENDING.error=null;PENDING.simulado=d.simulado;render();toast("Reenviamos el correo a "+PENDING.email,null)}catch(e){PENDING.error=e.message;render()}}
async function toggleFavUI(i){if(!USER){needLogin("Inicia sesión para guardar favoritos.");return}const on=await toggleFav(i);render();toast(on?P[i].name+" añadido a favoritos":P[i].name+" quitado de favoritos",null);const b=document.querySelector('[data-fav="'+i+'"]');b&&b.focus()}
function logout(){endSession();go("home");toast("Cerraste sesión",null)}
function reorder(i){const o=ordersOf()[i];if(!o)return;o.items.forEach(it=>{const k=P.findIndex(p=>p.dbId===it.id);if(k>=0)add(k,it.q)})}

document.addEventListener("keydown",e=>{
 if(e.key==="Escape"){const abierto=$("#uMenu")&&!$("#uMenu").hidden;closeUserMenu();if(abierto)$("#userBtn").focus();closeCart();return}
 if(e.key!=="Tab")return;
 const ov=document.querySelector(".ov.on");if(!ov)return;
 const els=[...ov.querySelectorAll('button,input,a[href]')].filter(x=>!x.disabled&&x.offsetParent!==null);
 if(!els.length){e.preventDefault();return}
 const f=els[0],l=els[els.length-1],out=!ov.contains(document.activeElement);
 if(e.shiftKey&&(document.activeElement===f||out)){e.preventDefault();l.focus()}
 else if(!e.shiftKey&&(document.activeElement===l||out)){e.preventDefault();f.focus()}
});

document.addEventListener("click",e=>{if(!e.target.closest(".uwrap"))closeUserMenu()});
document.addEventListener("focusin",e=>{if(!e.target.closest(".uwrap"))closeUserMenu()});

/* --- Arranque: primero se cargan los datos desde la base de datos --- */
/* --- Arranque de cada página: datos de la base (al instante desde la copia de la pestaña, si existe) --- */
function startView(){
 const qp=new URLSearchParams(location.search);view=HERE;
 if(HERE==="cat"){const c=(qp.get("cat")||"").split(",").filter(k=>["m","n","f"].includes(k));F={cats:new Set(c.length?c:["m","n","f"]),av:["stock","pre","promo","rebaja"].includes(qp.get("disp"))?qp.get("disp"):"all",q:qp.get("q")||""};$("#q").value=F.q}
 if(HERE==="prod"){cur=P.findIndex(p=>String(p.dbId)===qp.get("id"));GI=0}
 if(HERE==="login"){BACK=SS.get("sv_volver");if(qp.get("modo")==="registro")AM="up"}}
(async function init(){
 const cached=cachedBoot();
 try{if(cached)applyBoot(cached);else await loadData()}
 catch(e){$("#app").innerHTML='<div class="panel empty" role="alert"><b>No se pudo conectar con el servidor.</b><br>Si la tienda estaba inactiva, espera unos segundos y <a href="">vuelve a cargar la página</a>.</div>';return}
 loadCart();
 // Enlaces antiguos con # (#/catalogo, #/p/3…) se envían a su página
 const h=location.hash;
 if(/^#\/./.test(h)){const m=h.match(/^#\/p\/(\d+)$/),map={"#/catalogo":"catalogo.html","#/ayuda":"ayuda.html","#/ingresar":"ingresar.html","#/pedidos":"pedidos.html","#/favoritos":"favoritos.html","#/perfil":"perfil.html"};const to=m&&P[+m[1]]?prodUrl(+m[1]):map[h];if(to){location.replace(to);return}}
 READY=true;startView();render();
 const t=SS.get("sv_toast");if(t)toast(...t);
 if(SS.get("sv_buscar")){const q=$("#q");q.focus();q.setSelectionRange(q.value.length,q.value.length)}
 // Con la copia en pantalla, se piden los datos frescos y se actualiza la vista si el usuario no está escribiendo
 if(cached)loadData().then(()=>{const a=document.activeElement;if(["home","cat","prod","fav","help"].includes(view)&&!(a&&a.matches("input,textarea,select"))&&!$("#drawerOv.on"))render();else header()}).catch(()=>{});
 const pq=new URLSearchParams(location.search),pg=pq.get("pago"),pn=pq.get("n"),pm=pq.get("m");
 if(pg){
  history.replaceState(null,"",location.pathname);
  if(pg==="ok"){
   if(USER){try{await finishPaid(pn);view="ok";render();toast("¡Pago realizado! Te enviamos el comprobante por correo.",null)}catch(e){toast("Tu pago se aprobó. Revisa tus pedidos para ver el detalle.",null);go("acct")}}
   else $("#app").innerHTML='<div class="panel empty" style="max-width:520px;margin:0 auto"><div class="check" aria-hidden="true">✓</div><h1 class="h2" tabindex="-1">¡Pago realizado!</h1><p>Tu pago del pedido <b>#'+esc(pn||"")+'</b> fue aprobado. Ya puedes cerrar esta ventana y volver a la tienda en tu otro dispositivo.</p><a class="btn" style="width:auto;padding:0 24px;display:inline-flex;align-items:center;text-decoration:none" href="index.html">Ir a la tienda</a></div>'}
  else{const pend=LS.get("sv_cart_pend",null);LS.set("sv_cart_pend",null);if(pend&&USER&&pend.cart)cart=pend.cart;payFailed(pm||"cancelado")}}
 const vq=new URLSearchParams(location.search).get("verificacion");
 if(vq){history.replaceState(null,"",location.pathname);if(vq==="ok")toast("Correo verificado. Ya puedes iniciar sesión.",null);else toast("El enlace de verificación no es válido o venció. Pide uno nuevo desde el registro.",null,null,"warn")}})();

/* --- Paginación, perfil y modo oscuro --- */
function goPage(k,p){if(k==="cat")catPage=p;else favPage=p;render();const t=$("#cat")||$("#app h1");t&&t.scrollIntoView({behavior:"smooth",block:"start"})}
function themeMode(){try{return localStorage.getItem("sv_tema")||"auto"}catch(e){return"auto"}}
function setTheme(m){
 const d=document.documentElement;
 if(m==="auto"){try{localStorage.removeItem("sv_tema")}catch(e){}matchMedia("(prefers-color-scheme: dark)").matches?d.dataset.theme="dark":delete d.dataset.theme}
 else{d.dataset.theme=m;try{localStorage.setItem("sv_tema",m)}catch(e){}}
 if(view==="perfil"){PF.draft=readProfileForm();render();const r=document.querySelector('input[name=tema]:checked');r&&r.focus()}}
function pfProv(){const p=$("#pf_prov").value,c=$("#pf_city");c.innerHTML=`<option value="">${p?"Selecciona tu ciudad":"Primero elige la provincia"}</option>${(CITY[p]||[]).map(x=>`<option>${esc(x)}</option>`).join("")}`;c.disabled=!p}
function pickPhoto(input){
 const f=input.files&&input.files[0];if(!f)return;
 if(!/^image\/(jpeg|png|webp)$/.test(f.type)){toast("Elige una imagen JPG, PNG o WEBP.",null,null,"warn");return}
 const img=new Image(),url=URL.createObjectURL(f);
 img.onload=()=>{const s=256,c=document.createElement("canvas");c.width=c.height=s;const m=Math.min(img.width,img.height);c.getContext("2d").drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,s,s);URL.revokeObjectURL(url);PF.foto=c.toDataURL("image/jpeg",.82);PF.draft=readProfileForm();render();toast("Foto lista. Pulsa «Guardar cambios» para aplicarla.",null)};
 img.onerror=()=>{URL.revokeObjectURL(url);toast("No pudimos leer esa imagen.",null,null,"warn")};img.src=url}
function resetPhoto(){PF.foto=null;PF.draft=readProfileForm();render()}
function readProfileForm(){return{nombre:$("#pf_nombre").value,telefono:$("#pf_telefono").value,prov:$("#pf_prov").value,city:$("#pf_city").value,addr:$("#pf_addr").value}}
async function saveProfile(e){
 e.preventDefault();
 const d=readProfileForm();d.nombre=d.nombre.trim();d.telefono=d.telefono.trim();d.addr=d.addr.trim();
 PE=checkRules("perfil",d);if(d.prov&&!d.city)PE.city="Selecciona tu ciudad.";
 if(Object.keys(PE).length){PF.draft=d;render();const f=document.querySelector(".f.bad input,.f.bad select");f&&f.focus();return}
 try{const body={...d};if("foto" in PF)body.foto=PF.foto;
  const r=await api("PUT","/api/perfil",body);updateMe(r.usuario);PF={};PE={};render();toast("Perfil actualizado",null)}
 catch(x){if(x.errores){PE=x.errores;PF.draft=d;render()}else toast(x.message||"No se pudo guardar el perfil.",null,null,"warn")}}
async function savePassword(e){
 e.preventDefault();const b=$("#pf_perr"),fail=m=>{b.textContent="⚠ "+m;b.hidden=false;b.focus()};
 const actual=$("#pf_pa").value,nueva=$("#pf_pn").value,er=checkRules("clave",{nueva});
 if(!actual)return fail("Escribe tu contraseña actual.");
 if(er.nueva)return fail(er.nueva);
 try{await api("POST","/api/perfil/password",{actual,nueva});$("#pf_pa").value="";$("#pf_pn").value="";b.hidden=true;toast("Contraseña actualizada",null)}
 catch(x){fail(x.message||"No se pudo cambiar la contraseña.")}}
