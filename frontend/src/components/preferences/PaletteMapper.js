import Color from 'color';
// DaisyUI theme import for Theme Playground
import daisyThemesRaw from './daisyThemesRaw/object.js';

// Utility function to calculate contrast ratio between two colors
function getContrastRatio(bgColor, fgColor) {
  try {
    return Color(bgColor).contrast(Color(fgColor));
  } catch (error) {
    console.error('Error calculating contrast ratio:', error);
    return 1;
  }
}

// Utility function to ensure proper contrast for text on a background
function ensureContrast(bgColor, fgColor, minContrast = 4.5) {
  try {
    const contrast = getContrastRatio(bgColor, fgColor);
    
    // If contrast is sufficient, return the foreground color
    if (contrast >= minContrast) {
      return fgColor;
    }
    
    // Otherwise, return black or white based on which has better contrast
    const black = Color('#000000');
    const white = Color('#ffffff');
    const blackContrast = getContrastRatio(bgColor, black);
    const whiteContrast = getContrastRatio(bgColor, white);
    
    return blackContrast > whiteContrast ? '#000000' : '#ffffff';
  } catch (error) {
    console.error('Error ensuring contrast:', error);
    return '#ffffff'; // Fallback
  }
}

// Palette-to-theme mapping utility
// Given a palette object (e.g., tailwindColors['indigo']), returns theme roles for light and dark modes
export function mapPaletteToTheme(palette, mode = 'light') {
  const out = {};
  const mapping = mode === 'dark' ? M3_DARK_ROLE_TO_SHADE : M3_LIGHT_ROLE_TO_SHADE;
  for (const role of Object.keys(mapping)) {
    const targetShade = mapping[role];
    const closestShade = getClosestShade(palette, targetShade);
    out[role] = palette[closestShade];
  }
  // For *-content roles, ensure proper contrast with their base roles
  for (const role of Object.keys(mapping)) {
    if (role.endsWith('-content')) {
      const baseRole = role.replace('-content', '');
      const bgColor = out[baseRole];
      const contentColor = out[role];
      
      // Ensure the content color has proper contrast with the background
      if (bgColor && contentColor) {
        try {
          const contrast = Color(bgColor).contrast(Color(contentColor));
          // If contrast is insufficient, adjust the content color
          if (contrast < 4.5) {
            // Pick black or white for max contrast
            const black = Color('#000000');
            const white = Color('#ffffff');
            const blackContrast = Color(bgColor).contrast(black);
            const whiteContrast = Color(bgColor).contrast(white);
            
            // Choose the color with better contrast
            out[role] = blackContrast > whiteContrast ? '#000000' : '#ffffff';
          }
        } catch (error) {
          console.error('Error calculating contrast for role:', role, error);
          // Fallback to high-contrast colors
          try {
            const bgLightness = Color(bgColor).luminosity();
            out[role] = bgLightness > 0.5 ? '#000000' : '#ffffff';
          } catch {
            out[role] = '#ffffff';
          }
        }
      }
    }
  }
  return out;
}

/**
 * Returns an array of all DaisyUI themes with their name and color-scheme.
 * Example: [{ name: 'forest', colorScheme: 'dark', theme: { ... } }, ...]
 */
export function getAllDaisyThemes() {
  return Object.entries(daisyThemesRaw).map(([name, theme]) => ({
    name,
    colorScheme: theme['color-scheme'] || 'light',
    theme,
  }));
}

// List of all expected DaisyUI roles
const DAISY_ROLES = [
  'primary', 'primary-content',
  'secondary', 'secondary-content',
  'accent', 'accent-content',
  'neutral', 'neutral-content',
  'base-100', 'base-200', 'base-300', 'base-content',
  'info', 'info-content',
  'success', 'success-content',
  'warning', 'warning-content',
  'error', 'error-content',
];

