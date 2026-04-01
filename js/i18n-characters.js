/* ============================================================
   7DS ORIGIN - CHARACTER TRANSLATIONS (TH)
   Thai translations for all character descriptions, skills,
   potentials, costumes, weapon types, and skill types.
   ============================================================ */

var CharTranslations = (function () {

  /* ---- Weapon Type Names ---- */
  var weaponTypes = {
    en: {
      'Longsword': 'Longsword',
      'Axe': 'Axe',
      'Dual Swords': 'Dual Swords',
      'Greatsword': 'Greatsword',
      'Gauntlets': 'Gauntlets',
      'Cudgel': 'Cudgel',
      'Shield': 'Shield',
      'Book': 'Book',
      'Wand': 'Wand',
      'Staff': 'Staff',
      'Lance': 'Lance',
      'Rapier': 'Rapier'
    },
    th: {
      'Longsword': 'ดาบยาว',
      'Axe': 'ขวาน',
      'Dual Swords': 'ดาบคู่',
      'Greatsword': 'ดาบใหญ่',
      'Gauntlets': 'ถุงมือเหล็ก',
      'Cudgel': 'กระบอง',
      'Shield': 'โล่',
      'Book': 'หนังสือ',
      'Wand': 'ไม้กายสิทธิ์',
      'Staff': 'คทา',
      'Lance': 'หอก',
      'Rapier': 'เรเปียร์'
    }
  };

  /* ---- Skill Type Names ---- */
  var skillTypes = {
    en: {
      'Adventure': 'Adventure',
      'Passive': 'Passive',
      'Normal Attack': 'Normal Attack',
      'Normal': 'Normal',
      'Special': 'Special',
      'Skill': 'Skill',
      'Tag': 'Tag',
      'Chain': 'Chain',
      'Ultimate': 'Ultimate'
    },
    th: {
      'Adventure': 'ผจญภัย',
      'Passive': 'พาสซีฟ',
      'Normal Attack': 'โจมตีปกติ',
      'Normal': 'ปกติ',
      'Special': 'พิเศษ',
      'Skill': 'สกิล',
      'Tag': 'แท็ก',
      'Chain': 'เชน',
      'Ultimate': 'ท่าไม้ตาย'
    }
  };

  /* ---- UI Labels ---- */
  var uiLabels = {
    en: {
      'All': 'All',
      'Description': 'Description',
      'Weapon Types:': 'Weapon Types:',
      'Skills': 'Skills',
      'Potentials': 'Potentials',
      'Costumes': 'Costumes',
      'Tier': 'Tier',
      'Back to Characters': 'Back to Characters',
      'Loading character data...': 'Loading character data...',
      'Character not found.': 'Character not found.',
      'No character selected.': 'No character selected.',
      'Skills data will be added soon.': 'Skills data will be added soon.'
    },
    th: {
      'All': 'ทั้งหมด',
      'Description': 'รายละเอียด',
      'Weapon Types:': 'ประเภทอาวุธ:',
      'Skills': 'สกิล',
      'Potentials': 'พอเทนเชียล',
      'Costumes': 'คอสตูม',
      'Tier': 'เทียร์',
      'Back to Characters': 'กลับไปหน้าตัวละคร',
      'Loading character data...': 'กำลังโหลดข้อมูลตัวละคร...',
      'Character not found.': 'ไม่พบตัวละคร',
      'No character selected.': 'ยังไม่ได้เลือกตัวละคร',
      'Skills data will be added soon.': 'ข้อมูลสกิลจะเพิ่มเร็วๆ นี้'
    }
  };

  /* ---- Character Descriptions ---- */
  var descriptions = {
    th: {
      'Ban': 'สมาชิกของ <บาปมหันต์ทั้งเจ็ด> ผู้แบกรับตราแห่งความโลภ เขาได้รับความเป็นอมตะหลังจากดื่มน้ำจากน้ำพุแห่งความเยาว์วัยในป่าของราชานางฟ้า แม้ภายนอกจะดูหยาบกระด้าง แต่เขาเป็นเชฟฝีมือเยี่ยมที่มีความละเอียดอ่อน',
      'Bug': 'แม้จะเป็นปีศาจ แต่เขาแอบชื่นชม <บาปมหันต์ทั้งเจ็ด> ที่เอาชนะทั้งราชาปีศาจและ <บัญญัติสิบประการ> ได้ ปกติเขาจะอยู่ในร่างชายสูงแข็งแรง แต่สามารถแปลงร่างเป็นสัตว์ประหลาดตัวเล็กได้เมื่อสถานการณ์ต้องการ',
      'Daisy': 'นางฟ้าที่ถูกส่งมาจากอดีตอันไกลโพ้น เธอได้สร้างสิ่งประดิษฐ์ลึกลับขณะทำวิจัยร่วมกับนักสำรวจจากหลายเผ่าพันธุ์ ด้วยโชคชะตาหรือความบังเอิญ เธอได้พบกับทริสตันและเพื่อนๆ และถูกดึงเข้าสู่ความวุ่นวายที่สั่นสะเทือนทั่วบริทาเนีย',
      'Derieri': 'ปีศาจแห่ง <บัญญัติสิบประการ> หน่วยรบชั้นยอดของราชาปีศาจ เธอได้รับบัญญัติแห่ง「ความบริสุทธิ์」และใช้พลังเวทย์ "คอมโบสตาร์" เธอมักพูดสั้นๆ ห้วนๆ จนมอนสปีทเพื่อนคู่หูต้องคอยเป็นล่ามให้',
      'Diane': 'สมาชิกของ <บาปมหันต์ทั้งเจ็ด> ผู้แบกรับตราแห่งความอิจฉา ในอดีตเธอถูกกล่าวหาว่าเป็นกบฏอย่างเท็จและหลบซ่อนตัว ในที่สุดก็ไปตั้งรกรากที่ป่าแห่งความฝันสีขาว เธอมีความชื่นชอบเมลิโอดาส หัวหน้าของ <บาปมหันต์ทั้งเจ็ด>',
      'Drake': 'ในฐานะราชาแห่งเผ่าดราโก้ เขามีความรักและอุทิศตนต่อเผ่าพันธุ์ของตนอย่างลึกซึ้ง เมื่อรู้ว่าเผ่าพันธุ์ของตนถูกกำหนดให้สูญสิ้น เขาจึงสาบานว่าจะฟื้นคืนชีพมังกรผู้เฒ่าและนำเผ่าดราโก้สู่ยุคแห่งความรุ่งเรืองใหม่',
      'Dreydrin': 'อัศวินศักดิ์สิทธิ์ฝึกหัดแห่งราชอาณาจักรไลโอเนส เขาพิสูจน์ฝีมือที่โดดเด่นด้วยการได้รับตำแหน่งตั้งแต่อายุเพียงสิบสามปี เขาเป็นคนอ่อนโยนที่รักดอกไม้และพืชพรรณเป็นอย่างมาก',
      'Dreyfus': 'ครูสอนดาบแห่งราชอาณาจักรไลโอเนส ในอดีตเขาเคยดำรงตำแหน่งแกรนด์มาสเตอร์ของอัศวินศักดิ์สิทธิ์ แต่ถูกฟรอดรินปีศาจเข้าสิงเป็นเวลาสิบปี ตอนนี้เขาอุทิศตนฝึกฝนคนรุ่นใหม่ในเมืองหลวง เขาเป็นพ่อของกรีอามอร์และปู่ของเดรย์ดริน',
      'Elaine': 'เอเลนปกป้องป่าของราชานางฟ้าแทนพี่ชายที่จากไปเมื่อ 700 ปีก่อน มีข่าวลือว่าเธอเป็นนักบุญผู้พิทักษ์น้ำพุแห่งความเยาว์วัย',
      'Elizabeth': 'เจ้าหญิงองค์ที่สามแห่งราชอาณาจักรไลโอเนส ด้วยความมุ่งมั่นที่จะช่วยอาณาจักรจากอัศวินศักดิ์สิทธิ์ที่วางแผนโค่นล้ม เธอจึงออกจากเมืองหลวงเพื่อตามหา <บาปมหันต์ทั้งเจ็ด> โดยบังเอิญเธอได้พบกับเมลิโอดาสและเริ่มต้นการเดินทางร่วมกันเพื่อตามหาสมาชิกคนอื่นๆ',
      'Escanor': 'สมาชิกของ <บาปมหันต์ทั้งเจ็ด> ผู้แบกรับตราแห่งความหยิ่งผยอง เขาใช้เวทย์ "ซันไชน์" ตอนกลางคืนเขาอ่อนแอ แต่จะแข็งแกร่งอย่างเหลือเชื่อในตอนกลางวัน โดยเฉพาะช่วงเที่ยง',
      'Gilthunder': 'อัศวินศักดิ์สิทธิ์แห่งราชอาณาจักรไลโอเนส ลูกชายของอดีตแกรนด์มาสเตอร์ซาราทราส และผู้ใช้เวทย์ "สายฟ้า" เขาเสียใจกับอดีตที่เป็นคนทรยศต่ออาณาจักร ชะตากรรมที่เขาต้องทนเพื่อปกป้องคนที่รัก เขาเป็นหนึ่งในสามทหารเกเรร่วมกับฮาวเซอร์และกรีอามอร์',
      'Gowther': 'เขากลายเป็น <บาปแห่งตัณหาของแพะ> หลังจากทำให้ราชวงศ์เสียชีวิตด้วยตัณหาอันบ้าคลั่ง แปลกที่ไม่มีใครสามารถรับรู้อารมณ์ของมนุษย์จากเขาได้',
      'Griamore': 'อัศวินศักดิ์สิทธิ์แห่งไลโอเนส ลูกชายของอดีตแกรนด์มาสเตอร์เดรย์ฟัส และผู้ใช้เวทย์ "กำแพง" เขาพร้อมทำทุกอย่างเพื่อเจ้าหญิงเวโรนิก้า เขาเป็นหนึ่งในสามทหารเกเรร่วมกับฮาวเซอร์และกิลธันเดอร์',
      'Guila': 'รองแกรนด์มาสเตอร์แห่งราชอาณาจักรไลโอเนส เธอได้รับตำแหน่งตั้งแต่อายุเพียง 22 ปี ด้วยฝีมือที่โดดเด่น เธอพร้อมทำทุกอย่างเพื่อซีล ครอบครัวเพียงคนเดียวของเธอ',
      'Hendrickson': 'ดรูอิดผู้ดำเนินร้านขายยาในปัจจุบัน ในอดีตเขาเคยดำรงตำแหน่งแกรนด์มาสเตอร์ของอัศวินศักดิ์สิทธิ์ แต่ถูกฟรอดรินล้างสมองและกระทำเพื่อฟื้นคืนชีพปีศาจ ตั้งแต่หลุดพ้นจากการควบคุม เขาอุทิศตนอย่างไม่รู้จักเหน็ดเหนื่อยเพื่อชดใช้ความผิดในอดีต',
      'Howzer': 'แกรนด์มาสเตอร์คนปัจจุบันของอัศวินศักดิ์สิทธิ์แห่งราชอาณาจักรไลโอเนส เทคนิคของเขาใช้เวทย์「พายุ」 เขาเกิดเป็นสามัญชนแต่ไต่เต้าจนได้เป็นแกรนด์มาสเตอร์ เขามีสำนึกในหน้าที่อย่างแรงกล้าในการปกป้องอาณาจักร',
      'Jericho': 'เธอเคยเป็นอัศวินศักดิ์สิทธิ์แห่งไลโอเนสและยังเป็นอาจารย์ของแลนสล็อต ลูกของบานและเอเลน ด้วยเหตุผลที่ไม่ทราบ เธอกลายเป็นอัศวินศักดิ์สิทธิ์แห่งคาเมลอตภายใต้การปกครองของกษัตริย์อาเธอร์ และตอนนี้อยู่ในสถานะขัดแย้งกับไลโอเนส',
      'King': 'สมาชิกของ <บาปมหันต์ทั้งเจ็ด> ผู้แบกรับตราแห่งความเกียจคร้าน เขายังเป็นที่รู้จักในนาม ฮาร์เลควิน ราชาแห่งนางฟ้า หลังจากสูญเสียทุกสิ่งที่รักในช่วง 700 ปีที่จากป่าไป เขาทิ้งชื่อฮาร์เลควินและใช้ชีวิตในนาม คิง สมาชิกของ <บาปมหันต์ทั้งเจ็ด>',
      'Klotho': 'นักวิชาการลึกลับที่ไม่ทราบที่มา แม้เธอมักพูดและทำอะไรเป็นปริศนา แต่เธอมีความรู้ที่เหนือกว่าคนอื่นมาก ด้วยเหตุผลที่ไม่ทราบ เธอวนเวียนอยู่รอบทริสตัน คอยให้คำแนะนำที่ลึกลับแต่เปี่ยมด้วยปัญญา',
      'Manny': 'นักบวชหญิงแมนนี่แห่งเผ่าดราโก้ เธอมีรูปลักษณ์แตกต่างจากดราโก้ตัวอื่น แต่ทำให้เธอดูมีความศักดิ์สิทธิ์',
      'Meliodas': 'เจ้าของโรงเตี๊ยมเคลื่อนที่ <หมวกหมูป่า> และหัวหน้าของ <บาปมหันต์ทั้งเจ็ด> ที่ถูกต้องการตัวในข้อหาพยายามโค่นล้มอาณาจักร ปัจจุบันเขากำลังเดินทางกับเอลิซาเบธ เจ้าหญิงองค์ที่สามแห่งไลโอเนส เพื่อตามหาสมาชิกของ <บาปมหันต์ทั้งเจ็ด> ที่กระจัดกระจายทั่วแผ่นดิน',
      'Merlin': 'สมาชิกของ <บาปมหันต์ทั้งเจ็ด> ผู้แบกรับตราแห่งความตะกละ แม้เธอจะมีความรู้มากมาย แต่ความกระหายในการเรียนรู้ของเธอไม่มีวันอิ่ม ไม่ว่าจะเป็นความท้าทายใด เธอจะไม่หยุดจนกว่าจะค้นพบคำตอบที่ต้องการ',
      'Slader': 'อดีตหัวหน้าของ <เสียงคำรามแห่งรุ่งอรุณ> คณะอัศวินที่เคยรับใช้กษัตริย์โดยตรง เขามีความจงรักภักดีอย่างไม่สั่นคลอนต่ออดีตกษัตริย์บาร์ทรา และยังคงปฏิบัติตามพระประสงค์ของพระองค์',
      'Tioreh': 'ลูกคนที่เจ็ดของคิง ราชานางฟ้า และไดแอน ราชินียักษ์ ไม่อาจต้านทานความปรารถนาและความอยากรู้เกี่ยวกับโลกภายนอก เธอจึงออกจากป่าของราชานางฟ้าเพื่อเดินทางไปยังราชอาณาจักรไลโอเนส แม้ความกล้าของเธออาจทำให้เกิดความเข้าใจผิดบ้าง แต่เธอมีหัวใจที่อบอุ่นและใจดี',
      'Tristan': 'ลูกชายของเมลิโอดาสและเอลิซาเบธ และเจ้าชายแห่งราชอาณาจักรไลโอเนส เขาชื่นชมและเคารพ <บาปมหันต์ทั้งเจ็ด> แม้จะสุภาพและรอบคอบโดยนิสัย แต่เขาจะเผชิญกับอันตรายใดๆ หากมันหมายถึงการปกป้องคนที่เขาห่วงใย'
    }
  };

  /* ---- Costume Names ---- */
  var costumes = {
    th: {
      // Bug
      'Shy Demon': 'ปีศาจขี้อาย',
      "Demon's Outing": 'ปีศาจท่องเที่ยว',
      'Shadow Walk': 'เดินในเงามืด',
      "Demon's Stealth": 'การซ่อนตัวของปีศาจ',
      'Keen Instinct': 'สัญชาตญาณเฉียบคม',
      // Daisy
      'Fairy of the Past': 'นางฟ้าจากอดีต',
      'Small Explorer': 'นักสำรวจตัวน้อย',
      'Autumn Scent': 'กลิ่นฤดูใบไม้ร่วง',
      // Diane
      'Giant Girl in Love': 'สาวยักษ์ที่กำลังมีความรัก',
      'Tavern Hostess': 'สาวเสิร์ฟโรงเตี๊ยม',
      '<The Serpent Sin of Envy>': '<บาปงูแห่งความอิจฉา>',
      'Cheerful Girl': 'สาวร่าเริง',
      // Drake
      'Dragon Descendent': 'ทายาทมังกร',
      'Oath of the Throne': 'คำสาบานแห่งบัลลังก์',
      'Glory of the Past': 'เกียรติยศแห่งอดีต',
      'Shadow Lord': 'จ้าวแห่งเงามืด',
      // Dreydrin
      'Friendly Apprentice Holy Knight': 'อัศวินศักดิ์สิทธิ์ฝึกหัดผู้เป็นมิตร',
      'A Nice Day Off': 'วันหยุดที่แสนดี',
      'Descendant of Royalty': 'ทายาทราชวงศ์',
      'Thorough Preparation': 'การเตรียมตัวอย่างถี่ถ้วน',
      'Solid Defense': 'การป้องกันอันแน่นหนา',
      // Dreyfus
      'Kingdom Sword Art Instructor': 'ครูสอนดาบแห่งราชอาณาจักร',
      'Royal Butler': 'บัตเลอร์ราชสำนัก',
      "Old Soldier's Honor": 'เกียรติยศทหารเก่า',
      'Simple Attire': 'ชุดเรียบง่าย',
      'Honorable Knight': 'อัศวินผู้ทรงเกียรติ',
      // Elaine
      'Guardian Saint of the Fountain of Youth': 'นักบุญผู้พิทักษ์น้ำพุแห่งความเยาว์วัย',
      'Temp Employee': 'พนักงานชั่วคราว',
      'Guiding Light': 'แสงนำทาง',
      'Cheerful Outing': 'ท่องเที่ยวอย่างร่าเริง',
      "Saintess's Dignity": 'ศักดิ์ศรีของนักบุญหญิง',
      // Gilthunder
      'Young Holy Knight': 'อัศวินศักดิ์สิทธิ์หนุ่ม',
      'Exemplary Holy Knight': 'อัศวินศักดิ์สิทธิ์ตัวอย่าง',
      'Holy Knight of Lightning': 'อัศวินศักดิ์สิทธิ์แห่งสายฟ้า',
      'Exemplary Adventure': 'การผจญภัยตัวอย่าง',
      'Promising Holy Knight': 'อัศวินศักดิ์สิทธิ์ผู้มีอนาคต',
      // Griamore
      "Princess's Guardian Knight": 'อัศวินผู้พิทักษ์เจ้าหญิง',
      'Casual Outing': 'ท่องเที่ยวสบายๆ',
      'Holy Knight of the Iron Wall': 'อัศวินศักดิ์สิทธิ์แห่งกำแพงเหล็ก',
      'Makeshift Barricade': 'แนวกั้นชั่วคราว',
      'Impregnable Iron Fortress': 'ป้อมเหล็กที่ไม่อาจทะลุ',
      // Guila
      'One and Only Holy Knight': 'อัศวินศักดิ์สิทธิ์หนึ่งเดียว',
      'Family Time': 'เวลาครอบครัว',
      'Holy Knight of Explosions': 'อัศวินศักดิ์สิทธิ์แห่งการระเบิด',
      'Light Footsteps': 'ก้าวเท้าเบาๆ',
      "Crimson Flame's Trail": 'เส้นทางเปลวไฟสีแดง',
      // Hendrickson
      'Liones Apothecary': 'ร้านขายยาไลโอเนส',
      'Romantic Gray': 'สีเทาโรแมนติก',
      'A Suit From Younger Days': 'ชุดสูทจากวัยหนุ่ม',
      "Apothecary's Workwear": 'ชุดทำงานร้านขายยา',
      'Returned Holy Knight': 'อัศวินศักดิ์สิทธิ์ผู้กลับมา',
      // Howzer
      'Trusted Grandmaster': 'แกรนด์มาสเตอร์ที่ไว้วางใจ',
      'End-of-Day Mug of Ale': 'แก้วเบียร์ยามเย็น',
      'Holy Knight of Storms': 'อัศวินศักดิ์สิทธิ์แห่งพายุ',
      'Secure Adventure': 'การผจญภัยอย่างปลอดภัย',
      "Grandmaster's Dignity": 'ศักดิ์ศรีแกรนด์มาสเตอร์',
      // Jericho
      'Runaway Holy Knight': 'อัศวินศักดิ์สิทธิ์ผู้หลบหนี',
      'Leisurely Moment': 'ช่วงเวลาพักผ่อน',
      'Holy Knight With the Star-Shaped Visor': 'อัศวินศักดิ์สิทธิ์ผู้มีหน้ากากรูปดาว',
      'Secretive Traveler': 'นักเดินทางลึกลับ',
      'Trace of Memories': 'ร่องรอยแห่งความทรงจำ',
      // King
      'Inexperienced Fairy King': 'ราชานางฟ้าผู้ไร้ประสบการณ์',
      "Forest's Footsteps": 'รอยเท้าแห่งป่า',
      '<The Grizzly Sin of Sloth>': '<บาปหมีแห่งความเกียจคร้าน>',
      'Shadow of the Deep Forest': 'เงาแห่งป่าลึก',
      // Manny
      'Exalted Priestess': 'นักบวชหญิงผู้สูงส่ง',
      'Heart of Prayer': 'หัวใจแห่งการสวดมนต์',
      "Arch Priestess's Prestige": 'เกียรติยศของมหานักบวชหญิง',
      'Exploration of the Unknown': 'การสำรวจสิ่งที่ไม่รู้',
      // Meliodas
      'Ordinary Tavern Owner': 'เจ้าของโรงเตี๊ยมธรรมดา',
      'A New Adventure': 'การผจญภัยครั้งใหม่',
      '<The Dragon Sin of Wrath>': '<บาปมังกรแห่งความโกรธ>',
      // Slader
      'Veteran Holy Knight': 'อัศวินศักดิ์สิทธิ์ผู้ช่ำชอง',
      'Loyal Friend': 'เพื่อนผู้ซื่อสัตย์',
      'Sword of the Old King': 'ดาบของกษัตริย์องค์เก่า',
      'Secret Mission': 'ภารกิจลับ',
      'Total Readiness': 'ความพร้อมสมบูรณ์',
      // Tioreh
      'Adorable Fairy': 'นางฟ้าน่ารัก',
      // 'Casual Outing' already defined above
      'Daughter of the Forest and Earth': 'ธิดาแห่งป่าและแผ่นดิน',
      "Adventure's Beginning": 'จุดเริ่มต้นการผจญภัย',
      // Tristan
      'Little Prince': 'เจ้าชายน้อย',
      "Prince's Training Outfit": 'ชุดฝึกซ้อมเจ้าชาย',
      'Formal Attire': 'ชุดทางการ',
      'Royal Dignity': 'ศักดิ์ศรีราชวงศ์',
      "Prince's Adventure": 'การผจญภัยของเจ้าชาย'
    }
  };

  /* ---- Public API ---- */

  function getWeaponName(weaponEn, lang) {
    lang = lang || (typeof I18n !== 'undefined' ? I18n.getLang() : 'en');
    if (lang === 'en') return weaponEn;
    return (weaponTypes.th && weaponTypes.th[weaponEn]) || weaponEn;
  }

  function getSkillType(typeEn, lang) {
    lang = lang || (typeof I18n !== 'undefined' ? I18n.getLang() : 'en');
    if (lang === 'en') return typeEn;
    return (skillTypes.th && skillTypes.th[typeEn]) || typeEn;
  }

  function getDescription(charName, lang) {
    lang = lang || (typeof I18n !== 'undefined' ? I18n.getLang() : 'en');
    if (lang === 'en') return null; // use original
    return (descriptions.th && descriptions.th[charName]) || null;
  }

  function getCostumeName(costumeEn, lang) {
    lang = lang || (typeof I18n !== 'undefined' ? I18n.getLang() : 'en');
    if (lang === 'en') return costumeEn;
    return (costumes.th && costumes.th[costumeEn]) || costumeEn;
  }

  function getUILabel(labelEn, lang) {
    lang = lang || (typeof I18n !== 'undefined' ? I18n.getLang() : 'en');
    if (lang === 'en') return (uiLabels.en && uiLabels.en[labelEn]) || labelEn;
    return (uiLabels.th && uiLabels.th[labelEn]) || labelEn;
  }

  function getAllWeaponTypes(lang) {
    lang = lang || (typeof I18n !== 'undefined' ? I18n.getLang() : 'en');
    return weaponTypes[lang] || weaponTypes.en;
  }

  return {
    getWeaponName: getWeaponName,
    getSkillType: getSkillType,
    getDescription: getDescription,
    getCostumeName: getCostumeName,
    getUILabel: getUILabel,
    getAllWeaponTypes: getAllWeaponTypes,
    weaponTypes: weaponTypes,
    skillTypes: skillTypes,
    descriptions: descriptions,
    costumes: costumes
  };
})();
