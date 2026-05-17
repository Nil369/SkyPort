'use client';

import { useEffect, useState, useRef } from 'react';

const TOUR_COMPLETED_KEY = 'skyport-tour-completed';

/**
 * Hook to manage onboarding tour state
 * Handles localStorage persistence and auto-start logic
 */
export function useOnboardingTour() {
  const [run, setRun] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const hasInitialized = useRef(false);

  // Initialize on client side only
  useEffect(() => {
    if (hasInitialized.current) return;
    
    setIsClient(true);

    // Check localStorage to see if tour has been completed
    const isTourCompleted = localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    
    // Start tour only if it hasn't been completed
    if (!isTourCompleted) {
      setRun(true);
    }
    
    hasInitialized.current = true;
  }, []);

  // Listen for global tour start events so multiple hook instances
  // (Sidebar, DashboardTour) stay in sync within the same window
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStart = () => setRun(true);
    const onStop = () => setRun(false);

    window.addEventListener('skyport:tour-start', onStart as EventListener);
    window.addEventListener('skyport:tour-stop', onStop as EventListener);

    return () => {
      window.removeEventListener('skyport:tour-start', onStart as EventListener);
      window.removeEventListener('skyport:tour-stop', onStop as EventListener);
    };
  }, []);

  /**
   * Mark tour as completed and persist to localStorage
   */
  const completeTour = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    setRun(false);
  };

  /**
   * Reset tour completion status and restart tour
   */
  const resetAndRestartTour = () => {
    // Remove the completion flag from localStorage
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    // Ensure local instance starts immediately
    setRun(true);
    // Notify other hook instances in this window to start the tour
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('skyport:tour-start'));
      } catch (e) {
        window.dispatchEvent(new Event('skyport:tour-start'));
      }
    }
  };

  /**
   * Stop the tour without marking as completed
   */
  const stopTour = () => {
    setRun(false);
  };

  /**
   * Start/resume the tour
   */
  const startTour = () => {
    setRun(true);
  };

  /**
   * Check if tour has been completed
   */
  const isTourCompleted = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  };

  return {
    run,
    setRun,
    completeTour,
    resetAndRestartTour,
    stopTour,
    startTour,
    isTourCompleted,
    isClient,
  };
}
