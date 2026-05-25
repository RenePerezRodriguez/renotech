'use client';

import type { TourDefinition, TourStep } from './definitions';
import { TOUR_DEFINITIONS } from './definitions';
import 'driver.js/dist/driver.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TourState {
  tourId: string;
  stepIndex: number;
  timestamp: number;
}

export interface TourOptions {
  startStep?: number;
  voice?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

type NavigateFn = (route: string) => Promise<void> | void;

// ─── Local storage ────────────────────────────────────────────────────────────

const LS_KEY = 'renotech_tour_state';

function saveState(state: TourState | null) {
  try {
    if (state) localStorage.setItem(LS_KEY, JSON.stringify(state));
    else localStorage.removeItem(LS_KEY);
  } catch {}
}

function loadState(): TourState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TourState;
    if (Date.now() - s.timestamp > 86_400_000) { localStorage.removeItem(LS_KEY); return null; }
    return s;
  } catch { return null; }
}

// ─── Voice narration ──────────────────────────────────────────────────────────

function narrate(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const plain = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const utter = new SpeechSynthesisUtterance(plain);
  utter.lang = 'es';
  utter.rate = 0.88;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

function stopNarration() {
  if (typeof window === 'undefined') return;
  window.speechSynthesis?.cancel();
}

// ─── Branch overlay ───────────────────────────────────────────────────────────

function showBranchOverlay(
  branches: { label: string; tourId: string }[],
  onSelect: (tourId: string) => void,
  onSkip: () => void
) {
  const existing = document.getElementById('__tour_branch_overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '__tour_branch_overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 10002;
    background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: #fff; border-radius: 16px; padding: 28px 24px; max-width: 380px; width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
  `;

  const title = document.createElement('p');
  title.style.cssText = 'font-size: 16px; font-weight: 800; margin-bottom: 8px; color: #0f172a;';
  title.textContent = '¿Qué tipo de operación?';

  const subtitle = document.createElement('p');
  subtitle.style.cssText = 'font-size: 13px; color: #64748b; margin-bottom: 20px;';
  subtitle.textContent = 'Elige el camino para mostrarte el flujo correcto.';

  box.appendChild(title);
  box.appendChild(subtitle);

  branches.forEach(({ label, tourId }) => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display: block; width: 100%; padding: 12px 16px; margin-bottom: 10px;
      background: #0f172a; color: #fff; border: none; border-radius: 10px;
      font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
    `;
    btn.textContent = label;
    btn.onmouseenter = () => { btn.style.opacity = '0.85'; };
    btn.onmouseleave = () => { btn.style.opacity = '1'; };
    btn.onclick = () => { overlay.remove(); onSelect(tourId); };
    box.appendChild(btn);
  });

  const skipBtn = document.createElement('button');
  skipBtn.style.cssText = `
    background: none; border: none; color: #94a3b8; font-size: 12px;
    cursor: pointer; margin-top: 4px; padding: 4px 8px;
  `;
  skipBtn.textContent = 'Saltar tour';
  skipBtn.onclick = () => { overlay.remove(); onSkip(); };
  box.appendChild(skipBtn);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// Helper to look back and find the expected route for a specific step index
function getExpectedRoute(def: TourDefinition, stepIndex: number): string {
  for (let i = stepIndex; i >= 0; i--) {
    if (def.steps[i]?.route) {
      return def.steps[i].route!;
    }
  }
  return def.startRoute;
}

// Helper to poll for an exact route match after navigation
function waitForRoute(route: string, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.location.pathname === route) return resolve(true);

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (window.location.pathname === route) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
}

async function navigateToRoute(navigate: NavigateFn, route: string) {
  if (!navigate) return;
  await navigate(route);
  await waitForRoute(route, 2500);
}

// Helper to poll for element presence before driver initializes
function waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

// ─── Tour Engine ──────────────────────────────────────────────────────────────

class TourEngine {
  private navigate: NavigateFn = () => {};
  private currentDriver: ReturnType<typeof import('driver.js').driver> | null = null;
  private voiceEnabled = false;
  private pendingResume: { tourId: string; stepIndex: number; timestamp: number } | null = null;

  setNavigate(fn: NavigateFn) { this.navigate = fn; }
  setVoice(enabled: boolean) { this.voiceEnabled = enabled; }

  getSavedState(): TourState | null { return loadState(); }

  consumePendingResume(): { tourId: string; stepIndex: number; timestamp: number } | null {
    const s = this.pendingResume;
    this.pendingResume = null;
    return s;
  }

