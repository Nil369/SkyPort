/**
 * SkyPort Onboarding Tour - Integration Examples
 * 
 * This file demonstrates various integration patterns and use cases
 * for the onboarding tour system.
 */

import { useEffect, useState } from 'react';
import { DashboardTour } from '@/components/onboarding/dashboard-tour';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { Sparkles } from 'lucide-react';

// ============================================================================
// Example 1: Basic Layout Integration
// ============================================================================

/**
 * Simplest integration - just add the component to your layout.
 * The tour will auto-start for first-time users and handle everything.
 */
export function LayoutWithTour() {
  return (
    <div>
      <DashboardTour />
      {/* Rest of layout */}
    </div>
  );
}

// ============================================================================
// Example 2: Conditional Tour Display
// ============================================================================

interface LayoutWithConditionalTourProps {
  isNewUser?: boolean;
}

/**
 * Show tour only for new users or when explicitly enabled.
 */
export function LayoutWithConditionalTour({ isNewUser = true }: LayoutWithConditionalTourProps) {
  return (
    <div>
      {/* Only show tour for new users */}
      <DashboardTour disabled={!isNewUser} />
      {/* Rest of layout */}
    </div>
  );
}

// ============================================================================
// Example 3: Using the Hook for Manual Control
// ============================================================================

/**
 * Manually control the tour using the hook.
 */
export function ComponentWithTourControl() {
  const {
    run,
    completeTour,
    resetAndRestartTour,
    stopTour,
    startTour,
    isTourCompleted,
  } = useOnboardingTour();

  return (
    <div className="space-y-4">
      <div className="text-sm">
        Tour Status: {isTourCompleted() ? '✅ Completed' : '⏳ Not completed'}
      </div>

      <div className="space-y-2">
        <button onClick={startTour} className="btn btn-primary">
          Start Tour
        </button>

        <button onClick={resetAndRestartTour} className="btn btn-secondary">
          Restart Tour
        </button>

        <button onClick={completeTour} className="btn btn-outline">
          Mark as Completed
        </button>

        <button onClick={stopTour} className="btn btn-outline">
          Stop Tour
        </button>
      </div>

      {/* Show tour indicator */}
      <div className="text-xs text-muted-foreground">
        Tour Running: {run ? '🟢 Yes' : '🔴 No'}
      </div>
    </div>
  );
}

// ============================================================================
// Example 4: Profile Dropdown Integration
// ============================================================================

/**
 * Add "Start Tour" to profile dropdown menu.
 * (Already integrated in Sidebar, shown for reference)
 */
export function ProfileDropdownWithTour() {
  const { resetAndRestartTour } = useOnboardingTour();

  return (
    <div className="space-y-1 rounded-lg border p-2">
      <button
        onClick={resetAndRestartTour}
        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent"
      >
        <Sparkles className="size-4 text-blue-500" />
        <span>Start Tour</span>
      </button>

      {/* Other menu items */}
      <a href="/profile" className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent">
        Profile
      </a>

      <a href="/settings" className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent">
        Settings
      </a>
    </div>
  );
}

// ============================================================================
// Example 5: Tour Onboarding Modal
// ============================================================================

/**
 * Show a modal to new users with onboarding options.
 */
export function OnboardingModal() {
  const { resetAndRestartTour, isTourCompleted } = useOnboardingTour();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Show modal only for first-time users
    if (!isTourCompleted()) {
      setTimeout(() => setShowModal(true), 1000);
    }
  }, [isTourCompleted]);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Welcome to SkyPort! 🚀</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Would you like a guided tour of the dashboard?
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              setShowModal(false);
              resetAndRestartTour();
            }}
            className="btn btn-primary"
          >
            Yes, Show Me Around
          </button>

          <button
            onClick={() => setShowModal(false)}
            className="btn btn-outline"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Example 6: Adding Data-Tour Attributes to Components
// ============================================================================

/**
 * Components should have data-tour attributes to be highlighted by the tour.
 */

// Navigation item with tour attribute
export function NavItemWithTour() {
  return (
    <a
      href="/deployments"
      data-tour="deployments"
      className="flex items-center gap-2 rounded px-3 py-2 hover:bg-accent"
    >
      {/* Icon and label */}
      Deployments
    </a>
  );
}

// Search bar with tour attribute
export function SearchBarWithTour() {
  return (
    <div data-tour="search" className="flex items-center gap-2 rounded border px-3 py-2">
      <input type="text" placeholder="Search..." className="flex-1 bg-transparent outline-none" />
    </div>
  );
}