// M3-compliant role-to-shade mappings for Tailwind palettes
// Following Material Design 3 guidelines for light theme
const M3_LIGHT_ROLE_TO_SHADE = {
  'primary': 40,
  'primary-content': 100,
  'secondary': 40,
  'secondary-content': 100,
  'accent': 40,
  'accent-content': 100,
  'neutral': 90,
  'neutral-content': 10,
  'base-100': 99,  // Lightest background
  'base-200': 95,  // Slightly darker background
  'base-300': 90,  // Even darker background
  'base-content': 10, // Darkest text
  'info': 40,
  'info-content': 10,
  'success': 40,
  'success-content': 10,
  'warning': 40,
  'warning-content': 10,
  'error': 40,
  'error-content': 10,
};

// Following Material Design 3 guidelines for dark theme
const M3_DARK_ROLE_TO_SHADE = {
  'primary': 80,
  'primary-content': 20,
  'secondary': 80,
  'secondary-content': 20,
  'accent': 80,
  'accent-content': 20,
  'neutral': 10,
  'neutral-content': 90,
  'base-100': 10,  // Darkest background
  'base-200': 20,  // Slightly lighter background
  'base-300': 30,  // Even lighter background
  'base-content': 90, // Lightest text
  'info': 80,
  'info-content': 20,
  'success': 80,
  'success-content': 20,
  'warning': 80,
  'warning-content': 20,
  'error': 80,
  'error-content': 20,
};

function getClosestShade(palette, targetShade) {
  // Find the closest available shade in the palette
  const available = Object.keys(palette).map(Number);
  let closest = available[0];
  let minDiff = Math.abs(closest - targetShade);
  for (const shade of available) {
    const diff = Math.abs(shade - targetShade);
    if (diff < minDiff) {
      closest = shade;
      minDiff = diff;
    }
  }
  return closest;
}

/**
 * Converts a DaisyUI theme object (with --color- keys) or a flat role→hex map (e.g. daisyPalettes)
 * to a plain object with role names as keys. Fills missing roles with fallbackColor (default: '#ffffff').
 */
export function daisyThemeToRoleMap(themeObj, fallbackColor = '#ffffff') {
  const out = {};
  if (!themeObj) {
    for (const role of DAISY_ROLES) {
      out[role] = fallbackColor;
    }
    return out;
  }
  const keys = Object.keys(themeObj);
  const hasCssVars = keys.some((k) => k.startsWith('--color-'));
  for (const role of DAISY_ROLES) {
    if (hasCssVars) {
      const val = themeObj[`--color-${role}`];
      out[role] = typeof val === 'string' ? oklchToHex(val) : fallbackColor;
    } else {
      const v = themeObj[role];
      out[role] = typeof v === 'string' && v.length > 0 ? v : fallbackColor;
    }
  }
  return out;
}

/** Roles that get structural colors in pass 1 (includes base-content; excludes primary-content, etc.). */
const STRUCTURAL_ROLES = DAISY_ROLES.filter((r) => !r.endsWith('-content') || r === 'base-content');

/** Paired *-content roles (text/icons on primary, secondary, … — not base-content). */
const PAIRED_CONTENT_ROLES = DAISY_ROLES.filter((r) => r.endsWith('-content') && r !== 'base-content');

function hslFromHex(hex) {
  try {
    const o = Color(hex).hsl().object();
    const h = Number.isFinite(o.h) ? o.h : 0;
    const s = Number.isFinite(o.s) ? o.s : 0;
    const l = Number.isFinite(o.l) ? o.l : 50;
    return { h, s, l };
  } catch {
    return { h: 0, s: 0, l: 50 };
  }
}

function hexFromHsl(h, s, l) {
  try {
    const hh = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0;
    const ss = Math.max(0, Math.min(100, s));
    const ll = Math.max(0, Math.min(100, l));
    return Color.hsl(hh, ss, ll).hex();
  } catch {
    return '#888888';
  }
}

