const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? 'Request failed', res.status);
  }

  return res.status === 204 ? (undefined as T) : res.json();
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; roles: string[]; permissions: string[] };
}

/** Returned by POST /auth/login instead of LoginResponse when the account has 2FA enabled — see AuthService.beginLogin. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  twoFactorToken: string;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export interface SessionRow {
  id: string;
  deviceLabel: string | null;
  issuedAt: string;
  expiresAt: string;
}

export interface AgencyWithWallet {
  id: string;
  name: string;
  status: string;
  currency: string;
  creditEnabled: boolean;
  creditLimit: number;
  wallet: { id: string; agencyId: string; currency: string; balance: number; updatedAt: string } | null;
}

export interface WalletTransactionRow {
  id: string;
  type: string;
  debit: number;
  credit: number;
  previousBalance: number;
  newBalance: number;
  currency: string;
  reference?: string;
  description?: string;
  bookingId?: string;
  createdAt: string;
}

export interface MarkupRuleRow {
  id: string;
  scope: string;
  supplierId?: string;
  supplierCode?: string;
  airlineCode?: string;
  route?: string;
  cabin?: string;
  fareFamily?: string;
  agencyId?: string;
  agencyName?: string;
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  active: boolean;
  createdAt: string;
}

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  registeredInCode: boolean;
  priority: number;
  currency: string;
  timeoutMs: number;
  rateLimitPerMinute: number;
  credentialLoginIdMasked?: string;
  credentialStatus: string;
  health: {
    status: string;
    lastSuccessAt?: string;
    lastErrorAt?: string;
    lastErrorMessage?: string;
    avgResponseMs?: number;
    consecutiveErrors: number;
  } | null;
  recentRuns?: Array<{ status: string; latencyMs: number; offerCount: number; errorMessage?: string; createdAt: string }>;
}

export interface ConvertedTotal {
  baseCurrency: string;
  amount: number;
  unconvertedCurrencies: string[];
}

export interface AnalyticsOverview {
  flightBookings: Array<{ status: string; count: number; revenue: number }>;
  hotelBookings: Array<{ status: string; count: number; revenue: number }>;
  visaApplications: Array<{ status: string; count: number }>;
  manpowerApplications: Array<{ status: string; count: number }>;
  packagesCount: number;
  hotelPropertiesCount: number;
  agencies: { active: number; pendingApproval: number; suspended: number };
  corporatesCount: number;
  /** @deprecated Mixed-currency sum — prefer walletBalanceByCurrency / walletBalanceConvertedTotal. */
  walletBalanceTotal: number;
  walletBalanceByCurrency: Record<string, number>;
  /** Present only when the API's FxRatesService is configured — null otherwise. */
  walletBalanceConvertedTotal: ConvertedTotal | null;
  grossRevenueByCurrency: Record<string, number>;
  /** Present only when the API's FxRatesService is configured — null otherwise. */
  grossRevenueConvertedTotal: ConvertedTotal | null;
}

export interface BookingsTimeseriesPoint {
  date: string;
  count: number;
  revenue: number;
}

export interface RevenueByChannelRow {
  channel: string;
  count: number;
  revenueMixedCurrency: number;
}

export interface TopRouteRow {
  route: string;
  count: number;
}

