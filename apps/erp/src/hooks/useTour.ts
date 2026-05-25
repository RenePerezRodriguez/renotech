'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tourEngine } from '@/lib/tours/engine';
import type { TourOptions, TourState } from '@/lib/tours/engine';

export function useTour() {
  const router = useRouter();

  useEffect(() => {
    tourEngine.setNavigate((route) => router.push(route));

    // Auto-resume after cross-route tour navigation
    const pending = tourEngine.consumePendingResume();
    if (pending) {
      const timer = setTimeout(() => {
        tourEngine.startTour(pending.tourId, { startStep: pending.stepIndex });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [router]);

  const startTour = useCallback((tourId: string, options?: TourOptions) => {
    tourEngine.startTour(tourId, options);
  }, []);

  const resumeTour = useCallback(() => {
    const state = tourEngine.getSavedState();
    if (!state) return false;
    tourEngine.startTour(state.tourId, { startStep: state.stepIndex });
    return true;
  }, []);

  const stopTour = useCallback(() => {
    tourEngine.stopTour();
  }, []);

  const clearSaved = useCallback(() => {
    tourEngine.clearSavedState();
  }, []);

  const getSavedState = useCallback((): TourState | null => {
    return tourEngine.getSavedState();
  }, []);

  return { startTour, resumeTour, stopTour, clearSaved, getSavedState };
}