/**
 * Build a light-mode palette from a dark-mode Daisy palette: same hue families, adjusted L/S (no complementary hue flip).
 */
export function semanticPairFromDark(palette) {
  const out = {};
  for (const role of STRUCTURAL_ROLES) {
    const hex = palette[role] || '#333333';
    const { h, s, l } = hslFromHex(hex);
    if (role === 'base-100') {
      out[role] = hexFromHsl(h, Math.min(14, s * 0.25 + 3), 98);
    } else if (role === 'base-200') {
      out[role] = hexFromHsl(h, Math.min(12, s * 0.22 + 2), 94);
    } else if (role === 'base-300') {
      out[role] = hexFromHsl(h, Math.min(14, s * 0.2 + 2), 87);
    } else if (role === 'neutral') {
      out[role] = hexFromHsl(h, Math.min(10, s * 0.28 + 2), 91);
    } else if (role === 'base-content') {
      out[role] = hexFromHsl(h, Math.min(12, s * 0.35), 14);
    } else if (role === 'primary' || role === 'secondary' || role === 'accent') {
      const newL = l > 55 ? 44 : l < 22 ? 46 : 50 - (l - 40) * 0.35;
      const newS = Math.min(92, Math.max(42, s * 0.95));
      out[role] = hexFromHsl(h, newS, Math.max(32, Math.min(52, newL)));
    } else if (role === 'info') {
      const hh = Number.isFinite(h) && s > 15 ? h : 210;
      out[role] = hexFromHsl(hh, Math.min(88, Math.max(55, s || 70)), l > 50 ? 42 : 48);
    } else if (role === 'success') {
      const hh = Number.isFinite(h) && s > 15 && (h < 100 || h > 170) ? h : 145;
      out[role] = hexFromHsl(hh, Math.min(70, Math.max(45, s || 55)), l > 50 ? 38 : 42);
    } else if (role === 'warning') {
      const hh = Number.isFinite(h) && s > 15 && h > 25 && h < 70 ? h : 42;
      out[role] = hexFromHsl(hh, Math.min(92, Math.max(70, s || 85)), l > 55 ? 48 : 52);
    } else if (role === 'error') {
      const hh = Number.isFinite(h) && s > 15 && (h < 40 || h > 340) ? h : 12;
      out[role] = hexFromHsl(hh, Math.min(88, Math.max(55, s || 65)), l > 50 ? 42 : 46);
    } else {
      out[role] = hex;
    }
  }
  for (const role of PAIRED_CONTENT_ROLES) {
    const baseRole = role.replace(/-content$/, '');
    const bg = out[baseRole] || palette[baseRole];
    const seed = typeof palette[role] === 'string' ? palette[role] : '#ffffff';
    out[role] = ensureContrast(bg, seed);
  }
  out['base-content'] = ensureContrast(out['base-100'], out['base-content']);
  return out;
}

/**
 * Build a dark-mode palette from a light-mode Daisy palette: same hue families, dark surfaces + bright accents.
 */
