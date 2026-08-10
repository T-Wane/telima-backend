import { TripStatus } from '@prisma/client';

const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  pending: ['accepted', 'cancelled_by_client', 'cancelled_by_driver', 'cancelled_auto'],
  accepted: ['driver_arriving', 'cancelled_by_client', 'cancelled_by_driver'],
  driver_arriving: ['in_progress', 'cancelled_by_client', 'cancelled_by_driver'],
  in_progress: ['completed'],
  completed: [],
  cancelled_by_client: [],
  cancelled_by_driver: [],
  cancelled_auto: [],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidTransitions(from: TripStatus): TripStatus[] {
  return TRANSITIONS[from] ?? [];
}
