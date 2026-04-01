const WEAPON_ICONS = {
  "axe": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 4C9.37 4 4 9.37 4 16C4 22.63 9.37 28 16 28C22.63 28 28 22.63 28 16C28 9.37 22.63 4 16 4ZM16 26C10.48 26 6 21.52 6 16C6 10.48 10.48 6 16 6C21.52 6 26 10.48 26 16C26 21.52 21.52 26 16 26Z" fill="#FFFFFF" fill-opacity="0.2"/>
        <path d="M12 24L20 16M20 16L14 10L24 6L26 8L22 18L16 12L12 24Z" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11 25L9 27" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  "book": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 4C9.37 4 4 9.37 4 16C4 22.63 9.37 28 16 28C22.63 28 28 22.63 28 16C28 9.37 22.63 4 16 4Z" fill="#FFFFFF" fill-opacity="0.1"/>
        <path d="M8 10V22C8 23.1 8.9 24 10 24H22C23.1 24 24 23.1 24 22V10C24 8.9 23.1 8 22 8H10C8.9 8 8 8.9 8 10Z" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M16 8V24M11 12H14M11 16H14M18 12H21M18 16H21" stroke="#FFFFFF" stroke-width="1"/>
        <path d="M14 6L16 4L18 6M14 26L16 28L18 26" stroke="#FFFFFF" stroke-width="0.8"/>
    </svg>`,
  "cudgel": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" stroke="#FFFFFF" stroke-width="0.5" stroke-dasharray="2 2" stroke-opacity="0.5"/>
        <path d="M10 22L22 10L24 12L12 24L10 22Z" fill="#FFFFFF" fill-opacity="0.2" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M20 8L26 14" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M18 6L24 12M16 4L22 10" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.6"/>
        <circle cx="21" cy="11" r="1" fill="#FFFFFF"/>
    </svg>`,
  "dual swords": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 4L19 10H13L16 4ZM16 28L13 22H19L16 28Z" fill="#FFFFFF" fill-opacity="0.3"/>
        <path d="M8 24L24 8M24 8L20 8M24 8L24 12" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M24 24L8 8M8 8L12 8M8 8L8 12" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M14 20L12 22M18 20L20 22" stroke="#FFFFFF" stroke-width="1.5"/>
    </svg>`,
  "gauntlets": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="12" height="14" rx="2" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M12 10V7C12 6.45 12.45 6 13 6H19C19.55 6 20 6.45 20 7V10" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M10 16H22M13 13V19M19 13V19" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.5"/>
        <circle cx="16" cy="17" r="3" stroke="#FFFFFF" stroke-width="1"/>
        <path d="M6 16H8M24 16H26M16 4V6M16 26V28" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  "greatsword": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 4V28" stroke="#FFFFFF" stroke-width="0.5" stroke-opacity="0.3"/>
        <path d="M13 8L16 5L19 8V22L16 25L13 22V8Z" fill="#FFFFFF" fill-opacity="0.2" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M10 22H22M16 22V27" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M14 10H18M14 14H18M14 18H18" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.6"/>
    </svg>`,
  "grimoire": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2C8.27 2 2 8.27 2 16C2 23.73 8.27 30 16 30C23.73 30 30 23.73 30 16C30 8.27 23.73 2 16 2ZM16 28C9.37 28 4 22.63 4 16C4 9.37 9.37 4 16 4C22.63 4 28 9.37 28 16C28 22.63 22.63 28 16 28Z" fill="#FFFFFF" fill-opacity="0.1"/>
        <rect x="10" y="8" width="12" height="16" rx="1" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M16 8V24M13 12L16 15L19 12" stroke="#FFFFFF" stroke-width="1"/>
        <circle cx="16" cy="16" r="4" stroke="#FFFFFF" stroke-width="0.8" stroke-dasharray="1 1"/>
    </svg>`,
  "lance": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M26 6L6 26" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M23 5L27 9L21 15L19 13L23 5Z" fill="#FFFFFF" fill-opacity="0.2" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M11 21L7 25" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
        <circle cx="24" cy="8" r="4" stroke="#FFFFFF" stroke-width="0.5" stroke-opacity="0.4"/>
        <path d="M28 4L24 8" stroke="#FFFFFF" stroke-width="0.8"/>
    </svg>`,
  "longsword": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 8L8 24" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M21 7L25 11L23 13L19 9L21 7Z" fill="#FFFFFF" fill-opacity="0.2" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M12 20L7 25" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M16 16L20 12M14 18L18 14" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.5"/>
        <circle cx="16" cy="16" r="10" stroke="#FFFFFF" stroke-width="0.3" stroke-opacity="0.3"/>
    </svg>`,
  "rapier": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M26 6L10 22" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M13 19C11 17 7 21 9 23C11 25 15 21 13 19Z" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M9 23L6 26" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M22 10L28 4" stroke="#FFFFFF" stroke-width="0.5" stroke-opacity="0.5"/>
        <circle cx="24" cy="8" r="3" stroke="#FFFFFF" stroke-width="0.5" stroke-opacity="0.4"/>
    </svg>`,
  "staff": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 26L22 12" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="25" cy="9" r="4" fill="#FFFFFF" fill-opacity="0.1" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M23 11L27 7M23 7L27 11" stroke="#FFFFFF" stroke-width="1"/>
        <path d="M20 14L18 16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
        <path d="M25 4V6M25 12V14M20 9H22M28 9H30" stroke="#FFFFFF" stroke-width="0.8" stroke-opacity="0.6"/>
    </svg>`,
  "sword & shield": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 8V18C10 21.31 12.69 24 16 24C19.31 24 22 21.31 22 18V8L16 5L10 8Z" fill="#FFFFFF" fill-opacity="0.1" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M24 8L8 24" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M16 12V18M13 15H19" stroke="#FFFFFF" stroke-width="1"/>
        <path d="M16 2C8.27 2 2 8.27 2 16C2 23.73 8.27 30 16 30C23.73 30 30 23.73 30 16C30 8.27 23.73 2 16 2ZM16 28C9.37 28 4 22.63 4 16C4 9.37 9.37 4 16 4C22.63 4 28 9.37 28 16C28 22.63 22.63 28 16 28Z" fill="#FFFFFF" fill-opacity="0.05"/>
    </svg>`,
  "wand": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 22L22 10" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M24 8L22 10L24 12L26 10L24 8Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1"/>
        <path d="M24 4V6M24 14V16M20 10H18M30 10H28" stroke="#FFFFFF" stroke-width="0.8" stroke-linecap="round"/>
        <path d="M28 6L26 8M22 12L20 14M22 8L20 6M28 12L30 14" stroke="#FFFFFF" stroke-width="0.5" stroke-opacity="0.5"/>
    </svg>`,
  "shield": `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 8V18C10 21.31 12.69 24 16 24C19.31 24 22 21.31 22 18V8L16 5L10 8Z" fill="#FFFFFF" fill-opacity="0.1" stroke="#FFFFFF" stroke-width="1.2"/>
        <path d="M16 12V18M13 15H19" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round"/>
        <circle cx="16" cy="16" r="10" stroke="#FFFFFF" stroke-width="0.3" stroke-opacity="0.3"/>
    </svg>`
};