export function semanticPairFromLight(palette) {
  const out = {};
  for (const role of STRUCTURAL_ROLES) {
    const hex = palette[role] || '#eeeeee';
    const { h, s, l } = hslFromHex(hex);
    if (role === 'base-100') {
      out[role] = hexFromHsl(h, Math.min(18, s * 0.4 + 4), 11);
    } else if (role === 'base-200') {
      out[role] = hexFromHsl(h, Math.min(16, s * 0.35 + 3), 16);
    } else if (role === 'base-300') {
      out[role] = hexFromHsl(h, Math.min(18, s * 0.32 + 3), 24);
    } else if (role === 'neutral') {
      out[role] = hexFromHsl(h, Math.min(14, s * 0.35 + 2), 14);
    } else if (role === 'base-content') {
      out[role] = hexFromHsl(h, Math.min(10, s * 0.25), 93);
    } else if (role === 'primary' || role === 'secondary' || role === 'accent') {
      const newL = l < 40 ? 72 : l > 60 ? 68 : 70 + (50 - l) * 0.4;
      const newS = Math.min(95, Math.max(48, (s || 50) * 1.05));
      out[role] = hexFromHsl(h, newS, Math.max(62, Math.min(82, newL)));
    } else if (role === 'info') {
      const hh = Number.isFinite(h) && s > 15 ? h : 210;
      out[role] = hexFromHsl(hh, Math.min(75, Math.max(50, s || 65)), 68);
    } else if (role === 'success') {
      const hh = Number.isFinite(h) && s > 15 ? h : 150;
      out[role] = hexFromHsl(hh, Math.min(55, Math.max(40, s || 50)), 62);
    } else if (role === 'warning') {
      const hh = Number.isFinite(h) && s > 15 ? h : 45;
      out[role] = hexFromHsl(hh, Math.min(90, Math.max(65, s || 80)), 72);
    } else if (role === 'error') {
      const hh = Number.isFinite(h) && s > 15 ? h : 18;
      out[role] = hexFromHsl(hh, Math.min(75, Math.max(55, s || 62)), 65);
    } else {
      out[role] = hex;
    }
  }
  for (const role of PAIRED_CONTENT_ROLES) {
    const baseRole = role.replace(/-content$/, '');
    const bg = out[baseRole] || palette[baseRole];
    const seed = typeof palette[role] === 'string' ? palette[role] : '#ffffff';
    out[role] = ensureContrast(bg, seed);
  }
  out['base-content'] = ensureContrast(out['base-100'], out['base-content']);
  return out;
}

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/**
 * Seeded random palette: jitters current editor seeds by role class (muted surfaces, semantic hues for status colors).
 * @param {Record<string, string>} seeds — e.g. primary, secondary, accent, base-100 from current light/dark
 * @param {string} fallbackHex — used when seeds missing (Tailwind-selected base)
 */
