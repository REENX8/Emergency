/* Design tokens — control-room palette */
(function () {
  const ROOT = document.documentElement;
  const tokens = {
    /* Surfaces */
    '--bg-0': '#07090d',
    '--bg-1': '#0c1118',
    '--bg-2': '#121822',
    '--bg-3': '#1a2230',
    '--bg-4': '#222d3e',
    /* Hairlines */
    '--line-1': '#1c2533',
    '--line-2': '#2a3645',
    '--line-3': '#3a4859',
    /* Text */
    '--ink-0': '#f3f6fa',
    '--ink-1': '#d6dde8',
    '--ink-2': '#8a99ac',
    '--ink-3': '#5b6878',
    '--ink-4': '#3d4856',
    /* Accents — all share roughly the same chroma/lightness */
    '--accent-cyan':   'oklch(0.78 0.13 215)',
    '--accent-cyan-d': 'oklch(0.55 0.11 215)',
    '--accent-amber':  'oklch(0.80 0.14 75)',
    '--accent-red':    'oklch(0.66 0.18 25)',
    '--accent-red-d':  'oklch(0.40 0.14 25)',
    '--accent-lime':   'oklch(0.78 0.16 140)',
    '--accent-violet': 'oklch(0.72 0.14 295)',
    '--accent-rose':   'oklch(0.72 0.16 10)',
    /* Spacing */
    '--r-sm': '4px',
    '--r-md': '6px',
    '--r-lg': '10px',
    /* Type */
    '--font-sans': '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif',
    '--font-mono': '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace',
  };
  Object.entries(tokens).forEach(([k, v]) => ROOT.style.setProperty(k, v));
})();
