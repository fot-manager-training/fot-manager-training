const paths={
 value:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4M16 15h1M7 6V4h10v2"/>',
 team:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M4 10a2 2 0 0 0 0 4M20 10a2 2 0 0 1 0 4M2 20v-2a4 4 0 0 1 3-4M22 20v-2a4 4 0 0 0-3-4"/>',
 registry:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z M14 3v6h6M8 13h8M8 17h5"/>',
 onboarding:'<path d="M8 15 5 12l4-4a10 10 0 0 1 12-5 10 10 0 0 1-5 12l-4 4-3-3M9 8 5 7l-3 6 3-1M16 15l1 4-6 3 1-3M5 17l-2 4 4-2"/><circle cx="16" cy="8" r="2"/>',
 'self-employed':'<rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6 17a3 3 0 0 1 6 0M15 10h3M15 14h3M8 5V3h8v2"/>',
 dms:'<path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z M9 12h6M12 9v6"/>',
 growth:'<path d="M4 3v17h17M7 15l5-5 4 3 5-7M16 6h5v5"/>',
 satellites:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><circle cx="19" cy="5" r="2"/>'
};
export function materialIcon(id){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]||paths.value}</svg>`}
