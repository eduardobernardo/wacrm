export type RouteStrategy = 'auto' | 'sequential';

export type RouteTarget =
  | { kind: 'department'; department_id: string; strategy: RouteStrategy }
  | { kind: 'department_user'; department_id: string; user_id: string }
  | { kind: 'user'; user_id: string };