export function generateSemanticRandomPalette(seeds, fallbackHex = '#4f46e5') {
  const rng = Math.random;
  const pick = (key) => {
    const v = seeds && seeds[key];
    return typeof v === 'string' && v.startsWith('#') && v.length >= 4 ? v : null;
  };

  const pHex = pick('primary') || pick('accent') || fallbackHex;
  const sHex = pick('secondary') || pHex;
  const aHex = pick('accent') || pHex;
  const bHex = pick('base100') || pick('base-100') || '#1a1a2e';

  const p = hslFromHex(pHex);
  const s = hslFromHex(sHex);
  const a = hslFromHex(aHex);
  const b = hslFromHex(bHex);

  const jitter = (base, dH, dS, dL) =>
    hexFromHsl(
      base.h + randRange(rng, -dH, dH),
      Math.max(0, Math.min(100, base.s + randRange(rng, -dS, dS))),
      Math.max(0, Math.min(100, base.l + randRange(rng, -dL, dL))),
    );

  /** Bias dark vs light surfaces from seed base-100 L, then randomize so spins alternate moods. */
  const seedBaseL = Number.isFinite(b.l) ? b.l : 50;
  const darkLean = seedBaseL < 42;
  const lightLean = seedBaseL > 72;
  let darkSurfaces;
  if (darkLean) {
    darkSurfaces = rng() < 0.72;
  } else if (lightLean) {
    darkSurfaces = rng() < 0.32;
  } else {
    darkSurfaces = rng() < 0.5;
  }

  const out = {};

  const surfHue = Number.isFinite(b.h) ? b.h : p.h;

  if (darkSurfaces) {
    out.primary = hexFromHsl(
      p.h + randRange(rng, -12, 12),
      Math.max(48, Math.min(95, p.s + randRange(rng, -10, 14))),
      Math.max(56, Math.min(80, p.l + randRange(rng, -8, 18))),
    );
    out.secondary = hexFromHsl(
      s.h + randRange(rng, -14, 14),
      Math.max(45, Math.min(92, s.s + randRange(rng, -12, 14))),
      Math.max(54, Math.min(78, s.l + randRange(rng, -10, 16))),
    );
    out.accent = hexFromHsl(
      a.h + randRange(rng, -18, 18),
      Math.max(42, Math.min(90, a.s + randRange(rng, -14, 16))),
      Math.max(52, Math.min(82, a.l + randRange(rng, -12, 18))),
    );

    out['base-100'] = hexFromHsl(
      surfHue + randRange(rng, -6, 6),
      randRange(rng, 4, 16),
      randRange(rng, 7, 17),
    );
    out['base-200'] = hexFromHsl(
      surfHue + randRange(rng, -6, 6),
      randRange(rng, 5, 18),
      randRange(rng, 12, 24),
    );
    out['base-300'] = hexFromHsl(
      surfHue + randRange(rng, -6, 6),
      randRange(rng, 6, 20),
      randRange(rng, 18, 32),
    );
    out.neutral = hexFromHsl(
      surfHue + randRange(rng, -8, 8),
      randRange(rng, 5, 16),
      randRange(rng, 10, 22),
    );
    out['base-content'] = hexFromHsl(
      surfHue + randRange(rng, -6, 6),
      randRange(rng, 3, 12),
      randRange(rng, 84, 96),
    );
  } else {
    out.primary = jitter(p, 10, 12, 10);
    out.secondary = jitter(s, 14, 14, 12);
    out.accent = jitter(a, 18, 16, 12);

    out['base-100'] = hexFromHsl(
      surfHue + randRange(rng, -4, 4),
      randRange(rng, 3, 11),
      randRange(rng, 95, 99.5),
    );
    out['base-200'] = hexFromHsl(
      surfHue + randRange(rng, -4, 4),
      randRange(rng, 4, 12),
      randRange(rng, 90, 96),
    );
    out['base-300'] = hexFromHsl(
      surfHue + randRange(rng, -4, 4),
      randRange(rng, 5, 14),
      randRange(rng, 82, 92),
    );
    out.neutral = hexFromHsl(
      surfHue + randRange(rng, -6, 6),
      randRange(rng, 4, 14),
      randRange(rng, 86, 94),
    );
    out['base-content'] = hexFromHsl(
      surfHue + randRange(rng, -8, 8),
      randRange(rng, 5, 18),
      randRange(rng, 10, 24),
    );
  }

  const status = (hueAnchor, sMin, sMax, lMin, lMax) =>
    hexFromHsl(
      hueAnchor + randRange(rng, -6, 6),
      randRange(rng, sMin, sMax),
      randRange(rng, lMin, lMax),
    );

  if (darkSurfaces) {
    out.info = status(210, 58, 90, 52, 72);
    out.success = status(145, 48, 72, 48, 68);
    out.warning = status(42, 72, 94, 58, 76);
    out.error = status(12, 58, 88, 52, 70);
  } else {
    out.info = status(210, 55, 88, 36, 52);
    out.success = status(145, 42, 68, 32, 48);
    out.warning = status(42, 70, 92, 44, 58);
    out.error = status(12, 55, 85, 36, 52);
  }

  for (const role of PAIRED_CONTENT_ROLES) {
    const baseRole = role.replace(/-content$/, '');
    const bg = out[baseRole];
    const { h: hh, s: ss, l: ll } = hslFromHex(out[baseRole] || '#666');
    const guess = hexFromHsl(hh, Math.min(30, (ss || 0) + 5), ll > 55 ? 8 : 96);
    out[role] = ensureContrast(bg, guess);
  }
  out['base-content'] = ensureContrast(out['base-100'], out['base-content']);

  return out;
}

