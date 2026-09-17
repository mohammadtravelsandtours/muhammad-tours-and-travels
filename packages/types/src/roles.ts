/**
 * Canonical roles and permissions, shared by the API (which enforces them)
 * and every frontend (which uses them only to decide what to render —
 * never as the source of truth for what a user is allowed to do).
 */

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OPS_SUPPORT = 'OPS_SUPPORT',
  FINANCE = 'FINANCE',
  B2B_AGENCY_ADMIN = 'B2B_AGENCY_ADMIN',
  B2B_AGENT = 'B2B_AGENT',
  CORPORATE_APPROVER = 'CORPORATE_APPROVER',
  CORPORATE_EMPLOYEE = 'CORPORATE_EMPLOYEE',
  B2C_CUSTOMER = 'B2C_CUSTOMER',
}

/**
 * Permissions are resource:action pairs. Keep this list additive —
 * removing or renaming a value here is a breaking change against
 * every stored role_permissions row.
 */
export enum Permission {
  // Users & access
  USERS_MANAGE = 'users:manage',
  ROLES_MANAGE = 'roles:manage',

  // Search & booking (Phase 2+, declared now so RBAC doesn't need revisiting later)
  SEARCH_FLIGHTS = 'search:flights',
  BOOKING_CREATE_OWN = 'booking:create:own',
  BOOKING_READ_OWN = 'booking:read:own',
  BOOKING_READ_AGENCY = 'booking:read:agency',
  BOOKING_READ_DEPARTMENT = 'booking:read:department',
  BOOKING_READ_ANY = 'booking:read:any',
  BOOKING_APPROVE_CORPORATE = 'booking:approve:corporate',
  BOOKING_CANCEL_OWN = 'booking:cancel:own',
  BOOKING_CANCEL_ANY = 'booking:cancel:any',
  TICKET_ISSUE_OWN = 'ticket:issue:own',
  TICKET_ISSUE_AGENCY = 'ticket:issue:agency',
  TICKET_ISSUE_ANY = 'ticket:issue:any',
  REFUND_REQUEST = 'refund:request',
  REFUND_PROCESS = 'refund:process',

  // Money
  WALLET_READ_OWN = 'wallet:read:own',
  WALLET_ADJUST = 'wallet:adjust',
  PRICING_MANAGE = 'pricing:manage',

  // B2B agency lifecycle (Phase 3)
  AGENCY_MANAGE = 'agency:manage',

  // Corporate account provisioning, travel policy & cost centers (Phase 5)
  CORPORATE_MANAGE = 'corporate:manage',
  COST_CENTERS_MANAGE = 'cost-centers:manage',
  TRAVEL_POLICY_MANAGE = 'travel-policy:manage',

  // Hotels & visas (Phase 6)
  SEARCH_HOTELS = 'search:hotels',
  VISA_APPLY = 'visa:apply',
  VISA_MANAGE = 'visa:manage',

  // Platform admin
  SUPPLIERS_MANAGE = 'suppliers:manage',
  AUDIT_READ = 'audit:read',
  AUDIT_READ_FINANCIAL = 'audit:read:financial',

  // BI / analytics dashboards (Phase 8)
  ANALYTICS_READ = 'analytics:read',

  // Hajj & Umrah package catalog (extends the packages domain)
  HAJJ_UMRAH_MANAGE = 'hajj-umrah:manage',

  // Manpower job catalog & application review (Phase 13)
  MANPOWER_MANAGE = 'manpower:manage',
}

/**
 * Default permission grants per role. This seeds `role_permissions` on
 * first migration — it is a starting point, not a hard-coded runtime
 * check. Admins can grant/revoke individual permissions per role from
 * the admin panel once Phase 1's RBAC management UI exists; the guard
 * always reads current DB state, never this map, at request time.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.OPS_SUPPORT]: [
    Permission.SEARCH_FLIGHTS,
    Permission.SEARCH_HOTELS,
    Permission.BOOKING_READ_ANY,
    Permission.BOOKING_CANCEL_ANY,
    Permission.TICKET_ISSUE_ANY,
    Permission.REFUND_PROCESS,
    Permission.AGENCY_MANAGE,
    Permission.CORPORATE_MANAGE,
    Permission.COST_CENTERS_MANAGE,
    Permission.TRAVEL_POLICY_MANAGE,
    Permission.VISA_MANAGE,
    Permission.AUDIT_READ,
    Permission.ANALYTICS_READ,
    Permission.HAJJ_UMRAH_MANAGE,
    Permission.MANPOWER_MANAGE,
  ],
  [Role.FINANCE]: [
    Permission.BOOKING_READ_ANY,
    Permission.WALLET_ADJUST,
    Permission.PRICING_MANAGE,
    Permission.REFUND_PROCESS,
    Permission.AUDIT_READ,
    Permission.AUDIT_READ_FINANCIAL,
    Permission.ANALYTICS_READ,
  ],
  [Role.B2B_AGENCY_ADMIN]: [
    Permission.SEARCH_FLIGHTS,
    Permission.SEARCH_HOTELS,
    Permission.BOOKING_CREATE_OWN,
    Permission.BOOKING_READ_AGENCY,
    Permission.BOOKING_CANCEL_OWN,
    Permission.TICKET_ISSUE_AGENCY,
    Permission.WALLET_READ_OWN,
    Permission.REFUND_REQUEST,
    Permission.VISA_APPLY,
    Permission.USERS_MANAGE, // scoped to their own agency in the service layer
  ],
  [Role.B2B_AGENT]: [
    Permission.SEARCH_FLIGHTS,
    Permission.SEARCH_HOTELS,
    Permission.BOOKING_CREATE_OWN,
    Permission.BOOKING_READ_OWN,
    Permission.BOOKING_CANCEL_OWN,
    Permission.TICKET_ISSUE_OWN,
    Permission.WALLET_READ_OWN,
    Permission.REFUND_REQUEST,
    Permission.VISA_APPLY,
  ],
  [Role.CORPORATE_APPROVER]: [
    Permission.SEARCH_FLIGHTS,
    Permission.SEARCH_HOTELS,
    Permission.BOOKING_READ_DEPARTMENT,
    Permission.BOOKING_APPROVE_CORPORATE,
  ],
  [Role.CORPORATE_EMPLOYEE]: [
    Permission.SEARCH_FLIGHTS,
    Permission.SEARCH_HOTELS,
    Permission.BOOKING_CREATE_OWN,
    Permission.BOOKING_READ_OWN,
    Permission.BOOKING_CANCEL_OWN,
    Permission.VISA_APPLY,
  ],
  [Role.B2C_CUSTOMER]: [
    Permission.SEARCH_FLIGHTS,
    Permission.SEARCH_HOTELS,
    Permission.BOOKING_CREATE_OWN,
    Permission.BOOKING_READ_OWN,
    Permission.BOOKING_CANCEL_OWN,
    Permission.REFUND_REQUEST,
    Permission.VISA_APPLY,
  ],
};
