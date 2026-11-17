// Shared animation constants — adapted from platform's page-transition.tsx

// UI chrome easing — fast attack, soft land (ease-out-expo style)
export const EASE_CHROME = [0.16, 1, 0.3, 1] as const;

// Card spring — slightly underdamped for organic feel, no visible overshoot
export const SPRING_CARD = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

// Crossfade easing — standard material fade for skeleton→content blends
export const EASE_CROSSFADE = [0.4, 0, 0.2, 1] as const;

// Stagger timing for grid widget entrance
export const STAGGER_CHILDREN = 0.04;
export const DELAY_CHILDREN = 0.02;
