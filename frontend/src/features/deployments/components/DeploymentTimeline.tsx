import React from 'react'

interface Step {
  name: string
  label: string
  completed: boolean
  active: boolean
}

export const DeploymentTimeline: React.FC<{ status?: string }> = ({ status }) => {
  const statusMap: Record<string, number> = {
    queued: 0,
    cloning: 1,
    building: 2,
    starting: 3,
    health_checking: 4,
    switching_traffic: 5,
    running: 6,
    failed: -1,
  }

  const currentIndex = statusMap[status || ''] ?? -2
  const isError = status === 'failed'

  const steps: Step[] = [
    { name: 'queued', label: 'Queued', completed: currentIndex > 0, active: currentIndex === 0 },
    { name: 'cloning', label: 'Cloning', completed: currentIndex > 1, active: currentIndex === 1 },
    { name: 'building', label: 'Building', completed: currentIndex > 2, active: currentIndex === 2 },
    { name: 'starting', label: 'Starting', completed: currentIndex > 3, active: currentIndex === 3 },
    { name: 'health_checking', label: 'Health Checking', completed: currentIndex > 4, active: currentIndex === 4 },
    { name: 'switching_traffic', label: 'Switching Traffic', completed: currentIndex > 5, active: currentIndex === 5 },
    { name: 'running', label: 'Running', completed: currentIndex > 6, active: currentIndex === 6 },
  ]

  return (
    <div className="space-y-4">
      {steps.map((step, idx) => (
        <div key={step.name} className="flex items-start gap-3">
          {/* Circle */}
          <div className="flex flex-col items-center">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step.completed
                  ? 'bg-green-500 text-white'
                  : step.active
                  ? 'bg-blue-500 text-white animate-pulse'
                  : isError && currentIndex >= 0
                  ? 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              {step.completed ? '✓' : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`w-0.5 h-12 ${
                  step.completed
                    ? 'bg-green-500'
                    : step.active
                    ? 'bg-blue-500'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            )}
          </div>
          {/* Label */}
          <div className="pt-0.5">
            <div className="font-medium text-slate-900 dark:text-white">{step.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {step.completed ? 'Completed' : step.active ? 'In progress' : 'Pending'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
