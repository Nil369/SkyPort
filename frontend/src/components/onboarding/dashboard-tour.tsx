'use client';

import React from 'react';
import { Joyride, STATUS, type Step, type EventData } from 'react-joyride';
import { useTheme } from '@/components/theme-provider';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import {
  Cloud,
  FolderOpen,
  Cpu,
  FileText,
  Box,
  Terminal,
  Zap,
  Boxes,
  Search,
  Activity,
  User,
} from 'lucide-react';

/**
 * Helper component for formatted content with bold keywords
 */
const FormattedContent: React.FC<{ 
  children: React.ReactNode
  icon?: React.ReactNode
}> = ({ children, icon }) => (
  <div className="flex gap-3 items-start">
    {icon && (
      <div className="shrink-0 mt-1">
        {icon}
      </div>
    )}
    <div className="flex-1">
      {children}
    </div>
  </div>
);

/**
 * SkyPort logo component for the welcome step
 */
const SkyPortLogo: React.FC = () => (
  <div className="text-center mb-4">
    <div className="inline-flex items-center justify-center mb-3">
      <img src="/logo.png" alt="SkyPort Logo" className="w-16 h-16" />
    </div>
    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-500">
      SkyPort
    </h2>
    <p className="text-xs text-gray-500 mt-1">Your Lightweight Developer Cloud OS</p>
  </div>
);

const TOUR_STEPS: Step[] = [
  {
    target: 'body',
    content: (
      <div>
        <SkyPortLogo />
        <p className="text-sm leading-relaxed">
          Welcome to <strong>SkyPort</strong> — your lightweight developer cloud OS. This tour will show you all the powerful features at your fingertips.
        </p>
      </div>
    ),
    placement: 'center',
  },
  {
    target: '[data-tour="sidebar"]',
    content: (
      <FormattedContent icon={<Cloud className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Access <strong>deployments</strong>, <strong>Docker</strong>, <strong>domains</strong>, <strong>monitoring</strong>, and all <strong>infrastructure tools</strong> from one place. Everything you need for <strong>server management</strong>.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="projects"]',
    content: (
      <FormattedContent icon={<FolderOpen className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          <strong>Projects</strong> help organize <strong>applications</strong>, <strong>services</strong>, <strong>databases</strong>, and <strong>deployments</strong>. Group related resources together for better management.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="deployments"]',
    content: (
      <FormattedContent icon={<Cpu className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Track <strong>live deployments</strong>, <strong>logs</strong>, <strong>status</strong>, and <strong>runtime activity</strong>. Monitor your applications in <strong>real-time</strong>.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="files"]',
    content: (
      <FormattedContent icon={<FileText className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Manage <strong>server files</strong> directly from the browser. <strong>Upload</strong>, <strong>edit</strong>, <strong>delete</strong>, and <strong>organize</strong> your project files with ease.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="docker"]',
    content: (
      <FormattedContent icon={<Box className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Manage <strong>Docker containers</strong>, <strong>images</strong>, <strong>volumes</strong>, and <strong>networking</strong>. <strong>Build</strong>, <strong>run</strong>, and <strong>scale</strong> containerized applications.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="terminal"]',
    content: (
      <FormattedContent icon={<Terminal className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Access your <strong>server terminal</strong> securely inside the dashboard. <strong>Execute commands</strong> and <strong>debug</strong> directly from your browser.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="process-manager"]',
    content: (
      <FormattedContent icon={<Zap className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Monitor and manage <strong>background processes</strong> and <strong>services</strong>. Keep your applications running smoothly with <strong>process supervision</strong>.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="marketplace"]',
    content: (
      <FormattedContent icon={<Boxes className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Install <strong>databases</strong>, <strong>runtimes</strong>, <strong>CMS apps</strong>, <strong>monitoring tools</strong>, and <strong>developer services</strong> instantly. Extend SkyPort with powerful integrations.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
  {
    target: '[data-tour="search"]',
    content: (
      <FormattedContent icon={<Search className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Quickly <strong>search</strong> projects, deployments, apps, and infrastructure resources. Find what you need in <strong>seconds</strong>.
        </p>
      </FormattedContent>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="realtime"]',
    content: (
      <FormattedContent icon={<Activity className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          SkyPort continuously tracks <strong>infrastructure activity</strong> and <strong>live system events</strong>. Stay updated with <strong>real-time status indicators</strong>.
        </p>
      </FormattedContent>
    ),
    placement: 'bottom',
  },
  {
    target: '[data-tour="profile-menu"]',
    content: (
      <FormattedContent icon={<User className="w-5 h-5 text-blue-500" />}>
        <p className="text-sm">
          Manage your <strong>account</strong>, <strong>team settings</strong>, <strong>preferences</strong>, and restart the <strong>onboarding tour</strong> anytime. All your profile options in one place.
        </p>
      </FormattedContent>
    ),
    placement: 'right',
  },
];

interface DashboardTourProps {
  disabled?: boolean;
}

/**
 * DashboardTour Component
 * 
 * Renders a beautiful onboarding tour using react-joyride
 * Features:
 * - Auto-starts for first-time users
 * - Persists completion status in localStorage
 * - Dark/light theme support
 * - Smooth animations and polished UX
 * - Keyboard navigation enabled
 * 
 * Usage:
 * ```tsx
 * <DashboardTour />
 * ```
 */
export function DashboardTour({ disabled = false }: DashboardTourProps) {
  const { run, completeTour } = useOnboardingTour();
  const { effectiveTheme } = useTheme();

  // Determine colors based on theme
  const isDark = effectiveTheme === 'dark';
  const colors = {
    primary: '#3b82f6', // blue-500
    secondary: '#06b6d4', // cyan-500
    background: isDark ? '#081225' : '#ffffff',
    text: isDark ? '#e5e7eb' : '#1f2937',
    overlay: isDark ? 'rgba(2,6,23,0.75)' : 'rgba(0,0,0,0.5)',
    arrow: isDark ? '#081225' : '#ffffff',
    border: isDark ? '#1e293b' : '#e5e7eb',
  };

  const handleJoyrideCallback = (data: EventData) => {
    const { status } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      completeTour();
    }
  };

  if (disabled) {
    return null;
  }

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      scrollToFirstStep
      options={{
        primaryColor: colors.primary,
        backgroundColor: colors.background,
        textColor: colors.text,
        overlayColor: colors.overlay,
        arrowColor: colors.arrow,
        zIndex: 10000,
        arrowSize: 16,
        beaconSize: 36,
        offset: 10,
        width: 320,
        spotlightPadding: 6
      }}
      onEvent={handleJoyrideCallback}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip',
      }}
    />
  );
}

export type { DashboardTourProps };
