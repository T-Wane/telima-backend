export const QueueNames = {
  DispatchTimeout: 'dispatch-timeout',
  Notifications: 'notifications',
  PaymentsReconciliation: 'payments-reconciliation',
  Maintenance: 'maintenance',
} as const;

export const DispatchTimeoutJob = {
  name: 'dispatch-timeout',
  ttl: 15000,
  attempts: 0,
} as const;
