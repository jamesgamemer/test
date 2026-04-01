/* ============================================================
   7DS ORIGIN - EVENTS DATABASE MODULE (LOCAL MODE)
   Handles Events CRUD via localStorage only
   ============================================================ */

var EventDB = (function () {

  function init() {
    console.log('[EventDB] Initialized (local mode)');
  }

  function isSupabase() {
    return false;
  }

  /* ── CRUD Operations ── */
  async function fetchAll() {
    return _localFetchAll();
  }

  async function fetchById(id) {
    return _localFindById(id);
  }

  async function add(eventData) {
    return _localAdd(eventData);
  }

  async function update(id, eventData) {
    return _localUpdate(id, eventData);
  }

  async function remove(id) {
    return _localRemove(id);
  }

  async function uploadImage(file, eventSlug) {
    /* Local mode: convert to data URL */
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        resolve({ error: null, url: e.target.result });
      };
      reader.onerror = function() {
        resolve({ error: { message: 'Failed to read file' }, url: null });
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── localStorage Operations ── */
  function _localFetchAll() {
    var stored = localStorage.getItem('7ds_events');
    if (stored) {
      try { return JSON.parse(stored); } catch(e) {}
    }
    var defaults = _getDefaults();
    localStorage.setItem('7ds_events', JSON.stringify(defaults));
    return defaults;
  }

  function _localFindById(id) {
    var all = _localFetchAll();
    return all.find(function(e) { return e.id == id; }) || null;
  }

  function _localAdd(eventData) {
    var all = _localFetchAll();
    eventData.id = Date.now();
    all.push(eventData);
    localStorage.setItem('7ds_events', JSON.stringify(all));
    return { data: eventData, error: null };
  }

  function _localUpdate(id, eventData) {
    var all = _localFetchAll();
    var idx = all.findIndex(function(e) { return e.id == id; });
    if (idx !== -1) {
      eventData.id = id;
      all[idx] = eventData;
      localStorage.setItem('7ds_events', JSON.stringify(all));
      return { data: eventData, error: null };
    }
    return { data: null, error: { message: 'Event not found' } };
  }

  function _localRemove(id) {
    var all = _localFetchAll();
    all = all.filter(function(e) { return e.id != id; });
    localStorage.setItem('7ds_events', JSON.stringify(all));
    return { error: null };
  }

  function _getDefaults() {
    return [
      { id:1, status:'active', tag:'event', title:'Holy War Raid', desc:'Team up with allies to defeat the Demon King in the limited-time Holy War Raid. Earn exclusive SSR shards and rare equipment.', start:'2026-03-01', end:'2026-03-15', color:'linear-gradient(90deg,#3b82f6,#60a5fa)', image:'', rewards:['SSR Shard x3','Gold x50,000','Raid Medal x20'] },
      { id:2, status:'active', tag:'update', title:'New Character: Tristan', desc:'The son of Meliodas and Elizabeth joins the battle. Limited banner available for a short time with boosted SSR rates.', start:'2026-03-05', end:'2026-03-20', color:'linear-gradient(90deg,#f0c040,#ffd966)', image:'', rewards:['Tristan SSR','Summon Ticket x10','Gems x500'] },
      { id:3, status:'active', tag:'event', title:'Daily Login Bonus', desc:'Log in every day during March to collect cumulative rewards including gems, tickets, and rare materials.', start:'2026-03-01', end:'2026-03-31', color:'linear-gradient(90deg,#0be881,#34d399)', image:'', rewards:['Gems x1,200','Summon Ticket x5','EXP Potion x30'] },
      { id:4, status:'upcoming', tag:'event', title:'Guild War Season 4', desc:'Compete against guilds worldwide in the new Guild War season. Climb the leaderboard to earn exclusive guild rewards.', start:'2026-03-20', end:'2026-04-05', color:'linear-gradient(90deg,#a78bfa,#c4b5fd)', image:'', rewards:['Guild Crest','Gems x2,000','Exclusive Title'] },
      { id:5, status:'upcoming', tag:'event', title:'Spring Festival', desc:'Celebrate the spring season with special story quests, limited cosmetics, and a special gacha banner featuring seasonal costumes.', start:'2026-03-25', end:'2026-04-10', color:'linear-gradient(90deg,#f472b6,#fb7185)', image:'', rewards:['Spring Costume','Gems x800','Flower Tokens x100'] },
      { id:6, status:'ended', tag:'event', title:"Valentine's Day Event", desc:"A special event celebrating Valentine's Day with exclusive story content and limited cosmetics.", start:'2026-02-10', end:'2026-02-28', color:'linear-gradient(90deg,#f43f5e,#fb7185)', image:'', rewards:['Heart Charm','Gems x600','Valentine Frame'] }
    ];
  }

  return {
    init: init,
    isSupabase: isSupabase,
    fetchAll: fetchAll,
    fetchById: fetchById,
    add: add,
    update: update,
    remove: remove,
    uploadImage: uploadImage
  };
})();
