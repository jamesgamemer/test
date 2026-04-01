/* ============================================================
   7DS ORIGIN - INTERNATIONALIZATION (i18n) MODULE
   Supports Thai (th) and English (en)
   Default language: English
   Persists across all pages via localStorage key "7ds_lang"
   ============================================================ */

var I18n = (function () {
  var _lang = 'en';
  var _listeners = [];
  var _initialized = false;

  var translations = {
    en: {
      // Navbar
      nav_home: 'Home',
      nav_characters: 'Characters',
      nav_tierlist: 'Tier List',
      nav_events: 'Events',
      nav_admin: 'Admin',
      nav_login: 'Login',
      nav_logout: 'Logout',
      nav_dashboard: 'Dashboard',
      nav_settings: 'Settings',
      nav_guides: 'Guides',
      nav_weapons: 'Weapons',

      // Hero
      hero_badge: 'Fan Database',
      hero_title_1: 'The Seven Deadly Sins',
      hero_title_2: 'ORIGIN',
      hero_subtitle: 'Characters \u2022 Tier List \u2022 Events \u2022 Guides',
      hero_browse: 'Browse Characters',
      hero_tierlist: 'Tier List',

      // Stats
      stat_characters: 'Characters',
      stat_weapons: 'Weapon Types',
      stat_tiers: 'Tier Ranks',
      stat_events: 'Active Events',

      // Sections
      sec_explore: 'Explore',
      sec_featured: 'Featured Characters',
      sec_featured_sub: 'SSR Tier Heroes',
      sec_tier_overview: 'Tier Overview',
      sec_tier_sub: 'Current Meta Rankings',
      sec_latest_events: 'Latest Events',
      sec_latest_events_sub: 'Current & Upcoming',
      sec_view_all_chars: 'View All Characters',
      sec_full_tierlist: 'Full Tier List',
      sec_all_events: 'All Events',

      // Quick Nav
      qcard_chars_title: 'Characters',
      qcard_chars_desc: 'Browse all heroes with stats, skills, and weapon builds. Filter by weapon type or search by name.',
      qcard_tier_title: 'Tier List',
      qcard_tier_desc: 'See which characters rank S through D. Drag and drop to build your own custom tier list.',
      qcard_events_title: 'Events',
      qcard_events_desc: 'Stay up to date with current and upcoming in-game events, rewards, and limited-time content.',

      // Characters page
      chars_title: 'Characters',
      chars_subtitle: 'Browse All Heroes \u2022 Filter by Weapon',
      chars_search: 'Search a character...',
      chars_loading: 'Loading characters...',

      // Tier List page
      tl_title: 'Tier List',
      tl_subtitle: 'Drag & Drop Characters to Build Your Tier List',
      tl_hint: 'Drag characters from the pool below into any tier row. Drag back to the pool to remove.',
      tl_pool: 'Character Pool',
      tl_reset: 'Reset Tier List',

      // Events page
      ev_title: 'Events',
      ev_subtitle: 'Current & Upcoming In-Game Events',
      ev_all: 'All',
      ev_active: 'Active',
      ev_upcoming: 'Upcoming',
      ev_ended: 'Ended',
      ev_add: '+ Add New Event',
      ev_no_events: 'No events found',
      ev_time_remaining: 'Time Remaining',
      ev_days: 'Days',
      ev_hrs: 'Hrs',
      ev_min: 'Min',
      ev_sec: 'Sec',
      ev_event_ended: 'Event Ended',

      // Character Detail
      cd_back: 'Back to Characters',
      cd_description: 'Description',
      cd_weapon_types: 'Weapon Types:',
      cd_skills: 'Skills',
      cd_potentials: 'Potentials',
      cd_costumes: 'Costumes',
      cd_loading: 'Loading character data...',
      cd_not_found: 'Character not found.',
      cd_no_selected: 'No character selected.',
      cd_skills_soon: 'Skills data will be added soon.',

      // Event Detail
      ed_back: 'Back to Events',
      ed_description: 'Description',
      ed_period: 'Event Period',
      ed_start: 'Start Date',
      ed_end: 'End Date',
      ed_rewards: 'Rewards',

      // Admin
      admin_panel: 'Admin Panel',
      admin_dashboard: 'Admin Dashboard',
      admin_manage: 'Manage characters and events',
      admin_chars_tab: 'Characters',
      admin_events_tab: 'Events',
      admin_add_char: '+ Add New Character',
      admin_export: 'Export JSON',
      admin_import: 'Import JSON',
      admin_all_chars: 'All Characters',
      admin_search_chars: 'Search characters...',
      admin_all_events: 'All Events',
      admin_search_events: 'Search events...',
      admin_add_event: '+ Add New Event',

      // Form labels
      form_char_info: 'Character Info',
      form_char_name: 'Character Name',
      form_slug: 'Slug',
      form_rarity: 'Rarity',
      form_tier: 'Tier',
      form_description: 'Description',
      form_weapon_types: 'Weapon Types',
      form_weapon_hint: 'Select weapon types (multiple allowed)',
      form_skills: 'Skills',
      form_skills_hint: 'Configure skills for each weapon type',
      form_skill_name: 'Skill Name',
      form_skill_type: 'Type',
      form_skill_desc: 'Description',
      form_potentials: 'Potentials',
      form_potentials_hint: '10 tiers per weapon type',
      form_costumes: 'Costumes',
      form_add_costume: '+ Add Costume',
      form_add_skill: '+ Add Skill',
      form_cancel: 'Cancel',
      form_save_char: 'Save Character',
      form_saving: 'Saving...',
      form_costume_name: 'Costume name',
      form_costume_image: 'Upload Image',

      // Event form
      form_event_title: 'Event Title',
      form_event_desc: 'Description',
      form_event_status: 'Status',
      form_event_tag: 'Tag',
      form_event_start: 'Start Date',
      form_event_end: 'End Date',
      form_event_color: 'Banner Color (CSS)',
      form_event_image: 'Event Banner Image',
      form_rewards: 'Rewards',
      form_add_reward: '+ Add Reward',
      form_save_event: 'Save Event',
      form_publish_event: 'Publish Event',

      // Tags
      tag_event: 'Event',
      tag_update: 'Update',
      tag_guide: 'Guide',
      tag_maintenance: 'Maintenance',

      // Footer
      footer_text: '7DS Origin Database \u2014 Fan-made site \u2014 Not affiliated with Netmarble',
      footer_admin: 'Admin Panel \u2014 Powered by Supabase',

      // Google-style menu
      menu_profile: 'Admin Profile',
      menu_dashboard: 'Dashboard',
      menu_characters: 'Characters',
      menu_tierlist: 'Tier List',
      menu_events: 'Events',
      menu_settings: 'Settings',
      menu_logout: 'Logout',

      // Login
      login_title: 'Admin Login',
      login_subtitle: 'Sign in to manage character data',
      login_email: 'Email',
      login_password: 'Password',
      login_btn: 'Sign In',
      login_signing: 'Signing in...',
      login_back: 'Back to Characters',

      // Misc
      connected: 'Connected to Supabase',
      not_connected: 'Supabase not connected',
      total: 'Total',
      with_skills: 'With Skills',
      complete: 'Complete',
      incomplete: 'Incomplete',
      view_site: 'View Site',
      scroll: 'Scroll',
      loading: 'Loading...',
      no_data: 'No data available'
    },

    th: {
      // Navbar
      nav_home: '\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01',
      nav_characters: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      nav_tierlist: '\u0E08\u0E31\u0E14\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A',
      nav_events: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      nav_admin: '\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19',
      nav_login: '\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A',
      nav_logout: '\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A',
      nav_dashboard: '\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14',
      nav_settings: '\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32',
      nav_weapons: '\u0E2D\u0E32\u0E27\u0E38\u0E18',
      nav_guides: '\u0E44\u0E01\u0E14\u0E4C',

      // Hero
      hero_badge: '\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E41\u0E1F\u0E19\u0E40\u0E21\u0E14',
      hero_title_1: 'The Seven Deadly Sins',
      hero_title_2: 'ORIGIN',
      hero_subtitle: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23 \u2022 \u0E08\u0E31\u0E14\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A \u2022 \u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C \u2022 \u0E44\u0E01\u0E14\u0E4C',
      hero_browse: '\u0E14\u0E39\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      hero_tierlist: '\u0E08\u0E31\u0E14\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A',

      // Stats
      stat_characters: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      stat_weapons: '\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2D\u0E32\u0E27\u0E38\u0E18',
      stat_tiers: '\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C',
      stat_events: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E22\u0E39\u0E48',

      // Sections
      sec_explore: '\u0E2A\u0E33\u0E23\u0E27\u0E08',
      sec_featured: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E40\u0E14\u0E48\u0E19',
      sec_featured_sub: '\u0E2E\u0E35\u0E42\u0E23\u0E48\u0E23\u0E30\u0E14\u0E31\u0E1A SSR',
      sec_tier_overview: '\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C',
      sec_tier_sub: '\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A Meta \u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19',
      sec_latest_events: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14',
      sec_latest_events_sub: '\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E41\u0E25\u0E30\u0E01\u0E33\u0E25\u0E31\u0E07\u0E08\u0E30\u0E21\u0E32',
      sec_view_all_chars: '\u0E14\u0E39\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14',
      sec_full_tierlist: '\u0E14\u0E39\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C\u0E25\u0E34\u0E2A\u0E15\u0E4C\u0E40\u0E15\u0E47\u0E21',
      sec_all_events: '\u0E14\u0E39\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14',

      // Quick Nav
      qcard_chars_title: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      qcard_chars_desc: '\u0E14\u0E39\u0E2E\u0E35\u0E42\u0E23\u0E48\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E2A\u0E16\u0E34\u0E15\u0E34 \u0E2A\u0E01\u0E34\u0E25 \u0E41\u0E25\u0E30\u0E1A\u0E34\u0E25\u0E14\u0E4C\u0E2D\u0E32\u0E27\u0E38\u0E18 \u0E01\u0E23\u0E2D\u0E07\u0E15\u0E32\u0E21\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2D\u0E32\u0E27\u0E38\u0E18\u0E2B\u0E23\u0E37\u0E2D\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E15\u0E32\u0E21\u0E0A\u0E37\u0E48\u0E2D',
      qcard_tier_title: '\u0E08\u0E31\u0E14\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A',
      qcard_tier_desc: '\u0E14\u0E39\u0E27\u0E48\u0E32\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E44\u0E2B\u0E19\u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E14\u0E31\u0E1A S \u0E16\u0E36\u0E07 D \u0E25\u0E32\u0E01\u0E41\u0E25\u0E49\u0E27\u0E27\u0E32\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C\u0E25\u0E34\u0E2A\u0E15\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E40\u0E2D\u0E07',
      qcard_events_title: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      qcard_events_desc: '\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E43\u0E19\u0E40\u0E01\u0E21\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E30\u0E01\u0E33\u0E25\u0E31\u0E07\u0E08\u0E30\u0E21\u0E32 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25\u0E41\u0E25\u0E30\u0E04\u0E2D\u0E19\u0E40\u0E17\u0E19\u0E15\u0E4C\u0E08\u0E33\u0E01\u0E31\u0E14\u0E40\u0E27\u0E25\u0E32',

      // Characters page
      chars_title: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      chars_subtitle: '\u0E14\u0E39\u0E2E\u0E35\u0E42\u0E23\u0E48\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14 \u2022 \u0E01\u0E23\u0E2D\u0E07\u0E15\u0E32\u0E21\u0E2D\u0E32\u0E27\u0E38\u0E18',
      chars_search: '\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23...',
      chars_loading: '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23...',

      // Tier List page
      tl_title: '\u0E08\u0E31\u0E14\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A',
      tl_subtitle: '\u0E25\u0E32\u0E01\u0E41\u0E25\u0E30\u0E27\u0E32\u0E07\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C\u0E25\u0E34\u0E2A\u0E15\u0E4C',
      tl_hint: '\u0E25\u0E32\u0E01\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E08\u0E32\u0E01\u0E1E\u0E39\u0E25\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E41\u0E16\u0E27\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C \u0E25\u0E32\u0E01\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E1E\u0E39\u0E25\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E25\u0E1A',
      tl_pool: '\u0E1E\u0E39\u0E25\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      tl_reset: '\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C\u0E25\u0E34\u0E2A\u0E15\u0E4C',

      // Events page
      ev_title: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      ev_subtitle: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E43\u0E19\u0E40\u0E01\u0E21\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E30\u0E01\u0E33\u0E25\u0E31\u0E07\u0E08\u0E30\u0E21\u0E32',
      ev_all: '\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14',
      ev_active: '\u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E22\u0E39\u0E48',
      ev_upcoming: '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E08\u0E30\u0E21\u0E32',
      ev_ended: '\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E41\u0E25\u0E49\u0E27',
      ev_add: '+ \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E43\u0E2B\u0E21\u0E48',
      ev_no_events: '\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      ev_time_remaining: '\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E25\u0E37\u0E2D',
      ev_days: '\u0E27\u0E31\u0E19',
      ev_hrs: '\u0E0A\u0E21.',
      ev_min: '\u0E19\u0E32\u0E17\u0E35',
      ev_sec: '\u0E27\u0E34\u0E19\u0E32\u0E17\u0E35',
      ev_event_ended: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E41\u0E25\u0E49\u0E27',

      // Character Detail
      cd_back: '\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      cd_description: '\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14',
      cd_weapon_types: '\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2D\u0E32\u0E27\u0E38\u0E18:',
      cd_skills: '\u0E2A\u0E01\u0E34\u0E25',
      cd_potentials: '\u0E1E\u0E2D\u0E40\u0E17\u0E19\u0E40\u0E0A\u0E35\u0E22\u0E25',
      cd_costumes: '\u0E04\u0E2D\u0E2A\u0E15\u0E39\u0E21',
      cd_loading: '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23...',
      cd_not_found: '\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      cd_no_selected: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      cd_skills_soon: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E01\u0E34\u0E25\u0E08\u0E30\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E23\u0E47\u0E27\u0E46 \u0E19\u0E35\u0E49',

      // Event Detail
      ed_back: '\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E2B\u0E19\u0E49\u0E32\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      ed_description: '\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14',
      ed_period: '\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      ed_start: '\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21',
      ed_end: '\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14',
      ed_rewards: '\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25',

      // Admin
      admin_panel: '\u0E41\u0E1C\u0E07\u0E04\u0E27\u0E1A\u0E04\u0E38\u0E21\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19',
      admin_dashboard: '\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19',
      admin_manage: '\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E41\u0E25\u0E30\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      admin_chars_tab: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      admin_events_tab: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      admin_add_char: '+ \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E43\u0E2B\u0E21\u0E48',
      admin_export: '\u0E2A\u0E48\u0E07\u0E2D\u0E2D\u0E01 JSON',
      admin_import: '\u0E19\u0E33\u0E40\u0E02\u0E49\u0E32 JSON',
      admin_all_chars: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14',
      admin_search_chars: '\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23...',
      admin_all_events: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14',
      admin_search_events: '\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C...',
      admin_add_event: '+ \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C\u0E43\u0E2B\u0E21\u0E48',

      // Form labels
      form_char_info: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      form_char_name: '\u0E0A\u0E37\u0E48\u0E2D\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      form_slug: 'Slug',
      form_rarity: '\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E2B\u0E32\u0E22\u0E32\u0E01',
      form_tier: '\u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C',
      form_description: '\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14',
      form_weapon_types: '\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2D\u0E32\u0E27\u0E38\u0E18',
      form_weapon_hint: '\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2D\u0E32\u0E27\u0E38\u0E18 (\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E44\u0E14\u0E49\u0E2B\u0E25\u0E32\u0E22\u0E2D\u0E31\u0E19)',
      form_skills: '\u0E2A\u0E01\u0E34\u0E25',
      form_skills_hint: '\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E2A\u0E01\u0E34\u0E25\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E41\u0E15\u0E48\u0E25\u0E30\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2D\u0E32\u0E27\u0E38\u0E18',
      form_skill_name: '\u0E0A\u0E37\u0E48\u0E2D\u0E2A\u0E01\u0E34\u0E25',
      form_skill_type: '\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17',
      form_skill_desc: '\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14',
      form_potentials: '\u0E1E\u0E2D\u0E40\u0E17\u0E19\u0E40\u0E0A\u0E35\u0E22\u0E25',
      form_potentials_hint: '10 \u0E40\u0E17\u0E35\u0E22\u0E23\u0E4C\u0E15\u0E48\u0E2D\u0E2D\u0E32\u0E27\u0E38\u0E18',
      form_costumes: '\u0E04\u0E2D\u0E2A\u0E15\u0E39\u0E21',
      form_add_costume: '+ \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E04\u0E2D\u0E2A\u0E15\u0E39\u0E21',
      form_add_skill: '+ \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2A\u0E01\u0E34\u0E25',
      form_cancel: '\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01',
      form_save_char: '\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      form_saving: '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01...',
      form_costume_name: '\u0E0A\u0E37\u0E48\u0E2D\u0E04\u0E2D\u0E2A\u0E15\u0E39\u0E21',
      form_costume_image: '\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E23\u0E39\u0E1B',

      // Event form
      form_event_title: '\u0E0A\u0E37\u0E48\u0E2D\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      form_event_desc: '\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14',
      form_event_status: '\u0E2A\u0E16\u0E32\u0E19\u0E30',
      form_event_tag: '\u0E41\u0E17\u0E47\u0E01',
      form_event_start: '\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21',
      form_event_end: '\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14',
      form_event_color: '\u0E2A\u0E35\u0E41\u0E1A\u0E19\u0E40\u0E19\u0E2D\u0E23\u0E4C (CSS)',
      form_event_image: '\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E19\u0E40\u0E19\u0E2D\u0E23\u0E4C\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      form_rewards: '\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25',
      form_add_reward: '+ \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25',
      form_save_event: '\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      form_publish_event: '\u0E40\u0E1C\u0E22\u0E41\u0E1E\u0E23\u0E48\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',

      // Tags
      tag_event: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      tag_update: '\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15',
      tag_guide: '\u0E44\u0E01\u0E14\u0E4C',
      tag_maintenance: '\u0E1B\u0E34\u0E14\u0E1B\u0E23\u0E31\u0E1A\u0E1B\u0E23\u0E38\u0E07',

      // Footer
      footer_text: '7DS Origin Database \u2014 \u0E40\u0E27\u0E47\u0E1A\u0E44\u0E0B\u0E15\u0E4C\u0E41\u0E1F\u0E19\u0E40\u0E21\u0E14 \u2014 \u0E44\u0E21\u0E48\u0E40\u0E01\u0E35\u0E48\u0E22\u0E27\u0E02\u0E49\u0E2D\u0E07\u0E01\u0E31\u0E1A Netmarble',
      footer_admin: '\u0E41\u0E1C\u0E07\u0E04\u0E27\u0E1A\u0E04\u0E38\u0E21\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19 \u2014 \u0E02\u0E31\u0E1A\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E42\u0E14\u0E22 Supabase',

      // Google-style menu
      menu_profile: '\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19',
      menu_dashboard: '\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14',
      menu_characters: '\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',
      menu_tierlist: '\u0E08\u0E31\u0E14\u0E2D\u0E31\u0E19\u0E14\u0E31\u0E1A',
      menu_events: '\u0E2D\u0E35\u0E40\u0E27\u0E19\u0E15\u0E4C',
      menu_settings: '\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32',
      menu_logout: '\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A',

      // Login
      login_title: '\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19',
      login_subtitle: '\u0E25\u0E07\u0E0A\u0E37\u0E48\u0E2D\u0E40\u0E02\u0E49\u0E32\u0E43\u0E0A\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25',
      login_email: '\u0E2D\u0E35\u0E40\u0E21\u0E25',
      login_password: '\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19',
      login_btn: '\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A',
      login_signing: '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A...',
      login_back: '\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E31\u0E27\u0E25\u0E30\u0E04\u0E23',

      // Misc
      connected: '\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Supabase \u0E41\u0E25\u0E49\u0E27',
      not_connected: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Supabase',
      total: '\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14',
      with_skills: '\u0E21\u0E35\u0E2A\u0E01\u0E34\u0E25',
      complete: '\u0E2A\u0E21\u0E1A\u0E39\u0E23\u0E13\u0E4C',
      incomplete: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E2A\u0E21\u0E1A\u0E39\u0E23\u0E13\u0E4C',
      view_site: '\u0E14\u0E39\u0E40\u0E27\u0E47\u0E1A\u0E44\u0E0B\u0E15\u0E4C',
      scroll: '\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E25\u0E07',
      loading: '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14...',
      no_data: '\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25'
    }
  };

  /* Load external JSON translation files to merge with built-in translations */
  async function loadExternalTranslations() {
    /* Detect base path from current script location */
    var basePath = '';
    try {
      var scripts = document.querySelectorAll('script[src*="i18n.js"]');
      if (scripts.length > 0) {
        var src = scripts[0].getAttribute('src');
        var idx = src.lastIndexOf('/');
        if (idx >= 0) {
          /* src is like 'js/i18n.js', base is '' (root relative) */
          basePath = src.substring(0, idx).replace(/\/js$/, '') + '/';
          if (basePath === '/') basePath = '';
        }
      }
    } catch(e) {}
    var langs = ['en', 'th'];
    for (var i = 0; i < langs.length; i++) {
      var lang = langs[i];
      try {
        var resp = await fetch(basePath + 'i18n/' + lang + '.json');
        if (resp.ok) {
          var data = await resp.json();
          if (!translations[lang]) translations[lang] = {};
          /* Merge: external JSON overrides built-in */
          Object.keys(data).forEach(function(key) {
            translations[lang][key] = data[key];
          });
          console.log('[I18n] Loaded external translations for: ' + lang);
        }
      } catch (e) {
        /* Silently fail - use built-in translations */
        console.log('[I18n] No external file for: ' + lang + ', using built-in');
      }
    }
  }

  function init() {
    /* Always read from localStorage on every page load */
    var saved = localStorage.getItem('7ds_lang');
    if (saved && translations[saved]) {
      _lang = saved;
    }
    _initialized = true;
    /* Apply translations immediately with built-in */
    applyTranslations();
    updateSwitcher();
    /* Then try to load external JSON and re-apply */
    loadExternalTranslations().then(function() {
      applyTranslations();
    }).catch(function() {});
  }

  function getLang() {
    if (!_initialized) {
      var saved = localStorage.getItem('7ds_lang');
      if (saved && translations[saved]) _lang = saved;
    }
    return _lang;
  }

  function setLang(lang) {
    if (!translations[lang]) return;
    _lang = lang;
    localStorage.setItem('7ds_lang', lang);
    updateSwitcher();
    applyTranslations();
    _listeners.forEach(function(fn) { try { fn(_lang); } catch(e) {} });
  }

  function t(key) {
    var dict = translations[_lang] || translations.en;
    return dict[key] || translations.en[key] || key;
  }

  function onChange(fn) {
    _listeners.push(fn);
  }

  function updateSwitcher() {
    var btns = document.querySelectorAll('.lang-btn');
    btns.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.lang === _lang);
    });
  }

  function applyTranslations() {
    /* data-i18n: replace textContent */
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.dataset.i18n;
      var val = t(key);
      var tag = el.tagName;
      /* Input/textarea placeholders */
      if ((tag === 'INPUT' && el.type !== 'hidden') || tag === 'TEXTAREA') {
        el.placeholder = val;
        return;
      }
      /* Option elements */
      if (tag === 'OPTION') {
        el.textContent = val;
        return;
      }
      /* Elements with no child elements - safe to replace textContent */
      if (el.childElementCount === 0) {
        el.textContent = val;
        return;
      }
      /* Elements with child elements - try to find the right text target */
      /* Priority 1: look for a child span/element that also has data-i18n (skip, it will be handled separately) */
      /* Priority 2: look for .i18n-text span */
      var i18nSpan = el.querySelector('.i18n-text');
      if (i18nSpan) {
        i18nSpan.textContent = val;
        return;
      }
      /* Priority 3: find and update first meaningful text node */
      var found = false;
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === 3 && el.childNodes[i].textContent.trim()) {
          el.childNodes[i].textContent = ' ' + val + ' ';
          found = true;
          break;
        }
      }
      /* Priority 4: if no text node, skip (child elements will handle themselves) */
    });
    /* data-i18n-placeholder */
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    /* data-i18n-title */
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      el.title = t(el.dataset.i18nTitle);
    });
    /* data-i18n-html: for elements that need innerHTML with icons */
    document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
      var key = el.dataset.i18nHtml;
      el.innerHTML = t(key);
    });
  }

  return {
    init: init,
    getLang: getLang,
    setLang: setLang,
    t: t,
    onChange: onChange,
    applyTranslations: applyTranslations,
    updateSwitcher: updateSwitcher
  };
})();

/* Auto-init on every page load */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { I18n.init(); });
} else {
  I18n.init();
}
