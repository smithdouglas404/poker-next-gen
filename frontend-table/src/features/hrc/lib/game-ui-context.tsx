import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface FeltPreset {
  id: string;
  label: string;
  gradient: string;
  spotlightOverlay: string;
  swatch: string; // CSS color for the swatch circle
  imageUrl?: string; // Optional image-based felt
}

export const FELT_PRESETS: FeltPreset[] = [
  {
    id: 'green',
    label: 'Classic Green',
    gradient: 'radial-gradient(ellipse at 50% 48%, #19723c 0%, #16592d 30%, #0f4724 55%, #0d4020 75%, #0b3c1e 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(255,255,240,0.08) 0%, transparent 60%)',
    swatch: '#19723c',
  },
  {
    id: 'midnight',
    label: 'Midnight Blue',
    gradient: 'radial-gradient(ellipse at 50% 48%, #1a3a6b 0%, #152d55 30%, #102345 55%, #0c1a38 75%, #091430 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(200,220,255,0.06) 0%, transparent 60%)',
    swatch: '#1a3a6b',
  },
  {
    id: 'charcoal',
    label: 'Charcoal Gray',
    gradient: 'radial-gradient(ellipse at 50% 48%, #3a3a3a 0%, #2e2e2e 30%, #242424 55%, #1e1e1e 75%, #181818 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(255,255,255,0.05) 0%, transparent 60%)',
    swatch: '#3a3a3a',
  },
  {
    id: 'teal',
    label: 'Dark Teal',
    gradient: 'radial-gradient(ellipse at 50% 48%, #1a5c5c 0%, #164d4d 30%, #0f3d3d 55%, #0b3333 75%, #082a2a 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(200,255,255,0.06) 0%, transparent 60%)',
    swatch: '#1a5c5c',
  },
  {
    id: 'royal_velvet',
    label: 'Royal Velvet',
    gradient: 'radial-gradient(ellipse at 50% 48%, #6b1a2a 0%, #551525 30%, #3d0f1c 55%, #330b18 75%, #2a0815 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(255,200,200,0.06) 0%, transparent 60%)',
    swatch: '#6b1a2a',
    imageUrl: '/felts/felt_royal_velvet.webp',
  },
  {
    id: 'ocean_deep',
    label: 'Ocean Deep',
    gradient: 'radial-gradient(ellipse at 50% 48%, #1a2a6b 0%, #152255 30%, #0f1a45 55%, #0b1438 75%, #081030 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(150,200,255,0.06) 0%, transparent 60%)',
    swatch: '#1a2a6b',
    imageUrl: '/felts/felt_ocean_deep.webp',
  },
  {
    id: 'emerald_luxury',
    label: 'Emerald Luxury',
    gradient: 'radial-gradient(ellipse at 50% 48%, #1a6b3c 0%, #15552d 30%, #0f4524 55%, #0b3b1e 75%, #08301a 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(200,255,220,0.06) 0%, transparent 60%)',
    swatch: '#1a6b3c',
    imageUrl: '/felts/felt_emerald_luxury.webp',
  },
  {
    id: 'cosmic_purple',
    label: 'Cosmic Purple',
    gradient: 'radial-gradient(ellipse at 50% 48%, #3a1a5c 0%, #2d154d 30%, #241040 55%, #1c0b33 75%, #15082a 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(200,150,255,0.06) 0%, transparent 60%)',
    swatch: '#3a1a5c',
    imageUrl: '/felts/felt_cosmic_purple.webp',
  },
  {
    id: 'carbon_fiber',
    label: 'Carbon Fiber',
    gradient: 'radial-gradient(ellipse at 50% 48%, #2a2a2a 0%, #222222 30%, #1a1a1a 55%, #141414 75%, #0e0e0e 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(255,255,255,0.04) 0%, transparent 60%)',
    swatch: '#2a2a2a',
    imageUrl: '/felts/felt_carbon_fiber.webp',
  },
  {
    id: 'gold_vip',
    label: 'Gold VIP',
    gradient: 'radial-gradient(ellipse at 50% 48%, #2a2210 0%, #221c0c 30%, #1a1508 55%, #141006 75%, #0e0c04 100%)',
    spotlightOverlay: 'radial-gradient(ellipse 45% 40% at 50% 48%, rgba(255,215,0,0.06) 0%, transparent 60%)',
    swatch: '#2a2210',
    imageUrl: '/felts/felt_gold_vip.webp',
  },
];

// Card back presets
export interface CardBackPreset {
  id: string;
  label: string;
  imageUrl?: string; // If set, renders image instead of SVG pattern
  swatch: string;
}

export const CARD_BACK_PRESETS: CardBackPreset[] = [
  { id: 'default', label: 'Default', swatch: '#1a0e3e' },
  { id: 'classic', label: 'Classic Navy', imageUrl: '/cardbacks/cardback_classic.webp', swatch: '#1a2a5c' },
  { id: 'neon', label: 'Neon Cyber', imageUrl: '/cardbacks/cardback_neon.webp', swatch: '#d4af37' },
  { id: 'royal', label: 'Royal Red', imageUrl: '/cardbacks/cardback_royal.webp', swatch: '#8b0000' },
  { id: 'holographic', label: 'Holographic', imageUrl: '/cardbacks/cardback_holographic.webp', swatch: '#c0c0ff' },
];

export type RunItTwicePreference = "always" | "ask" | "once";
export type GesturesVisibility = "show" | "sound-muted" | "hidden";

