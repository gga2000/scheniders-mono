// Team Components Barrel Export

// Hooks
export { useTeamRealtime, useActivityPulse } from "./hooks/use-team-realtime";
export type { RealtimeActivity } from "./hooks/use-team-realtime";

export { useWorkSessions, formatSessionDuration, formatSessionTimeRange } from "./hooks/use-work-sessions";
export type { WorkSession, DailyWorkSummary, WorkSessionStats } from "./hooks/use-work-sessions";

export { useInfiniteActivities } from "./hooks/use-infinite-activities";

// Main Components
export { HeroStatsBanner } from "./hero-stats-banner";
export { EmployeeSpotlight } from "./employee-spotlight";
export { AnimatedAvatarRing } from "./animated-avatar-ring";
export { QuickActionsMenu } from "./quick-actions-menu";
export { ActivityTimeline } from "./activity-timeline";
export { SessionGroupedActivities } from "./session-grouped-activities";
export { EmployeeComparison } from "./employee-comparison";
export { EmployeeDrawer } from "./employee-drawer";
export { SavedViews, useSavedViews } from "./saved-views";
export { ExportReport } from "./export-report";
export { GoalTracking, useGoals } from "./goal-tracking";
export { TeamAnalyticsTab } from "./team-analytics-tab";

// Charts
export { PerformanceTrendsChart } from "./charts/performance-trends-chart";
export { ActionBreakdownChart } from "./charts/action-breakdown-chart";
export { ActivityHeatmap } from "./charts/activity-heatmap";
export { PeakHoursHeatmap } from "./charts/peak-hours-heatmap";
