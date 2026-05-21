'use client';

import type { TourDefinition, TourStep } from './definitions';
import { TOUR_DEFINITIONS } from './definitions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TourState {
  tourId: string;
  stepIndex: number;
  practiceMode: boolean;
  timestamp: number;
}

export interface TourOptions {
  practiceMode?: boolean;
  startStep?: number;
  voice?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

type NavigateFn = (route: string) => void;

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
    // Discard state older than 24 hours
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

// ─── Practice mode banner ─────────────────────────────────────────────────────

function showPracticeBanner() {
  const existing = document.getElementById('__tour_practice_banner');
  if (existing) return;
  const el = document.createElement('div');
  el.id = '__tour_practice_banner';
  el.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 10001;
    background: #f59e0b; color: #000; font-size: 12px; font-weight: 700;
    text-align: center; padding: 6px 12px; letter-spacing: 0.05em;
    text-transform: uppercase; pointer-events: none;
  `;
  el.textContent = '⚠️  MODO PRÁCTICA — Esta guía es interactiva. No se realizarán cambios reales.';
  document.body.appendChild(el);
}

function hidePracticeBanner() {
  document.getElementById('__tour_practice_banner')?.remove();
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

// ─── Tour Engine ──────────────────────────────────────────────────────────────

class TourEngine {
  private navigate: NavigateFn = () => {};
  private currentDriver: ReturnType<typeof import('driver.js').driver> | null = null;
  private voiceEnabled = false;

  setNavigate(fn: NavigateFn) { this.navigate = fn; }
  setVoice(enabled: boolean) { this.voiceEnabled = enabled; }

  getSavedState(): TourState | null { return loadState(); }

  async startTour(tourId: string, options: TourOptions = {}) {
    const def = TOUR_DEFINITIONS[tourId];
    if (!def) { console.warn(`[Tour] Unknown tour: ${tourId}`); return; }

    const {
      practiceMode = false,
      startStep = 0,
      voice = this.voiceEnabled,
      onComplete,
      onSkip,
    } = options;

    // Handle branching on first step
    const firstStep = def.steps[0];
    if (firstStep?.branch && startStep === 0) {
      this.navigate(def.startRoute);
      await new Promise<void>(r => setTimeout(r, 350));
      showBranchOverlay(
        firstStep.branch,
        (branchTourId) => this.startTour(branchTourId, { practiceMode, voice, onComplete, onSkip }),
        () => { saveState(null); onSkip?.(); }
      );
      return;
    }

    // Navigate to starting route
    if (def.startRoute) {
      this.navigate(def.startRoute);
      await new Promise<void>(r => setTimeout(r, 450));
    }

    if (practiceMode) showPracticeBanner();

    // Build driver.js dynamically (SSR safe)
    const { driver } = await import('driver.js');
    await import('driver.js/dist/driver.css' as string);

    const steps = def.steps.filter((_, i) => i >= startStep);

    const driverObj = driver({
      showProgress: true,
      progressText: 'Paso {{current}} de {{total}}',
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: '✓ Finalizar',
      allowClose: true,
      overlayOpacity: 0.72,
      popoverClass: 'renotech-tour-popover',
      steps: steps.map((step, idx) => this.buildDriverStep(step, tourId, idx + startStep, def.steps.length, voice)),

      onHighlightStarted: (_el, step) => {
        const matchedStep = steps.find(s => s.title === step.popover?.title);
        if (voice && matchedStep) {
          const text = matchedStep.narration || matchedStep.description;
          narrate(text);
        }
      },

      onNextClick: (_el, _step, opts) => {
        const newIdx = (opts.state.activeIndex ?? 0) + 1 + startStep;
        saveState({ tourId, stepIndex: newIdx, practiceMode, timestamp: Date.now() });
        opts.driver.moveNext();
      },

      onPrevClick: (_el, _step, opts) => {
        const newIdx = Math.max(0, (opts.state.activeIndex ?? 0) - 1 + startStep);
        saveState({ tourId, stepIndex: newIdx, practiceMode, timestamp: Date.now() });
        opts.driver.movePrevious();
      },

      onDestroyStarted: (_el, _step, opts) => {
        const idx = opts.state.activeIndex ?? 0;
        const totalSteps = def.steps.length;
        const isLastStep = idx >= totalSteps - startStep - 1;

        stopNarration();
        hidePracticeBanner();

        if (isLastStep) {
          saveState(null);
          onComplete?.();
        } else {
          // User pressed skip
          saveState({ tourId, stepIndex: idx + startStep, practiceMode, timestamp: Date.now() });
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
    _tourId: string,
    _stepIdx: number,
    _total: number,
    _voice: boolean
  ) {
    // Try to find element — if selector matches nothing, use centered popover
    const elementSelector = step.element
      ? this.resolveSelector(step.element)
      : undefined;

    return {
      element: elementSelector ?? undefined,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? (elementSelector ? 'bottom' : 'over'),
        align: step.align ?? 'start',
      },
    };
  }

  /** Tries each comma-separated selector, returns first that exists in DOM */
  private resolveSelector(selectors: string): string | undefined {
    const parts = selectors.split(',').map(s => s.trim());
    for (const sel of parts) {
      try { if (document.querySelector(sel)) return sel; } catch {}
    }
    return undefined;
  }

  stopTour() {
    stopNarration();
    hidePracticeBanner();
    document.getElementById('__tour_branch_overlay')?.remove();
    this.currentDriver?.destroy();
    this.currentDriver = null;
  }

  clearSavedState() { saveState(null); }
}

export const tourEngine = new TourEngine();
