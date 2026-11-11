// All player-facing text. The simulation only ever sends ids; names are resolved here.
const TH = {
  title_sub: 'ตำนานพงไพรจันทรา',
  loading: 'กำลังปลุกผืนป่า…', load_textures: 'ถักทอผิวสัมผัส', load_terrain: 'ปั้นผืนดินและลำธาร', load_forest: 'ปลูกป่าโบราณ', load_ruins: 'ก่อซากปรักหักพัง', load_grass: 'หว่านทุ่งหญ้า', load_lights: 'จุดคบเพลิง', load_ready: 'พร้อมแล้ว',
  name_label: 'ชื่อนักผจญภัย', name_ph: 'ตั้งชื่อของคุณ', look_label: 'สีผ้าคลุมและดาบ', quality: 'คุณภาพกราฟิก', q_low: 'ต่ำ', q_medium: 'กลาง', q_high: 'สูง', q_ultra: 'สูงสุด',
  enter: 'เข้าสู่พงไพร', mode_solo: 'โลกส่วนตัว · มีนักผจญภัย AI ร่วมทาง', mode_online: 'ออนไลน์ · เชื่อมต่อเซิร์ฟเวอร์แล้ว', mode_connecting: 'กำลังค้นหาเซิร์ฟเวอร์…',
  controls_title: 'การควบคุม', controls: 'WASD เดิน · เมาส์ซ้าย ฟัน · 1-4 สกิล · Space พุ่ง · Q/E ยา · F พูดคุย/เก็บ · I กระเป๋า · J เควสต์ · M แผนที่ · ลากเมาส์ขวา หมุนกล้อง · ล้อเมาส์ ซูม',
  lv: 'Lv', hp: 'พลังชีวิต', mp: 'มานา', atk: 'พลังโจมตี', def: 'พลังป้องกัน', crit: 'คริติคอล', gold: 'ทอง', kills: 'สังหาร',
  bag: 'กระเป๋า', character: 'ตัวละคร', quests: 'เควสต์', map: 'แผนที่', settings: 'ตั้งค่า', close: 'ปิด', equipped: 'สวมใส่อยู่', empty: 'ว่าง',
  equip: 'สวมใส่', unequip: 'ถอด', drop: 'ทิ้ง', sell: 'ขาย', buy: 'ซื้อ', sell_for: 'ขาย {0} ทอง', bag_count: 'ไอเทม {0}/{1}', select_item: 'เลือกไอเทมเพื่อดูรายละเอียด',
  slot_weapon: 'อาวุธ', slot_armor: 'เกราะ', slot_trinket: 'เครื่องราง',
  rar_0: 'ธรรมดา', rar_1: 'ดี', rar_2: 'หายาก', rar_3: 'ตำนาน',
  pre_0: '', pre_1: 'แห่งพงไพร', pre_2: 'แห่งจันทรา', pre_3: 'แห่งดวงดาวนิรันดร์',
  weapon_0: 'ดาบเหล็กกล้า', weapon_1: 'ดาบเสี้ยวจันทร์', weapon_2: 'ดาบพรายราตรี', weapon_3: 'กระบี่หมอกเงิน', weapon_4: 'ดาบรากไม้โบราณ',
  armor_0: 'เสื้อคลุมนักเดินทาง', armor_1: 'เกราะหนังหมาป่า', armor_2: 'ผ้าคลุมสนธยา', armor_3: 'เกราะเปลือกไม้', armor_4: 'อาภรณ์ผู้พิทักษ์',
  trinket_0: 'เครื่องรางวิญญาณ', trinket_1: 'จี้เห็ดเรืองแสง', trinket_2: 'แหวนเขี้ยวสนธยา', trinket_3: 'ตะเกียงหิ่งห้อย', trinket_4: 'ผลึกจันทรา',
  pot_hp: 'ยาฟื้นพลังชีวิต', pot_mp: 'ยาฟื้นมานา', pot_hp_d: 'ฟื้นพลังชีวิต 45%', pot_mp_d: 'ฟื้นมานา 55%',
  sk_slash: 'ฟันจันทร์เสี้ยว', sk_slash_d: 'ฟันดาบเป็นวงโค้งด้านหน้า ครั้งที่สามแรงเป็นพิเศษ',
  sk_wave: 'คลื่นดาบจันทรา', sk_wave_d: 'ปล่อยคลื่นดาบทะลุศัตรูเป็นแนวตรง',
  sk_dash: 'ย่างก้าวเงา', sk_dash_d: 'พุ่งทะลุศัตรู สร้างความเสียหายตลอดทางและหลบการโจมตีชั่วขณะ',
  sk_nova: 'จันทราระเบิด', sk_nova_d: 'ระเบิดพลังรอบตัว ทำให้ศัตรูเชื่องช้า',
  sk_starfall: 'ดาราร่วง', sk_starfall_d: 'เรียกลำแสงดวงดาวถล่มลงตรงจุดที่เล็ง',
  cost: 'มานา {0}', cooldown: 'คูลดาวน์ {0} วิ', unlock_at: 'ปลดล็อกที่ Lv {0}',
  mob_wisp: 'ภูตพรายหม่น', mob_spore: 'เห็ดเดินดิน', mob_wolf: 'หมาป่าเขี้ยวสนธยา', mob_thorn: 'ภูตรากหนาม', mob_sentinel: 'ผู้พิทักษ์ซากโบราณ',
  npc_elder: 'ผู้เฒ่าซิลรา', npc_elder_t: 'ผู้ดูแลพงไพร', npc_merchant: 'โทวิน', npc_merchant_t: 'พ่อค้าเร่',
  zone_camp: 'ซากวิหารเฝ้าจันทร์', zone_whisper: 'ป่ากระซิบ', zone_hollow: 'หุบเห็ดเรืองแสง', zone_den: 'ดงเขี้ยวสนธยา', zone_rot: 'ป่ารากเน่า', zone_gate: 'ประตูผู้พิทักษ์',
  zone_camp_s: 'เขตปลอดภัย', zone_whisper_s: 'Lv 1-2', zone_hollow_s: 'Lv 2-3', zone_den_s: 'Lv 3-5', zone_rot_s: 'Lv 5-6', zone_gate_s: 'บอส Lv 8',
  q1_t: 'แสงในความมืด', q1_d: 'ภูตพรายหม่นเริ่มรุกล้ำเส้นทางใกล้ค่าย ช่วยกำราบพวกมันก่อนที่นักเดินทางจะหลงตามแสงลวงไป', q1_o: 'กำจัดภูตพรายหม่น',
  q2_t: 'เก็บเกี่ยวเห็ดเรืองแสง', q2_d: 'ข้าต้องการเห็ดเรืองแสงจากหุบเห็ดทางใต้เพื่อปรุงยา เดินตามทางแยกลงใต้ แล้วมองหาเห็ดที่ส่องแสงสีเขียวมรกต', q2_o: 'เก็บเห็ดเรืองแสง',
  q3_t: 'เสียงหอนยามสนธยา', q3_d: 'ฝูงหมาป่าเขี้ยวสนธยาทางเหนือดุร้ายขึ้นทุกคืน ลดจำนวนพวกมันลงเสียก่อนที่จะบุกมาถึงค่าย', q3_o: 'กำจัดหมาป่าเขี้ยวสนธยา',
  q4_t: 'รากแห่งความเน่าเปื่อย', q4_d: 'ป่าทางตะวันตกกำลังป่วยไข้ ภูตรากหนามคือต้นเหตุ จงตัดรากของมันเสีย', q4_o: 'กำจัดภูตรากหนาม',
  q5_t: 'ผู้พิทักษ์ตื่นแล้ว', q5_d: 'สุดเส้นทางตะวันตกคือประตูโบราณ ผู้พิทักษ์หินตื่นจากนิทราและคลุ้มคลั่ง จงปลดปล่อยมัน… ระวังวงสีแดงบนพื้นให้ดี', q5_o: 'ปราบผู้พิทักษ์ซากโบราณ',
  q_done_all: 'เจ้าทำทุกอย่างที่ข้าขอแล้ว ผืนป่าเป็นหนี้เจ้า นักผจญภัย ขอแสงจันทร์นำทางเจ้าเสมอ',
  q_accept: 'รับภารกิจ', q_turnin: 'ส่งภารกิจ', q_progress: 'ยังไม่เสร็จ — {0}/{1}', q_ready: 'กลับไปหาผู้เฒ่าซิลรา', q_reward: 'รางวัล', q_talk: 'ไปคุยกับผู้เฒ่าซิลราที่ซากวิหาร', q_none: 'ไม่มีภารกิจ',
  q_complete: 'ภารกิจสำเร็จ', q_new: 'ภารกิจใหม่', xp: 'ค่าประสบการณ์',
  shop_title: 'ร้านของโทวิน', shop_hint: 'เลือกไอเทมในกระเป๋าเพื่อขาย',
  prompt_talk: 'พูดคุยกับ {0}', prompt_gather: 'เก็บเห็ดเรืองแสง',
  level_up: 'เลเวลอัป!', level_up_s: 'เลเวล {0}', new_skill: 'ปลดล็อกสกิล: {0}',
  you_died: 'เจ้าล้มลงแล้ว', respawn: 'ฟื้นคืนที่ค่าย', respawn_in: 'ฟื้นได้ใน {0}',
  sys_join: '{0} เข้าสู่พงไพร', sys_leave: '{0} ออกจากพงไพร', sys_lvl: '{0} ขึ้นเป็นเลเวล {1}', sys_bagfull: 'กระเป๋าเต็ม!', sys_bosswake: 'ผู้พิทักษ์ซากโบราณตื่นขึ้นแล้ว!', sys_enrage: 'ผู้พิทักษ์คลุ้มคลั่ง!', sys_bosskill: '{0} ปราบผู้พิทักษ์ซากโบราณสำเร็จ!',
  sys_died: '{0} ล้มลง', sys_welcome: 'ยินดีต้อนรับสู่ Nightglade Online — กด Enter เพื่อพิมพ์แชต', sys_loot: 'ได้รับ {0}', sys_gold: '+{0} ทอง', sys_nomana: 'มานาไม่พอ', sys_locked: 'ยังไม่ปลดล็อก', sys_saved: 'บันทึกแล้ว', sys_disconnect: 'หลุดจากเซิร์ฟเวอร์ — เปลี่ยนเป็นโลกส่วนตัว',
  chat_ph: 'กด Enter เพื่อพิมพ์…', chat_all: 'ทั่วไป',
  sound: 'เสียง', language: 'ภาษา', quality_note: 'เปลี่ยนคุณภาพกราฟิกจะโหลดเกมใหม่', reset_save: 'ลบข้อมูลตัวละคร', reset_confirm: 'ลบตัวละครและเริ่มใหม่?', fps: 'แสดง FPS',
  players_online: 'ผู้เล่น {0}',
  bot: [
    'สวัสดี {0}! ยินดีต้อนรับสู่พงไพร', 'หวัดดี {0} ระวังภูตพรายแถวทางเดินด้วยนะ', '{0} มาแล้ว! ไปล่าด้วยกันไหม',
    'มีใครไปตีผู้พิทักษ์ด้วยกันไหม', 'คืนนี้พระจันทร์สวยจัง', 'หมาป่าทางเหนือกัดเจ็บมาก ระวังด้วย', 'เพิ่งได้ดาบสีฟ้ามา ดีใจสุด ๆ', 'ขายยาที่โทวินถูกดีนะ',
    'หุบเห็ดเรืองแสงสวยมาก แนะนำให้ไปดู', 'ใครมียาเหลือบ้าง', 'ภูตรากหนามเลือดเยอะชะมัด', 'เก็บเลเวลกันต่อ!', 'เห็นวงแดงบนพื้นให้รีบหนีนะ', 'ผู้เฒ่าซิลราให้ของรางวัลดีมาก',
    'ป่านี้ตอนกลางคืนน่ากลัวแต่ก็สวย', 'ย่างก้าวเงาใช้หนีฝูงหมาป่าได้ดีเลย', 'ขอพักที่กองไฟแป๊บ', 'gg',
  ],
};