// Utility: Convert oklch(l c h) to hex
function oklchToHex(oklchStr) {
  if (!oklchStr || typeof oklchStr !== 'string') return '#ffffff';
  if (oklchStr.startsWith('#')) return oklchStr;
  const match = oklchStr.match(/oklch\(([^)]+)\)/);
  if (!match) return '#ffffff';
  let [l, c, h] = match[1].split(/\s+/);
  // Handle percentage for lightness (DaisyUI uses e.g. 85%)
  if (l.endsWith('%')) {
    l = parseFloat(l) / 100;
  } else {
    l = parseFloat(l);
  }
  c = parseFloat(c);
  h = parseFloat(h);
  // Convert OKLCH to LAB
  const rad = (deg) => (deg * Math.PI) / 180;
  const a = c * Math.cos(rad(h));
  const b = c * Math.sin(rad(h));
  // Convert OKLab to XYZ
  const L = l;
  const A = a;
  const B = b;
  // OKLab to linear sRGB (approximate)
  let l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  let m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  let s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  l_ = l_ ** 3;
  m_ = m_ ** 3;
  s_ = s_ ** 3;
  let r = +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  let g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  let b_ = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;
  // Clamp and convert to 0-255
  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  b_ = Math.max(0, Math.min(1, b_));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b_)}`;
}

// M3 Tonal Palette Generator
// Generates a full tonal palette from a single source color following Material Design 3 principles
function generateTonalPalette(sourceColor) {
  try {
    const color = Color(sourceColor);
    const hsl = color.hsl().object();
    
    // Create tonal variations based on M3 principles
    const tonalPalette = {};
    
    // M3 tonal values for light theme (0-100)
    const lightTones = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];
    
    // Generate light palette variations
    lightTones.forEach(tone => {
      if (tone === 100) {
        tonalPalette[`light-${tone}`] = '#ffffff';
      } else if (tone === 99) {
        // For light-99, use very light variation of the source color or white
        const lightness = 98;
        const adjustedColor = Color.hsl(hsl.h, hsl.s * 0.1, lightness);
        tonalPalette[`light-${tone}`] = adjustedColor.hex();
      } else if (tone === 0) {
        tonalPalette[`light-${tone}`] = '#000000';
      } else {
        // For light theme, we use the tone value directly as lightness
        const lightness = Math.min(100, Math.max(0, tone));
        const adjustedColor = Color.hsl(hsl.h, hsl.s, lightness);
        tonalPalette[`light-${tone}`] = adjustedColor.hex();
      }
    });
    
    // M3 tonal values for dark theme (0-100)
    const darkTones = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];
    
    // Generate dark palette variations
    darkTones.forEach(tone => {
      if (tone === 100) {
        tonalPalette[`dark-${tone}`] = '#000000';
      } else if (tone === 10) {
        // For dark-10, use a dark variation of the source color
        const lightness = 12;
        const adjustedColor = Color.hsl(hsl.h, hsl.s * 0.8, lightness);
        tonalPalette[`dark-${tone}`] = adjustedColor.hex();
      } else if (tone === 0) {
        tonalPalette[`dark-${tone}`] = '#ffffff';
      } else {
        // For dark theme, we invert the tone value to get proper dark colors
        // Lower tone values should result in darker colors
        const lightness = Math.min(100, Math.max(0, 100 - tone));
        const adjustedColor = Color.hsl(hsl.h, hsl.s, lightness);
        tonalPalette[`dark-${tone}`] = adjustedColor.hex();
      }
    });
    
    return tonalPalette;
  } catch (error) {
    console.error('Error generating tonal palette:', error);
    // Return a fallback palette
    return {
      'light-0': '#000000',
      'light-10': '#1a1a1a',
      'light-20': '#333333',
      'light-30': '#4d4d4d',
      'light-40': '#666666',
      'light-50': '#808080',
      'light-60': '#999999',
      'light-70': '#b3b3b3',
      'light-80': '#cccccc',
      'light-90': '#e6e6e6',
      'light-95': '#f2f2f2',
      'light-99': '#ffffff',
      'light-100': '#ffffff',
      'dark-0': '#ffffff',
      'dark-10': '#0d0d0d',
      'dark-20': '#1a1a1a',
      'dark-30': '#262626',
      'dark-40': '#333333',
      'dark-50': '#404040',
      'dark-60': '#4d4d4d',
      'dark-70': '#595959',
      'dark-80': '#666666',
      'dark-90': '#737373',
      'dark-95': '#f2f2f2',
      'dark-99': '#fafafa',
      'dark-100': '#000000'
    };
  }
}

// Generate M3-based theme from a source color
export function generateM3Theme(sourceColor, mode = 'light') {
  const tonalPalette = generateTonalPalette(sourceColor);
  
  if (mode === 'light') {
    // Generate the base theme
    const theme = {
      'primary': tonalPalette['light-40'],
      'primary-content': tonalPalette['light-100'],
      'secondary': tonalPalette['light-40'],
      'secondary-content': tonalPalette['light-100'],
      'accent': tonalPalette['light-40'],
      'accent-content': tonalPalette['light-100'],
      'neutral': tonalPalette['light-90'],
      'neutral-content': tonalPalette['light-10'],
      'base-100': tonalPalette['light-99'],  // Lightest background
      'base-200': tonalPalette['light-95'],  // Slightly darker background
      'base-300': tonalPalette['light-90'],  // Even darker background
      'base-content': tonalPalette['light-10'], // Darkest text
      'info': '#0284c7',
      'info-content': '#f0f9ff',
      'success': '#16a34a',
      'success-content': '#f0fdf4',
      'warning': '#eab308',
      'warning-content': '#fefce8',
      'error': '#dc2626',
      'error-content': '#fef2f2'
    };
    
    // Ensure proper contrast for content colors
    theme['primary-content'] = ensureContrast(theme['primary'], theme['primary-content']);
    theme['secondary-content'] = ensureContrast(theme['secondary'], theme['secondary-content']);
    theme['accent-content'] = ensureContrast(theme['accent'], theme['accent-content']);
    theme['neutral-content'] = ensureContrast(theme['neutral'], theme['neutral-content']);
    theme['info-content'] = ensureContrast(theme['info'], theme['info-content']);
    theme['success-content'] = ensureContrast(theme['success'], theme['success-content']);
    theme['warning-content'] = ensureContrast(theme['warning'], theme['warning-content']);
    theme['error-content'] = ensureContrast(theme['error'], theme['error-content']);
    theme['base-content'] = ensureContrast(theme['base-100'], theme['base-content']);
    
    return theme;
  } else {
    // Generate the base theme
    const theme = {
      'primary': tonalPalette['dark-80'],
      'primary-content': tonalPalette['dark-20'],
      'secondary': tonalPalette['dark-80'],
      'secondary-content': tonalPalette['dark-20'],
      'accent': tonalPalette['dark-80'],
      'accent-content': tonalPalette['dark-20'],
      'neutral': tonalPalette['dark-10'],
      'neutral-content': tonalPalette['dark-90'],
      'base-100': tonalPalette['dark-10'],   // Darkest background
      'base-200': tonalPalette['dark-20'],   // Slightly lighter background
      'base-300': tonalPalette['dark-30'],   // Even lighter background
      'base-content': tonalPalette['dark-90'], // Lightest text
      'info': '#38bdf8',
      'info-content': '#0c4a6e',
      'success': '#4ade80',
      'success-content': '#14532d',
      'warning': '#fbbf24',
      'warning-content': '#713f12',
      'error': '#f87171',
      'error-content': '#7f1d1d'
    };
    
    // Ensure proper contrast for content colors
    theme['primary-content'] = ensureContrast(theme['primary'], theme['primary-content']);
    theme['secondary-content'] = ensureContrast(theme['secondary'], theme['secondary-content']);
    theme['accent-content'] = ensureContrast(theme['accent'], theme['accent-content']);
    theme['neutral-content'] = ensureContrast(theme['neutral'], theme['neutral-content']);
    theme['info-content'] = ensureContrast(theme['info'], theme['info-content']);
    theme['success-content'] = ensureContrast(theme['success'], theme['success-content']);
    theme['warning-content'] = ensureContrast(theme['warning'], theme['warning-content']);
    theme['error-content'] = ensureContrast(theme['error'], theme['error-content']);
    theme['base-content'] = ensureContrast(theme['base-100'], theme['base-content']);
    
    return theme;
  }
}

/**
 * Invert a DaisyUI palette: for each color, create a visually appealing complementary theme.
 * For content roles, ensure contrast with their base role.
 */
export function invertDaisyPalette(palette) {
  const out = {};
  
  // First, invert all colors using a more sophisticated approach
  for (const role in palette) {
    const hex = palette[role];
    try {
      // Use Color library to manipulate the color
      const color = Color(hex);
      
      // For a better inversion, we'll adjust hue, lightness, and saturation
      // rather than just negating the RGB values
      const hsl = color.hsl().object();
      
      // Shift hue by 180 degrees for complementary color
      const invertedHue = (hsl.h + 180) % 360;
      
      // Adjust lightness: dark colors become light, light colors become dark
      // but with some constraints to maintain visual appeal
      let invertedLightness;
      if (hsl.l > 70) {
        // Very light colors become moderately dark
        invertedLightness = 20 + (100 - hsl.l) * 0.3;
      } else if (hsl.l < 30) {
        // Very dark colors become moderately light
        invertedLightness = 80 - hsl.l * 0.3;
      } else {
        // Mid-range colors get inverted normally
        invertedLightness = 100 - hsl.l;
      }
      
      // Adjust saturation to maintain vibrancy
      let invertedSaturation = Math.min(100, hsl.s * 1.2);
      
      // Create the inverted color
      const invertedColor = Color.hsl(invertedHue, invertedSaturation, invertedLightness);
      out[role] = invertedColor.hex();
    } catch {
      // Fallback to simple inversion if color processing fails
      try {
        out[role] = Color(hex).negate().hex();
      } catch {
        out[role] = hex;
      }
    }
  }
  
  // For *-content roles, ensure contrast with their base role
  for (const role in palette) {
    if (role.endsWith('-content')) {
      const baseRole = role.replace('-content', '');
      const base = out[baseRole] || '#888888';
      let content = out[role];
      try {
        const contrast = Color(base).contrast(Color(content));
        // Improved contrast checking - aim for 4.5:1 or higher for WCAG AA compliance
        if (contrast < 4.5) {
          // Pick black or white for max contrast
          const black = Color('#000000');
          const white = Color('#ffffff');
          const blackContrast = Color(base).contrast(black);
          const whiteContrast = Color(base).contrast(white);
          
          // Choose the color with better contrast, but also consider the original content color
          // to maintain some visual relationship
          if (blackContrast >= 4.5 && whiteContrast >= 4.5) {
            // Both meet contrast requirements, choose the one with better contrast
            content = blackContrast > whiteContrast ? '#000000' : '#ffffff';
          } else if (blackContrast >= 4.5) {
            // Only black meets requirements
            content = '#000000';
          } else if (whiteContrast >= 4.5) {
            // Only white meets requirements
            content = '#ffffff';
          } else {
            // Neither meets requirements, choose the one with better contrast
            content = blackContrast > whiteContrast ? '#000000' : '#ffffff';
          }
        }
      } catch (error) {
        console.error('Error calculating contrast for role:', role, error);
        // Fallback to high-contrast colors
        try {
          const baseLightness = Color(base).luminosity();
          content = baseLightness > 0.5 ? '#000000' : '#ffffff';
        } catch {
          content = '#ffffff';
        }
      }
      out[role] = content;
    }
  }
  
  return out;
}