export interface SupplierHealthRow {
  supplierCode: string;
  supplierName: string;
  active: boolean;
  status: string;
  avgResponseMs: number | null;
  consecutiveErrors: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export interface AgencyMemberRow {
  id: string;
  title: string | null;
  fullName: string;
  email: string;
}

export interface AgencyAdminRow {
  id: string;
  name: string;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';
  country: string | null;
  currency: string;
  creditLimit?: number;
  creditEnabled: boolean;
  approvedAt?: string;
  createdAt: string;
  wallet?: { balance: number; currency: string };
  members: AgencyMemberRow[];
}

export interface CorporateListRow {
  id: string;
  name: string;
  createdAt: string;
  employeeCount: number;
  departmentCount: number;
  costCenterCount: number;
  hasTravelPolicy: boolean;
}

export interface DepartmentRow {
  id: string;
  corporateId: string;
  name: string;
  createdAt: string;
}

export interface CostCenterRow {
  id: string;
  corporateId: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface HajjUmrahPackageRow {
  id: string;
  title: string;
  type: 'HAJJ' | 'UMRAH';
  description: string | null;
  departureDate: string;
  returnDate: string;
  durationNights: number;
  currency: string;
  totalAmount: number;
  depositType: 'PERCENTAGE' | 'FIXED';
  depositValue: number;
  capacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  inclusions: string[];
  makkahHotel: string | null;
  madinahHotel: string | null;
  active: boolean;
  createdAt: string;
}

export interface HajjUmrahBookingRow {
  id: string;
  bookingReference: string;
  status: 'PENDING_DEPOSIT' | 'DEPOSIT_PAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'CANCELLED';
  pilgrims: number;
  leadPilgrimName: string;
  contactPhone: string;
  contactEmail: string;
  currency: string;
  totalAmount: number;
  minimumDepositAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  createdAt: string;
  package?: HajjUmrahPackageRow;
  payments: Array<{ id: string; amount: number; currency: string; status: string; createdAt: string }>;
}

export interface ManpowerJobRow {
  id: string;
  title: string;
  country: string;
  employer: string | null;
  category: string | null;
  positionsAvailable: number;
  positionsFilled: number;
  positionsRemaining: number;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  contractDurationMonths: number | null;
  requirements: string[];
  benefits: string[];
  applicationDeadline: string | null;
  active: boolean;
  createdAt: string;
}

export interface ManpowerApplicationRow {
  id: string;
  applicationReference: string;
  jobId: string;
  job?: ManpowerJobRow;
  applicantFullName: string;
  applicantPassportNumber: string | null;
  applicantNationality: string;
  dateOfBirth: string | null;
  yearsOfExperience: number | null;
  currentOccupation: string | null;
  coverNote: string | null;
  contactEmail: string;
  contactPhone: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'INTERVIEW_SCHEDULED' | 'SELECTED' | 'VISA_PROCESSING' | 'DEPLOYED' | 'REJECTED' | 'WITHDRAWN';
  reviewerNote: string | null;
  createdAt: string;
  statusHistory: Array<{ fromStatus: string | null; toStatus: string; note?: string; createdAt: string }>;
}

/** A department's override of its corporate's TravelPolicy — same field shape, see DepartmentTravelPolicy in schema.prisma. Absent (null) means the department just uses its corporate's policy. */
export interface DepartmentTravelPolicyRow {
  id: string;
  departmentId: string;
  name: string;
  maxCabin: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  blockOverMaxCabin: boolean;
  softFareCapAmount: string | null;
  hardFareCapAmount: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelPolicyRow {
  id: string;
  corporateId: string;
  name: string;
  maxCabin: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  blockOverMaxCabin: boolean;
  // Prisma Decimal fields serialize to strings over JSON, not numbers (see wallet.controller.ts's
  // explicit Number() conversions elsewhere — TravelPolicyService returns the raw Prisma row without one).
  softFareCapAmount: string | null;
  hardFareCapAmount: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeRow {
  id: string;
  userId: string;
  corporateId: string;
  departmentId: string | null;
  costCenterId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  user: { fullName: string; email: string; isActive: boolean };
  department: DepartmentRow | null;
  costCenter: CostCenterRow | null;
}

export interface CorporateDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  departments: DepartmentRow[];
  costCenters: CostCenterRow[];
  travelPolicy: TravelPolicyRow | null;
  employees: EmployeeRow[];
}

export interface CorporatePolicyStats {
  byStatus: Array<{ status: string; count: number }>;
  total: number;
  autoApprovedByPolicy: number;
  decidedByHuman: number;
}

export interface AuditEntryRow {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  createdAt: string;
  user?: { id: string; email: string; fullName: string } | null;
}

export interface PermissionRow {
  id: string;
  name: string;
  description?: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description?: string;
  permissions: Array<{ permission: PermissionRow }>;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: Array<{ role: { id: string; name: string } }>;
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export const apiClient = {
  login: (email: string, password: string) =>
    request<LoginResponse | TwoFactorChallenge>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  verifyTwoFactor: (twoFactorToken: string, code: string) =>
    request<LoginResponse>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ twoFactorToken, code }) }),
  me: (accessToken: string) =>
    request<LoginResponse['user']>('/users/me', {
      headers: authHeaders(accessToken),
    }),