interface GameUIContextValue {
  compactMode: boolean;
  toggleCompactMode: () => void;
  feltColor: string;
  setFeltColor: (id: string) => void;
  feltPreset: FeltPreset;
  cardBack: string;
  setCardBack: (id: string) => void;
  cardBackPreset: CardBackPreset;
  // Player preferences
  disableChatBeep: boolean;
  setDisableChatBeep: (v: boolean) => void;
  runItTwicePreference: RunItTwicePreference;
  setRunItTwicePreference: (v: RunItTwicePreference) => void;
  autoActivateExtraTime: boolean;
  setAutoActivateExtraTime: (v: boolean) => void;
  hideHandReviewNotification: boolean;
  setHideHandReviewNotification: (v: boolean) => void;
  gesturesVisibility: GesturesVisibility;
  setGesturesVisibility: (v: GesturesVisibility) => void;
}

const GameUIContext = createContext<GameUIContextValue | null>(null);

function getInitialCompactMode(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('compact') === 'true') return true;
    return localStorage.getItem('poker-compact-mode') === 'true';
  } catch {
    return false;
  }
}

function getInitialFeltColor(): string {
  try {
    const stored = localStorage.getItem('poker-felt-color');
    if (stored && FELT_PRESETS.some(p => p.id === stored)) return stored;
  } catch {}
  return 'green';
}

function getInitialCardBack(): string {
  try {
    const stored = localStorage.getItem('poker-card-back');
    if (stored && CARD_BACK_PRESETS.some(p => p.id === stored)) return stored;
  } catch {}
  return 'default';
}

function getInitialBool(key: string, defaultVal: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === 'true';
  } catch {}
  return defaultVal;
}

function getInitialString<T extends string>(key: string, valid: T[], defaultVal: T): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && valid.includes(stored)) return stored;
  } catch {}
  return defaultVal;
}

export function GameUIProvider({ children }: { children: ReactNode }) {
  const [compactMode, setCompactMode] = useState(getInitialCompactMode);
  const [feltColor, setFeltColorState] = useState(getInitialFeltColor);
  const [cardBack, setCardBackState] = useState(getInitialCardBack);

  // Player preferences
  const [disableChatBeep, setDisableChatBeepState] = useState(() => getInitialBool('poker-disable-chat-beep', false));
  const [runItTwicePreference, setRunItTwicePrefState] = useState<RunItTwicePreference>(() => getInitialString('poker-run-it-twice-pref', ['always', 'ask', 'once'], 'ask'));
  const [autoActivateExtraTime, setAutoExtraTimeState] = useState(() => getInitialBool('poker-auto-extra-time', false));
  const [hideHandReviewNotification, setHideHandReviewState] = useState(() => getInitialBool('poker-hide-hand-review', false));
  const [gesturesVisibility, setGesturesVisState] = useState<GesturesVisibility>(() => getInitialString('poker-gestures-visibility', ['show', 'sound-muted', 'hidden'], 'show'));

  const toggleCompactMode = useCallback(() => {
    setCompactMode(prev => {
      const next = !prev;
      try { localStorage.setItem('poker-compact-mode', String(next)); } catch {}
      return next;
    });
  }, []);

  const setFeltColor = useCallback((id: string) => {
    if (FELT_PRESETS.some(p => p.id === id)) {
      setFeltColorState(id);
      try { localStorage.setItem('poker-felt-color', id); } catch {}
    }
  }, []);

  const setCardBack = useCallback((id: string) => {
    if (CARD_BACK_PRESETS.some(p => p.id === id)) {
      setCardBackState(id);
      try { localStorage.setItem('poker-card-back', id); } catch {}
    }
  }, []);

  const setDisableChatBeep = useCallback((v: boolean) => {
    setDisableChatBeepState(v);
    try { localStorage.setItem('poker-disable-chat-beep', String(v)); } catch {}
  }, []);

  const setRunItTwicePreference = useCallback((v: RunItTwicePreference) => {
    setRunItTwicePrefState(v);
    try { localStorage.setItem('poker-run-it-twice-pref', v); } catch {}
  }, []);

  const setAutoActivateExtraTime = useCallback((v: boolean) => {
    setAutoExtraTimeState(v);
    try { localStorage.setItem('poker-auto-extra-time', String(v)); } catch {}
  }, []);

  const setHideHandReviewNotification = useCallback((v: boolean) => {
    setHideHandReviewState(v);
    try { localStorage.setItem('poker-hide-hand-review', String(v)); } catch {}
  }, []);

  const setGesturesVisibility = useCallback((v: GesturesVisibility) => {
    setGesturesVisState(v);
    try { localStorage.setItem('poker-gestures-visibility', v); } catch {}
  }, []);

  const feltPreset = FELT_PRESETS.find(p => p.id === feltColor) || FELT_PRESETS[0];
  const cardBackPreset = CARD_BACK_PRESETS.find(p => p.id === cardBack) || CARD_BACK_PRESETS[0];

  return (
    <GameUIContext.Provider value={{
      compactMode, toggleCompactMode,
      feltColor, setFeltColor, feltPreset,
      cardBack, setCardBack, cardBackPreset,
      disableChatBeep, setDisableChatBeep,
      runItTwicePreference, setRunItTwicePreference,
      autoActivateExtraTime, setAutoActivateExtraTime,
      hideHandReviewNotification, setHideHandReviewNotification,
      gesturesVisibility, setGesturesVisibility,
    }}>
      {children}
    </GameUIContext.Provider>
  );
}

export function useGameUI(): GameUIContextValue {
  const ctx = useContext(GameUIContext);
  if (!ctx) {
    throw new Error('useGameUI must be used within a GameUIProvider');
  }
  return ctx;
}
