/* ===== CONTROLADOR: rutas, eventos del usuario; une modelo y vista. ===== */
let view="home",CE={},cur=0,GI=0,AM="in",busy=false,READY=false,PENDING=null;
const HASH={home:"",cat:"#/catalogo",help:"#/ayuda",co:"",login:"#/ingresar",acct:"#/pedidos",fav:"#/favoritos"};
function setHash(h){if(location.hash===h||(!h&&!location.hash))return;try{history.pushState(null,"",location.pathname+location.search+h)}catch(e){location.hash=h}}
function go(v){view=v;if(v==="co")CE={};if(v==="acct")ORD.fresh=false;setHash(HASH[v]);render();scrollTo(0,0);const h=$("#app h1");h&&h.focus()}
function route(force){const h=location.hash,m=h.match(/^#\/p\/(\d+)$/);if(m&&P[+m[1]]){cur=+m[1];GI=0;view="prod"}else if(h==="#/catalogo")view="cat";else if(h==="#/ayuda")view="help";else if(h==="#/ingresar")view="login";else if(h==="#/pedidos")view="acct";else if(h==="#/favoritos")view="fav";else if(force||view==="prod"||view==="cat"||view==="help"||view==="login"||view==="acct"||view==="fav")view="home";render()}
let navT;function onNav(){clearTimeout(navT);navT=setTimeout(()=>{route(true);scrollTo(0,0);const h=$("#app h1");h&&h.focus()},0)}
addEventListener("hashchange",onNav);addEventListener("popstate",onNav);
function goCat(cats,av){F={cats:new Set(cats),av:av||"all",q:""};$("#q").value="";go("cat")}
function setCat(k){goCat([k])}
function render(){
 if(!READY)return;
 if((view==="acct"||view==="fav")&&!USER){view="login";setHash(HASH.login)}
 if(view==="co"&&!USER){needLogin("Inicia sesión para pagar tu pedido.");return}
 if(view==="co"&&!count()){go("cat");return}
 if(view==="co")prefillCheckout();
 if(view==="acct"&&!ORD.fresh){ORD.fresh=true;loadOrders().then(()=>{if(view==="acct")render()})}
 header();view==="home"?home():view==="cat"?catalog():view==="help"?help():view==="prod"?detail():view==="ok"?done():view==="login"?login():view==="acct"?acct():view==="fav"?favs():checkout();
 document.title=(view==="prod"?P[cur].name:{home:"Inicio",cat:"Catálogo",help:"Ayuda",login:AM==="up"?"Crear cuenta":"Iniciar sesión",acct:"Mis pedidos",fav:"Favoritos",co:"Finalizar pedido",ok:"Pedido confirmado"}[view])+" – STELLAR VAULT"}
function togCat(k){F.cats.has(k)?F.cats.delete(k):F.cats.add(k);render()}
$("#q").oninput=e=>{F.q=e.target.value;if(view!=="cat"){view="cat";setHash("#/catalogo")}render()};

/* --- Carrito --- */
function needLogin(msg){PENDING=null;AM="in";toast(msg,null,null,"warn");go("login")}
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
 CE=validateCo();
 if(Object.keys(CE).length){checkout();const e=document.querySelector(".f.bad input,.f.bad select");e&&e.focus();return}
 busy=true;checkout();$("#payStat").focus();
 try{
  const [,]=await Promise.all([placeOrder(),new Promise(r=>setTimeout(r,M==="deuna"?1500:600))]);
  busy=false;view="ok";setHash("");render();scrollTo(0,0);$("#app h1").focus()
 }catch(e){
  busy=false;
  if(e.errores)CE=e.errores;else toast(e.message||"No se pudo registrar tu pedido. Intenta de nuevo.",null,null,"del");
  checkout();const f=document.querySelector(".f.bad input,.f.bad select");f&&f.focus()}}
function pick(i){GI=i;const p=P[cur];$("#bigimg").innerHTML=slide(p,i,280);$("#cap").textContent=capt(p,i);document.querySelectorAll(".th button").forEach((b,j)=>b.setAttribute("aria-pressed",j===i))}
function finish(){DM="ship";M="fisico";go("home")}

/* --- Cuenta e historial --- */
function setAM(m){AM=m;render();const h=$("#app h1");h&&h.focus()}
async function authSubmit(e){
 e.preventDefault();const up=AM==="up",em=$("#a_e").value.trim().toLowerCase(),pw=$("#a_p").value,nm=up?$("#a_n").value.trim():"";
 const r=up?await registerUser(nm,em,pw):await loginUser(em,pw);
 if(r.pendiente||r.noVerificado){PENDING={email:r.email||em,simulado:r.simulado,error:r.error,seg:r.seguimiento};render();startPoll();const h=$("#app h1");h&&h.focus();return}
 if(r.error){const b=$("#aerr");b.textContent="⚠ "+r.error;b.hidden=false;b.focus();return}
 await loadFavs();
 const first=r.user.name.split(" ")[0];
 go("home");toast(up?`Cuenta creada. ¡Bienvenido, ${first}!`:`Sesión iniciada. ¡Hola, ${first}!`,null)}
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
 if(e.key==="Escape"){closeCart();return}
 if(e.key!=="Tab")return;
 const ov=document.querySelector(".ov.on");if(!ov)return;
 const els=[...ov.querySelectorAll('button,input,a[href]')].filter(x=>!x.disabled&&x.offsetParent!==null);
 if(!els.length){e.preventDefault();return}
 const f=els[0],l=els[els.length-1],out=!ov.contains(document.activeElement);
 if(e.shiftKey&&(document.activeElement===f||out)){e.preventDefault();l.focus()}
 else if(!e.shiftKey&&(document.activeElement===l||out)){e.preventDefault();f.focus()}
});

/* --- Arranque: primero se cargan los datos desde la base de datos --- */
(async function init(){
 try{await loadData();await restoreSession()}
 catch(e){$("#app").innerHTML='<div class="panel empty"><b>No se pudo conectar con el servidor.</b><br>Ejecuta <code>npm start</code> en la carpeta del proyecto y abre <code>http://localhost:3000</code>.</div>';return}
 READY=true;route();
 const vq=new URLSearchParams(location.search).get("verificacion");
 if(vq){history.replaceState(null,"",location.pathname+location.hash);if(vq==="ok")toast("Correo verificado. Ya puedes iniciar sesión.",null);else toast("El enlace de verificación no es válido o venció. Pide uno nuevo desde el registro.",null,null,"warn")}})();
