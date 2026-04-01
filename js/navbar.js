/* ============================================================
   NAVBAR SYSTEM (v3 - Local Admin Auth, No Supabase)
   ============================================================ */

/* NAV MAP */
const navMap = {
  'index.html': { icon: '\u{1F3E0}', key: 'nav_home' },
  'characters.html': { icon: '\u2694', key: 'nav_characters' },
  'weapons.html': { icon: '\u{1F5E1}', key: 'nav_weapons' },
  'tierlist.html': { icon: '\u{1F3C6}', key: 'nav_tierlist' },
  'events.html': { icon: '\u{1F389}', key: 'nav_events' },
  'guides.html': { icon: '\u{1F4D8}', key: 'nav_guides' }
};


/* ============================================================
   INIT NAVBAR
   ============================================================ */

function initNavbar(){

if(window._navbarInitDone) return;
window._navbarInitDone = true;

renderNavbar();
setupLangSwitch();
injectAuthUI();
setupHamburger();
applyNavI18n();

if(typeof I18n !== 'undefined'){
  I18n.onChange(function(){
    applyNavI18n();
  });
}

}


/* ============================================================
   RENDER NAVBAR
   ============================================================ */

function renderNavbar(){

document.querySelectorAll('.navbar-links > li > a').forEach(function(a){

var href = a.getAttribute('href');
if(!href) return;

var page = href.split('/').pop();
var mapping = navMap[page];
if(!mapping) return;

a.innerHTML='';

var icon=document.createElement("span");
icon.className="nav-icon";
icon.innerHTML=mapping.icon;

var text=document.createElement("span");
text.className="nav-text";
text.textContent=getLabel(mapping.key);

a.appendChild(icon);
a.appendChild(document.createTextNode(' '));
a.appendChild(text);

});

}


/* ============================================================
   LANGUAGE UPDATE
   ============================================================ */

function applyNavI18n(){

document.querySelectorAll('.navbar-links > li > a').forEach(function(a){

var href=a.getAttribute('href');
if(!href) return;

var page=href.split('/').pop();
var mapping=navMap[page];
if(!mapping) return;

var text=a.querySelector('.nav-text');

if(text){
text.textContent=getLabel(mapping.key);
}

});

}


/* ============================================================
   LANGUAGE SWITCH
   ============================================================ */

function setupLangSwitch(){

var navLinks=document.getElementById('navLinks');
if(!navLinks||navLinks.querySelector('.nav-lang-switcher')) return;

var li=document.createElement('li');
li.className='nav-lang-switcher';

var current=getLang();

li.innerHTML=
'<div class="lang-switch-group">'+
'<button class="lang-btn '+(current==='en'?'active':'')+'" data-lang="en">EN</button>'+
'<span class="lang-divider">|</span>'+
'<button class="lang-btn '+(current==='th'?'active':'')+'" data-lang="th">TH</button>'+
'</div>';

navLinks.appendChild(li);

li.querySelectorAll('.lang-btn').forEach(function(btn){

btn.addEventListener('click',function(){

var lang=btn.dataset.lang;

if(typeof I18n!=='undefined'){
I18n.setLang(lang);
}

li.querySelectorAll('.lang-btn').forEach(function(b){
b.classList.toggle('active',b.dataset.lang===lang);
});

applyNavI18n();

});

});

}


/* ============================================================
   HAMBURGER
   ============================================================ */

function setupHamburger(){

var ham=document.getElementById('navHam');
var links=document.getElementById('navLinks');

if(ham&&links){
ham.addEventListener('click',function(){
links.classList.toggle('open');
});
}

}


/* ============================================================
   AUTH MENU (v3 - Local Admin Only, No Supabase)
   ============================================================ */

async function injectAuthUI(){

var navLinks=document.getElementById('navLinks');
if(!navLinks||navLinks.querySelector('.nav-auth-item')) return;

var li=document.createElement('li');
li.className='nav-auth-item';

/* ── Check Admin via AdminAuth ── */
var isAdmin=false;

if(typeof AdminAuth!=='undefined'){
  try{
    isAdmin=AdminAuth.isLoggedIn();
  }catch(e){
    console.warn('[Navbar] Admin check error:', e);
  }
}

if(isAdmin){
  var session=(typeof AdminAuth!=='undefined')?AdminAuth.getSession():null;
  var adminName=(session&&session.username)?session.username:'Admin';
  var initial=adminName.charAt(0).toUpperCase();

  li.innerHTML=
  '<div class="nav-profile-wrapper">'+
  '<button class="nav-profile-avatar nav-admin-avatar" id="profileAvatarBtn" title="Admin: '+escNavHtml(adminName)+'">'+initial+'</button>'+
  '<div class="nav-profile-menu" id="profileMenu">'+
  '<div class="profile-menu-header">'+
  '<span class="profile-menu-role">ADMIN</span>'+
  '<span class="profile-menu-email">'+escNavHtml(adminName)+'</span>'+
  '</div>'+
  '<div class="profile-menu-divider"></div>'+
  '<a href="admin.html" class="profile-menu-item">&#128202; Dashboard</a>'+
  '<a href="characters.html" class="profile-menu-item">&#9876; Characters</a>'+
  '<a href="tierlist.html" class="profile-menu-item">&#127942; Tier List</a>'+
  '<a href="events.html" class="profile-menu-item">&#127881; Events</a>'+
  '<a href="guides.html" class="profile-menu-item">&#128218; Guides</a>'+
  '<div class="profile-menu-divider"></div>'+
  '<button class="profile-menu-item logout-item" onclick="if(typeof AdminAuth!==\'undefined\')AdminAuth.logout();">&#128682; Logout</button>'+
  '</div>'+
  '</div>';

  navLinks.appendChild(li);
  _bindProfileMenu();
  return;
}

/* ── Not logged in - Show Login button ── */
li.innerHTML=
'<a href="login.html" class="nav-login-btn">'+
'<span class="nav-login-icon">&#128274;</span> Login'+
'</a>';

navLinks.appendChild(li);

}

/* ── Bind profile menu toggle ── */
function _bindProfileMenu(){
var avatar=document.getElementById('profileAvatarBtn');
var menu=document.getElementById('profileMenu');
if(!avatar||!menu) return;

avatar.addEventListener('click',function(e){
  e.stopPropagation();
  menu.classList.toggle('open');
});

document.addEventListener('click',function(e){
  if(!menu.contains(e.target)&&e.target!==avatar){
    menu.classList.remove('open');
  }
});
}


/* ============================================================
   UTIL
   ============================================================ */

function getLabel(key){

if(typeof I18n!=='undefined'){
return I18n.t(key);
}

return key;

}

function getLang(){

if(typeof I18n!=='undefined'){
return I18n.getLang();
}

return 'en';

}

function escNavHtml(str){
var div=document.createElement('div');
div.textContent=str||'';
return div.innerHTML;
}


/* ============================================================
   START
   ============================================================ */

if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',initNavbar);
}else{
initNavbar();
}
