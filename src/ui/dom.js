import { BRAND_ICONS } from './brand-icons.js'

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'html') node.innerHTML = value
    else if (key === 'text') node.textContent = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value)
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key in node) {
      try {
        node[key] = value
      } catch {
        node.setAttribute(key, value)
      }
    } else {
      node.setAttribute(key, value)
    }
  }
  const list = Array.isArray(children) ? children : [children]
  for (const child of list.flat()) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
  return node
}

export function mount(node, children) {
  clear(node)
  for (const child of (Array.isArray(children) ? children : [children]).flat()) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export function icon(path, className = 'w-5 h-5') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', className)
  if (path && typeof path === 'object') {
    // Brand marks are multi-path artworks with their own fills and viewBox.
    svg.setAttribute('viewBox', path.viewBox || '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.innerHTML = path.body
    return svg
  }
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', className)
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', path)
  svg.append(p)
  return svg
}

export const ICONS = {
  lock: 'M5 11H19A2 2 0 0 1 21 13V20A2 2 0 0 1 19 22H5A2 2 0 0 1 3 20V13A2 2 0 0 1 5 11ZM7 11V7a5 5 0 0 1 10 0v4',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.35-4.35',
  copy: 'M8 8h12v12H8zM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.3 6.3A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.9',
  star: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  back: 'M15 19l-7-7 7-7',
  chevronDown: 'M6 9l6 6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  key: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4zM16 7.5A0.5 0.5 0 1 0 17 7.5A0.5 0.5 0 1 0 16 7.5Z',
  shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  refresh: 'M20 11A8 8 0 0 0 6.3 6.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5M20 20v-4.5h-4.5',
  share: 'M12 16V4M8 8l4-4 4 4M5 14v6h14v-6',
  download: 'M12 4v12M8 12l4 4 4-4M5 20h14',
  upload: 'M12 20V8M8 12l4-4 4 4M5 4h14',
  check: 'M5 13l4 4L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  clock: 'M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12ZM12 6v6l4 2',
  filter: 'M4 6h16M7 12h10M10 18h4',
  fingerprint: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38 0 6.38-1 8.88M17.29 21.02c.12-.6.43-2.3.5-3.02M2 12a10 10 0 0 1 18-6M2 16h.01M21.8 16c.2-2 .131-5.354 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.21-.66.45-1.32.57-2M9 6.8a6 6 0 0 1 9 5.2v2',
  globe: 'M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12ZM12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20',
  edit: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  card: 'M4 5H20A2 2 0 0 1 22 7V17A2 2 0 0 1 20 19H4A2 2 0 0 1 2 17V7A2 2 0 0 1 4 5ZM2 10L22 10M6 14h2',
  id: 'M13 19a4 4 0 00-8 0M16 10h2M16 14h2M6 12A3 3 0 1 0 12 12A3 3 0 1 0 6 12ZM4 5H20A2 2 0 0 1 22 7V17A2 2 0 0 1 20 19H4A2 2 0 0 1 2 17V7A2 2 0 0 1 4 5Z',
  note: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 9H8M16 13H8M16 17H8',
  tag: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42zM7 7.5A0.5 0.5 0 1 0 8 7.5A0.5 0.5 0 1 0 7 7.5Z',
  calendar: 'M8 2v3M16 2v3M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3ZM3 9h18',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  photo: 'M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3ZM7 9A2 2 0 1 0 11 9A2 2 0 1 0 7 9Zm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M8 7A4 4 0 1 0 16 7A4 4 0 1 0 8 7Z',
  mail: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7M4 4H20A2 2 0 0 1 22 6V18A2 2 0 0 1 20 20H4A2 2 0 0 1 2 18V6A2 2 0 0 1 4 4Z',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  bank: 'M10 18v-7M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949zM14 18v-7M18 18v-7M3 22h18M6 18v-7',
  game: 'M6 11L10 11M8 9L8 13M15 12L15.01 12M18 10L18.01 10M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
  music: 'M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19M15 16A3 3 0 1 0 21 16A3 3 0 1 0 15 16ZM3 19A3 3 0 1 0 9 19A3 3 0 1 0 3 19Z',
  home: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  cart: 'm2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25M16 20A2 2 0 1 0 20 20A2 2 0 1 0 16 20ZM6 20A2 2 0 1 0 10 20A2 2 0 1 0 6 20Z',
  phone: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
  terminal: 'm7 11 2-2-2-2M11 13h4M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3Z',
  info: 'M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12ZM12 16v-4M12 8h.01',
  warning: 'M12 3l9.5 17h-19zM12 10v4M12 17h.01',
  ticket: 'M2.5 6.5A1.5 1.5 0 0 1 4 5h16a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5zM14 5.8v12.4',
  percent: 'M18.5 5.5L5.5 18.5M4 6.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14 16.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  barcode: 'M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14',
  scanBarcode: {
    viewBox: '0 0 24 24',
    body:
      '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M13 8v8M17 8v8"/>'
  },
  nfc: {
    viewBox: '0 0 1600 1600',
    body:
      '<g transform="translate(0,1600) scale(0.1,-0.1)" fill="currentColor"><path d="M2697 15989 c-565 -50 -1108 -264 -1567 -619 -114 -88 -391 -362 -484 -480 -164 -206 -340 -509 -434 -745 -84 -211 -143 -430 -184 -680 l-23 -140 -3 -5105 c-2 -3709 0 -5145 8 -5250 70 -905 549 -1724 1304 -2229 357 -239 778 -402 1203 -466 209 -32 404 -36 1438 -33 l1030 3 -50 29 c-473 272 -900 980 -1135 1880 -136 521 -200 952 -262 1766 -9 116 -13 1563 -15 5719 l-3 5564 59 -54 c33 -30 1450 -1433 3150 -3119 l3091 -3065 0 -960 0 -960 -167 166 c-276 272 -3662 3637 -4288 4261 l-580 578 -3 -3028 c-3 -3056 0 -3387 34 -3957 76 -1289 257 -2251 558 -2968 58 -138 195 -404 271 -527 156 -251 434 -560 648 -719 357 -266 779 -449 1320 -571 l177 -41 2633 4 c2894 3 2667 -2 2983 62 961 194 1787 893 2148 1816 86 221 140 430 183 709 16 108 18 413 21 5185 2 3454 0 5117 -8 5217 -19 278 -61 490 -144 743 -374 1126 -1377 1914 -2561 2015 -72 6 -555 10 -1200 10 l-1080 0 58 -33 c100 -56 179 -119 297 -237 465 -463 808 -1273 979 -2310 54 -329 89 -654 123 -1145 8 -125 12 -1627 15 -5704 l4 -5533 -39 33 c-22 19 -1074 1060 -2338 2314 -1264 1254 -2665 2642 -3111 3085 l-813 805 0 964 0 963 1853 -1843 c1018 -1014 2152 -2143 2520 -2508 l667 -665 0 3025 c0 1749 -4 3153 -10 3329 -57 1794 -274 2992 -695 3838 -153 308 -311 536 -525 756 -221 227 -441 386 -735 531 -266 131 -536 223 -883 301 l-154 34 -2596 -1 c-1429 -1 -2636 -5 -2685 -10z"/></g>'
  },
  ...BRAND_ICONS,
  mailru: BRAND_ICONS.maildotru
}