  async startTour(tourId: string, options: TourOptions = {}) {
    const def = TOUR_DEFINITIONS[tourId];
    if (!def) { console.warn(`[Tour] Unknown tour: ${tourId}`); return; }

    const {
      startStep = 0,
      voice = this.voiceEnabled,
      onComplete,
      onSkip,
    } = options;

    // Handle branching on first step
    const firstStep = def.steps[0];
    if (firstStep?.branch && startStep === 0) {
      if (def.startRoute) {
        await navigateToRoute(this.navigate, def.startRoute);
      }
      showBranchOverlay(
        firstStep.branch,
        (branchTourId) => this.startTour(branchTourId, { voice, onComplete, onSkip }),
        () => { saveState(null); onSkip?.(); }
      );
      return;
    }

    // Determine the expected route for this step index
    const expectedRoute = getExpectedRoute(def, startStep);
    
    // Only navigate if we are not already there
    if (typeof window !== 'undefined' && window.location.pathname !== expectedRoute) {
      await navigateToRoute(this.navigate, expectedRoute);
    } else if (startStep === 0 && def.startRoute && typeof window !== 'undefined' && window.location.pathname !== def.startRoute) {
      await navigateToRoute(this.navigate, def.startRoute);
    }

    const steps = def.steps.filter((_, i) => i >= startStep);
    if (steps.length === 0) return;

    // Wait for the first targeted element to exist in the DOM (if specified) before triggering driver.js
    const firstStepEl = steps[0].element;
    if (firstStepEl) {
      await waitForElement(firstStepEl, 3000);
    }

    // Build driver.js dynamically (SSR safe)
    const { driver } = await import('driver.js');

    const driverObj = driver({
      showProgress: true,
      progressText: 'Paso {{current}} de {{total}}',
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Finalizar',
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.72,
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: 'renotech-tour-popover',
      steps: steps.map((step, idx) => this.buildDriverStep(step, idx + startStep, def.steps.length, voice)),

      onPopoverRender: (popover, { driver }) => {
        const prevBtn = popover.previousButton;
        const nextBtn = popover.nextButton;

        if (prevBtn) {
          prevBtn.innerHTML = `<span class="flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" class="w-3 h-3" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>Anterior</span>`;
        }

        if (nextBtn) {
          const isLast = driver.isLastStep();
          if (isLast) {
            nextBtn.innerHTML = `<span class="flex items-center gap-1.5">Finalizar<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" class="w-3 h-3" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></span>`;
          } else {
            nextBtn.innerHTML = `<span class="flex items-center gap-1.5">Siguiente<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" class="w-3 h-3" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></span>`;
          }
        }
      },

      onHighlightStarted: (el, step, { driver }) => {
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const matchedStep = steps.find(s => s.title === step.popover?.title);
        if (voice && matchedStep) {
          const text = matchedStep.narration || matchedStep.description;
          narrate(text);
        }
      },

      onHighlighted: (el, step, { driver }) => {
        if (el) {
          setTimeout(() => { driver.refresh(); }, 150);
        }
      },

      onNextClick: (_el, _step, opts) => {
        const currentIdx = opts.state.activeIndex ?? 0;
        const newIdx = currentIdx + 1 + startStep;
        const nextStep = steps[currentIdx + 1];

        if (nextStep?.route) {
          this.pendingResume = { tourId, stepIndex: newIdx, timestamp: Date.now() };
          saveState({ tourId, stepIndex: newIdx, timestamp: Date.now() });
          opts.driver.destroy();
          this.navigate(nextStep.route);
          setTimeout(() => {
            this.startTour(tourId, { startStep: newIdx, voice, onComplete, onSkip });
          }, 600);
          return;
        }

        saveState({ tourId, stepIndex: newIdx, timestamp: Date.now() });
        opts.driver.moveNext();
      },

      onPrevClick: (_el, _step, opts) => {
        const currentIdx = opts.state.activeIndex ?? 0;
        const prevIdx = Math.max(0, currentIdx - 1 + startStep);
        const prevStep = steps[currentIdx - 1];

        if (prevStep?.route) {
          this.pendingResume = { tourId, stepIndex: prevIdx, timestamp: Date.now() };
          saveState({ tourId, stepIndex: prevIdx, timestamp: Date.now() });
          opts.driver.destroy();
          this.navigate(prevStep.route);
          setTimeout(() => {
            this.startTour(tourId, { startStep: prevIdx, voice, onComplete, onSkip });
          }, 600);
          return;
        }

        saveState({ tourId, stepIndex: prevIdx, timestamp: Date.now() });
        opts.driver.movePrevious();
      },

      onDestroyStarted: (_el, _step, opts) => {
        const idx = opts.state.activeIndex ?? 0;
        const totalSteps = def.steps.length;
        const isLastStep = idx >= totalSteps - startStep - 1;

        stopNarration();

        if (isLastStep) {
          saveState(null);
          onComplete?.();
        } else {
          saveState({ tourId, stepIndex: idx + startStep, timestamp: Date.now() });
          onSkip?.();
        }
        opts.driver.destroy();
      },
    });

    this.currentDriver = driverObj;
    driverObj.drive();
  }

  private buildDriverStep(
    step: TourStep,
    _stepIdx: number,
    _total: number,
    _voice: boolean
  ) {
    const selector = step.element;
    return {
      element: selector ? (() => document.querySelector(selector) as Element) : undefined,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? (selector ? 'bottom' : 'over'),
        align: step.align ?? 'start',
      },
    };
  }

  stopTour() {
    stopNarration();
    document.getElementById('__tour_branch_overlay')?.remove();
    this.currentDriver?.destroy();
    this.currentDriver = null;
  }

  clearSavedState() { saveState(null); }
}

export const tourEngine = new TourEngine();