const EN = {
  title_sub: 'Legend of the Moonlit Wood',
  loading: 'Waking the forest…', load_textures: 'Weaving surfaces', load_terrain: 'Shaping the land', load_forest: 'Growing the old wood', load_ruins: 'Raising the ruins', load_grass: 'Sowing the grass', load_lights: 'Lighting the torches', load_ready: 'Ready',
  name_label: 'Adventurer name', name_ph: 'Choose a name', look_label: 'Cloak & blade colour', quality: 'Graphics quality', q_low: 'Low', q_medium: 'Medium', q_high: 'High', q_ultra: 'Ultra',
  enter: 'Enter the Glade', mode_solo: 'Private world · AI adventurers roam with you', mode_online: 'Online · connected to server', mode_connecting: 'Looking for a server…',
  controls_title: 'Controls', controls: 'WASD move · Left mouse slash · 1-4 skills · Space dash · Q/E potions · F talk/gather · I bag · J quests · M map · Right-drag rotate camera · Wheel zoom',
  lv: 'Lv', hp: 'Health', mp: 'Mana', atk: 'Attack', def: 'Defence', crit: 'Critical', gold: 'Gold', kills: 'Kills',
  bag: 'Bag', character: 'Character', quests: 'Quests', map: 'Map', settings: 'Settings', close: 'Close', equipped: 'Equipped', empty: 'Empty',
  equip: 'Equip', unequip: 'Unequip', drop: 'Discard', sell: 'Sell', buy: 'Buy', sell_for: 'Sell for {0} gold', bag_count: 'Items {0}/{1}', select_item: 'Select an item to inspect it',
  slot_weapon: 'Weapon', slot_armor: 'Armour', slot_trinket: 'Trinket',
  rar_0: 'Common', rar_1: 'Fine', rar_2: 'Rare', rar_3: 'Legendary',
  pre_0: '', pre_1: 'of the Wood', pre_2: 'of the Moon', pre_3: 'of Eternal Stars',
  weapon_0: 'Steel Blade', weapon_1: 'Crescent Sabre', weapon_2: 'Nightwisp Sword', weapon_3: 'Silvermist Rapier', weapon_4: 'Elderroot Blade',
  armor_0: 'Wayfarer Cloak', armor_1: 'Wolfhide Vest', armor_2: 'Duskweave Mantle', armor_3: 'Barkplate', armor_4: 'Warden Raiment',
  trinket_0: 'Spirit Charm', trinket_1: 'Glowcap Pendant', trinket_2: 'Duskfang Ring', trinket_3: 'Firefly Lantern', trinket_4: 'Moon Crystal',
  pot_hp: 'Health Potion', pot_mp: 'Mana Potion', pot_hp_d: 'Restores 45% health', pot_mp_d: 'Restores 55% mana',
  sk_slash: 'Crescent Slash', sk_slash_d: 'Sweep the blade in an arc. Every third strike hits harder.',
  sk_wave: 'Moonblade Wave', sk_wave_d: 'Launch a piercing wave of moonlight in a line.',
  sk_dash: 'Shadowstep', sk_dash_d: 'Dash through enemies, cutting them and dodging attacks for a moment.',
  sk_nova: 'Lunar Nova', sk_nova_d: 'Burst of power around you that slows enemies.',
  sk_starfall: 'Starfall', sk_starfall_d: 'Call beams of starlight down on the targeted ground.',
  cost: '{0} mana', cooldown: '{0}s cooldown', unlock_at: 'Unlocks at Lv {0}',
  mob_wisp: 'Gloom Wisp', mob_spore: 'Sporecap', mob_wolf: 'Duskfang Wolf', mob_thorn: 'Thornling', mob_sentinel: 'Ruin Sentinel',
  npc_elder: 'Elder Sylra', npc_elder_t: 'Warden of the Wood', npc_merchant: 'Tovin', npc_merchant_t: 'Peddler',
  zone_camp: 'Moonwatch Ruins', zone_whisper: 'Whisperwood', zone_hollow: 'Glowcap Hollow', zone_den: 'Duskfang Thicket', zone_rot: 'Rotwood', zone_gate: "Sentinel's Gate",
  zone_camp_s: 'Safe zone', zone_whisper_s: 'Lv 1-2', zone_hollow_s: 'Lv 2-3', zone_den_s: 'Lv 3-5', zone_rot_s: 'Lv 5-6', zone_gate_s: 'Boss Lv 8',
  q1_t: 'Lights in the Dark', q1_d: 'Gloom wisps are drifting onto the road near camp. Thin them out before a traveller follows the wrong light.', q1_o: 'Defeat Gloom Wisps',
  q2_t: 'Glowcap Harvest', q2_d: 'I need glowcaps from the hollow to the south for my tonics. Take the southern fork and look for mushrooms shining emerald.', q2_o: 'Gather Glowcaps',
  q3_t: 'Howls at Dusk', q3_d: 'The duskfang packs to the north grow bolder each night. Cull them before they reach the camp.', q3_o: 'Defeat Duskfang Wolves',
  q4_t: 'Roots of Rot', q4_d: 'The western wood is sickening, and the thornlings are the cause. Cut them out at the root.', q4_o: 'Defeat Thornlings',
  q5_t: 'The Sentinel Wakes', q5_d: 'At the end of the western road stands an ancient gate. Its stone guardian has woken, maddened. Free it… and mind the red circles on the ground.', q5_o: 'Defeat the Ruin Sentinel',
  q_done_all: 'You have done all I asked. The forest is in your debt, adventurer. May the moon light your road.',
  q_accept: 'Accept quest', q_turnin: 'Complete quest', q_progress: 'Not finished — {0}/{1}', q_ready: 'Return to Elder Sylra', q_reward: 'Reward', q_talk: 'Speak with Elder Sylra at the ruins', q_none: 'No active quest',
  q_complete: 'Quest complete', q_new: 'New quest', xp: 'XP',
  shop_title: "Tovin's Wares", shop_hint: 'Select an item in your bag to sell it',
  prompt_talk: 'Talk to {0}', prompt_gather: 'Gather glowcap',
  level_up: 'Level Up!', level_up_s: 'Level {0}', new_skill: 'Skill unlocked: {0}',
  you_died: 'You have fallen', respawn: 'Revive at camp', respawn_in: 'Revive in {0}',
  sys_join: '{0} entered the glade', sys_leave: '{0} left the glade', sys_lvl: '{0} reached level {1}', sys_bagfull: 'Your bag is full!', sys_bosswake: 'The Ruin Sentinel has awoken!', sys_enrage: 'The Sentinel is enraged!', sys_bosskill: '{0} has defeated the Ruin Sentinel!',
  sys_died: '{0} has fallen', sys_welcome: 'Welcome to Nightglade Online — press Enter to chat', sys_loot: 'Received {0}', sys_gold: '+{0} gold', sys_nomana: 'Not enough mana', sys_locked: 'Not unlocked yet', sys_saved: 'Saved', sys_disconnect: 'Lost the server — switched to a private world',
  chat_ph: 'Press Enter to chat…', chat_all: 'General',
  sound: 'Sound', language: 'Language', quality_note: 'Changing graphics quality reloads the game', reset_save: 'Delete character', reset_confirm: 'Delete this character and start over?', fps: 'Show FPS',
  players_online: '{0} players',
  bot: [
    'Hello {0}! Welcome to the glade.', 'Hey {0}, watch out for wisps on the road.', '{0} is here! Want to hunt together?',
    'Anyone up for the Sentinel?', 'The moon is beautiful tonight.', 'Those northern wolves bite hard, careful.', 'Just found a blue sword, so happy!', "Tovin's potions are cheap, stock up.",
    'Glowcap Hollow is gorgeous, go see it.', 'Anyone got spare potions?', 'Thornlings have way too much health.', 'Back to grinding!', 'Red circle on the ground? Run.', 'Elder Sylra gives great rewards.',
    'This forest is scary at night, but pretty.', 'Shadowstep is great for escaping wolf packs.', 'Resting by the fire for a bit.', 'gg',
  ],
};

const DICT = { th: TH, en: EN };
let lang = 'th';
export function setLang(l) { lang = DICT[l] ? l : 'th'; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function t(key, ...args) {
  let s = DICT[lang][key];
  if (s === undefined) s = EN[key];
  if (s === undefined) return key;
  return args.length ? s.replace(/\{(\d)\}/g, (_, i) => args[+i]) : s;
}
export function botLine(i, who) { const l = DICT[lang].bot[i] || EN.bot[i] || '…'; return l.replace('{0}', who || ''); }
export function itemName(it) {
  const base = t(it.slot + '_' + it.base), pre = t('pre_' + it.q);
  return pre ? `${base} ${pre}` : base;
}
export const RARITY_COLORS = ['#d8dde6', '#62e07a', '#58a8ff', '#c77dff'];