// Status indicator with tour attribute
export function StatusIndicatorWithTour() {
  return (
    <div data-tour="realtime" className="flex items-center gap-2">
      <span className="inline-block size-2 rounded-full bg-green-500"></span>
      <span className="text-xs text-muted-foreground">Realtime Connected</span>
    </div>
  );
}

// ============================================================================
// Example 7: Tracking Tour Events
// ============================================================================

/**
 * Log or track when users complete the tour.
 */
export function TourEventTracking() {
  const { run } = useOnboardingTour();

  useEffect(() => {
    if (!run) {
      // Tour just completed or was skipped
      const completed = localStorage.getItem('skyport-tour-completed');
      if (completed) {
        // Send analytics event
        console.log('Tour completed - send to analytics');
        // Analytics.trackEvent('tour_completed');
      }
    }
  }, [run]);

  return null;
}

// ============================================================================
// Example 8: Progressive Tour Disclosure
// ============================================================================

/**
 * Show abbreviated tour for returning users, full tour for new users.
 */
export function ProgressiveTour({ userVisitCount }: { userVisitCount: number }) {
  const isNewUser = userVisitCount === 1;

  // Full tour for new users
  if (isNewUser) {
    return <DashboardTour />;
  }

  // You could show a mini-tour or skip entirely for returning users
  return null;
}

// ============================================================================
// Example 9: Tour with Custom Styling
// ============================================================================

/**
 * The tour component accepts styling props.
 * For more advanced customization, extend the DashboardTour component.
 */
export function CustomStyledTour() {
  return (
    // DashboardTour uses theme-aware colors automatically
    // Customize by editing the component's styles object
    <DashboardTour />
  );
}

// ============================================================================
// Example 10: Testing Tour State
// ============================================================================

/**
 * Utilities for testing tour functionality.
 */
export function TourTestingUtils() {
  return {
    // Reset tour for testing
    resetTour: () => {
      localStorage.removeItem('skyport-tour-completed');
      localStorage.removeItem('skyport-tour-shown-version');
      window.location.reload();
    },

    // Check tour status
    isTourCompleted: () => {
      return localStorage.getItem('skyport-tour-completed') === 'true';
    },

    // Get tour completion timestamp
    getTourCompletedAt: () => {
      return localStorage.getItem('skyport-tour-shown-version');
    },

    // Force restart tour
    forceRestartTour: () => {
      localStorage.removeItem('skyport-tour-completed');
      // Hook will auto-start on next render
    },
  };
}

// ============================================================================
// Example 11: Responsive Tour Considerations
// ============================================================================

/**
 * Tour works responsively, but may need adjustments for mobile.
 */
export function ResponsiveTourConsiderations() {
  const isMobile = window.innerWidth < 768;

  return (
    <div>
      {/* Tour still works on mobile, just ensure tour targets are visible */}
      <DashboardTour />

      {/* Mobile-specific notice */}
      {isMobile && (
        <div className="text-xs text-muted-foreground">
          💡 Tip: Scroll up/down during the tour to see highlighted features
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 12: Integration with User Settings
// ============================================================================

/**
 * Allow users to enable/disable tour features in settings.
 */
export function TourSettings() {
  const [autoShowTour, setAutoShowTour] = useState(true);
  const { resetAndRestartTour } = useOnboardingTour();

  return (
    <div className="space-y-4 rounded border p-4">
      <div className="flex items-center justify-between">
        <label className="text-sm">Show onboarding tour for new features</label>
        <input
          type="checkbox"
          checked={autoShowTour}
          onChange={(e) => setAutoShowTour(e.target.checked)}
          className="rounded"
        />
      </div>

      <button
        onClick={resetAndRestartTour}
        className="btn btn-secondary w-full"
      >
        Restart Dashboard Tour
      </button>

      <button
        onClick={() => localStorage.removeItem('skyport-tour-completed')}
        className="btn btn-outline w-full"
      >
        Reset Tour Status
      </button>
    </div>
  );
}

// ============================================================================
// Type Definitions for Reference
// ============================================================================

/**
 * Export types for use in other components
 */
export type { DashboardTourProps } from '@/components/onboarding/dashboard-tour';

/**
 * Hook return type for reference
 */
export interface UseOnboardingTourReturn {
  run: boolean;
  setRun: (value: boolean) => void;
  completeTour: () => void;
  resetAndRestartTour: () => void;
  stopTour: () => void;
  startTour: () => void;
  isTourCompleted: () => boolean;
  isClient: boolean;
}