  requestPasswordReset: (email: string) =>
    request<void>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<void>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),

  enableTwoFactor: (accessToken: string) =>
    request<TwoFactorSetup>('/auth/2fa/enable', { method: 'POST', headers: authHeaders(accessToken) }),
  confirmTwoFactor: (accessToken: string, code: string) =>
    request<void>('/auth/2fa/confirm', { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ code }) }),
  disableTwoFactor: (accessToken: string, password: string) =>
    request<void>('/auth/2fa/disable', { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ password }) }),

  listSessions: (accessToken: string) =>
    request<{ sessions: SessionRow[] }>('/auth/sessions', { headers: authHeaders(accessToken) }),
  revokeSession: (accessToken: string, id: string) =>
    request<void>(`/auth/sessions/${id}`, { method: 'DELETE', headers: authHeaders(accessToken) }),

  listAgencyWallets: (accessToken: string) =>
    request<{ agencies: AgencyWithWallet[] }>('/admin/wallets', { headers: authHeaders(accessToken) }),
  listAgencyTransactions: (accessToken: string, agencyId: string) =>
    request<{ transactions: WalletTransactionRow[] }>(`/admin/wallets/${agencyId}/transactions`, { headers: authHeaders(accessToken) }),
  adjustWallet: (
    accessToken: string,
    agencyId: string,
    input: { type: 'DEPOSIT' | 'ADJUSTMENT_CREDIT' | 'ADJUSTMENT_DEBIT'; amount: number; description?: string },
    idempotencyKey: string,
  ) =>
    request<WalletTransactionRow | { error: string; available: number; requested: number; currency: string; message: string }>(
      `/admin/wallets/${agencyId}/adjust`,
      { method: 'POST', body: JSON.stringify(input), headers: { ...authHeaders(accessToken), 'Idempotency-Key': idempotencyKey } },
    ),

  listMarkupRules: (accessToken: string) => request<{ rules: MarkupRuleRow[] }>('/admin/pricing/markup-rules', { headers: authHeaders(accessToken) }),
  createMarkupRule: (accessToken: string, input: Record<string, unknown>) =>
    request<MarkupRuleRow>('/admin/pricing/markup-rules', { method: 'POST', body: JSON.stringify(input), headers: authHeaders(accessToken) }),
  updateMarkupRule: (accessToken: string, id: string, input: Record<string, unknown>) =>
    request<MarkupRuleRow>(`/admin/pricing/markup-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input), headers: authHeaders(accessToken) }),

  listSuppliers: (accessToken: string) => request<{ suppliers: SupplierRow[] }>('/admin/suppliers', { headers: authHeaders(accessToken) }),
  updateSupplier: (accessToken: string, id: string, input: { active?: boolean; priority?: number; timeoutMs?: number }) =>
    request<SupplierRow>(`/admin/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(input), headers: authHeaders(accessToken) }),

  listAuditLog: (
    accessToken: string,
    params: { resource?: string; action?: string; userId?: string; cursor?: string; take?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params.resource) qs.set('resource', params.resource);
    if (params.action) qs.set('action', params.action);
    if (params.userId) qs.set('userId', params.userId);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.take) qs.set('take', String(params.take));
    const query = qs.toString();
    return request<{ entries: AuditEntryRow[]; nextCursor: string | null }>(
      `/admin/audit${query ? `?${query}` : ''}`,
      { headers: authHeaders(accessToken) },
    );
  },

  listRoles: (accessToken: string) => request<RoleRow[]>('/admin/rbac/roles', { headers: authHeaders(accessToken) }),
  listPermissions: (accessToken: string) => request<PermissionRow[]>('/admin/rbac/permissions', { headers: authHeaders(accessToken) }),
  grantPermission: (accessToken: string, roleId: string, permissionId: string) =>
    request(`/admin/rbac/roles/${roleId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionId }),
      headers: authHeaders(accessToken),
    }),
  revokePermission: (accessToken: string, roleId: string, permissionId: string) =>
    request(`/admin/rbac/roles/${roleId}/permissions/${permissionId}`, { method: 'DELETE', headers: authHeaders(accessToken) }),

  searchUsers: (accessToken: string, search?: string) =>
    request<{ users: AdminUserRow[] }>(`/admin/rbac/users${search ? `?search=${encodeURIComponent(search)}` : ''}`, {
      headers: authHeaders(accessToken),
    }),
  assignUserRole: (accessToken: string, userId: string, roleName: string) =>
    request(`/admin/rbac/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleName }),
      headers: authHeaders(accessToken),
    }),
  revokeUserRole: (accessToken: string, userId: string, roleName: string) =>
    request(`/admin/rbac/users/${userId}/roles/${encodeURIComponent(roleName)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }),

  getAnalyticsOverview: (accessToken: string) => request<AnalyticsOverview>('/admin/analytics/overview', { headers: authHeaders(accessToken) }),
  getBookingsTimeseries: (accessToken: string, days = 30) =>
    request<BookingsTimeseriesPoint[]>(`/admin/analytics/bookings-timeseries?days=${days}`, { headers: authHeaders(accessToken) }),
  getRevenueByChannel: (accessToken: string) => request<RevenueByChannelRow[]>('/admin/analytics/revenue-by-channel', { headers: authHeaders(accessToken) }),
  getTopRoutes: (accessToken: string, limit = 10) => request<TopRouteRow[]>(`/admin/analytics/top-routes?limit=${limit}`, { headers: authHeaders(accessToken) }),
  getSupplierHealthAnalytics: (accessToken: string) => request<SupplierHealthRow[]>('/admin/analytics/supplier-health', { headers: authHeaders(accessToken) }),
  getCorporatePolicyStats: (accessToken: string) => request<CorporatePolicyStats>('/admin/analytics/corporate-policy', { headers: authHeaders(accessToken) }),

  listAgencies: (accessToken: string, status?: string) =>
    request<{ agencies: AgencyAdminRow[] }>(`/admin/agencies${status ? `?status=${encodeURIComponent(status)}` : ''}`, {
      headers: authHeaders(accessToken),
    }),
  getAgency: (accessToken: string, id: string) => request<AgencyAdminRow>(`/admin/agencies/${id}`, { headers: authHeaders(accessToken) }),
  updateAgencyStatus: (accessToken: string, id: string, input: { status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED'; reason?: string }) =>
    request<AgencyAdminRow>(`/admin/agencies/${id}/status`, { method: 'PATCH', body: JSON.stringify(input), headers: authHeaders(accessToken) }),

  listCorporates: (accessToken: string) => request<{ corporates: CorporateListRow[] }>('/admin/corporates', { headers: authHeaders(accessToken) }),
  getCorporate: (accessToken: string, id: string) => request<CorporateDetail>(`/admin/corporates/${id}`, { headers: authHeaders(accessToken) }),
  createCorporate: (accessToken: string, input: { name: string }) =>
    request<{ id: string; name: string; createdAt: string; updatedAt: string }>('/admin/corporates', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),
  createDepartment: (accessToken: string, corporateId: string, input: { name: string }) =>
    request<DepartmentRow>(`/admin/corporates/${corporateId}/departments`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),
  createEmployee: (
    accessToken: string,
    corporateId: string,
    input: {
      email: string;
      fullName: string;
      password: string;
      role: 'CORPORATE_EMPLOYEE' | 'CORPORATE_APPROVER';
      departmentId?: string;
      costCenterId?: string;
      title?: string;
    },
  ) =>
    request<{ id: string; fullName: string; email: string; title: string | null }>(`/admin/corporates/${corporateId}/employees`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),

  getTravelPolicy: (accessToken: string, corporateId: string) =>
    request<TravelPolicyRow | null>(`/admin/corporates/${corporateId}/policy`, { headers: authHeaders(accessToken) }),
  upsertTravelPolicy: (
    accessToken: string,
    corporateId: string,
    input: {
      name?: string;
      maxCabin: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
      blockOverMaxCabin: boolean;
      softFareCapAmount?: number;
      hardFareCapAmount?: number;
      currency: string;
    },
  ) =>
    request<TravelPolicyRow>(`/admin/corporates/${corporateId}/policy`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),

  getDepartmentPolicy: (accessToken: string, corporateId: string, departmentId: string) =>
    request<DepartmentTravelPolicyRow | null>(`/admin/corporates/${corporateId}/departments/${departmentId}/policy`, { headers: authHeaders(accessToken) }),
  upsertDepartmentPolicy: (
    accessToken: string,
    corporateId: string,
    departmentId: string,
    input: {
      name?: string;
      maxCabin: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
      blockOverMaxCabin: boolean;
      softFareCapAmount?: number;
      hardFareCapAmount?: number;
      currency: string;
    },
  ) =>
    request<DepartmentTravelPolicyRow>(`/admin/corporates/${corporateId}/departments/${departmentId}/policy`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),
  deleteDepartmentPolicy: (accessToken: string, corporateId: string, departmentId: string) =>
    request<{ deleted: boolean }>(`/admin/corporates/${corporateId}/departments/${departmentId}/policy`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    }),

  listCostCenters: (accessToken: string, corporateId: string) =>
    request<{ costCenters: CostCenterRow[] }>(`/admin/corporates/${corporateId}/cost-centers`, { headers: authHeaders(accessToken) }),
  createCostCenter: (accessToken: string, corporateId: string, input: { code: string; name: string }) =>
    request<CostCenterRow>(`/admin/corporates/${corporateId}/cost-centers`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),
  updateCostCenter: (accessToken: string, corporateId: string, id: string, input: { name?: string; active?: boolean }) =>
    request<CostCenterRow>(`/admin/corporates/${corporateId}/cost-centers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: authHeaders(accessToken),
    }),

  // ── Hajj & Umrah ────────────────────────────────────────────────────
  listHajjUmrahPackagesAdmin: (accessToken: string) =>
    request<{ packages: HajjUmrahPackageRow[] }>('/admin/hajj-umrah/packages', { headers: authHeaders(accessToken) }),
  createHajjUmrahPackage: (accessToken: string, input: Record<string, unknown>) =>
    request<HajjUmrahPackageRow>('/admin/hajj-umrah/packages', { method: 'POST', body: JSON.stringify(input), headers: authHeaders(accessToken) }),
  updateHajjUmrahPackage: (accessToken: string, id: string, input: Record<string, unknown>) =>
    request<HajjUmrahPackageRow>(`/admin/hajj-umrah/packages/${id}`, { method: 'PATCH', body: JSON.stringify(input), headers: authHeaders(accessToken) }),
  listHajjUmrahBookingsAdmin: (accessToken: string, packageId?: string) =>
    request<{ bookings: HajjUmrahBookingRow[] }>(`/admin/hajj-umrah/bookings${packageId ? `?packageId=${packageId}` : ''}`, { headers: authHeaders(accessToken) }),
  listManpowerJobsAdmin: (accessToken: string) =>
    request<{ jobs: ManpowerJobRow[] }>('/admin/manpower/jobs', { headers: authHeaders(accessToken) }),
  createManpowerJob: (accessToken: string, input: Record<string, unknown>) =>
    request<ManpowerJobRow>('/admin/manpower/jobs', { method: 'POST', body: JSON.stringify(input), headers: authHeaders(accessToken) }),
  updateManpowerJob: (accessToken: string, id: string, input: Record<string, unknown>) =>
    request<ManpowerJobRow>(`/admin/manpower/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(input), headers: authHeaders(accessToken) }),
  listManpowerApplicationsAdmin: (accessToken: string, filter?: { status?: string; jobId?: string }) => {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.jobId) params.set('jobId', filter.jobId);
    const qs = params.toString();
    return request<{ applications: ManpowerApplicationRow[] }>(`/admin/manpower/applications${qs ? `?${qs}` : ''}`, { headers: authHeaders(accessToken) });
  },
  updateManpowerApplicationStatus: (accessToken: string, id: string, input: { toStatus: string; note?: string }) =>
    request<ManpowerApplicationRow>(`/admin/manpower/applications/${id}/status`, { method: 'POST', body: JSON.stringify(input), headers: authHeaders(accessToken) }),
};

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
