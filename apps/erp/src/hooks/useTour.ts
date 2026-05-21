'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tourEngine } from '@/lib/tours/engine';
import type { TourOptions, TourState } from '@/lib/tours/engine';

export function useTour() {
  const router = useRouter();

  // Wire navigation once
  useEffect(() => {
    tourEngine.setNavigate((route) => router.push(route));
  }, [router]);

  const startTour = useCallback((tourId: string, options?: TourOptions) => {
    tourEngine.startTour(tourId, options);
  }, []);

  const resumeTour = useCallback(() => {
    const state = tourEngine.getSavedState();
    if (!state) return false;
    tourEngine.startTour(state.tourId, {
      startStep: state.stepIndex,
      practiceMode: state.practiceMode,
    });
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
