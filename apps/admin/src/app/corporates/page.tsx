'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import {
  apiClient,
  ApiError,
  CorporateListRow,
  CorporateDetail as CorporateDetailShape,
  DepartmentRow,
  DepartmentTravelPolicyRow,
  CostCenterRow,
  EmployeeRow,
} from '@/lib/api-client';

const CABINS = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
const EMPLOYEE_ROLES = ['CORPORATE_EMPLOYEE', 'CORPORATE_APPROVER'] as const;

export default function CorporatesPage() {
  const { accessToken } = useAuth();
  const [corporates, setCorporates] = useState<CorporateListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    apiClient
      .listCorporates(accessToken)
      .then((r) => setCorporates(r.corporates))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load corporate accounts.'));
  }

  useEffect(load, [accessToken]);

  async function createCorporate() {
    if (!accessToken) return;
    if (!name.trim()) {
      setCreateError('Enter a company name.');
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const created = await apiClient.createCorporate(accessToken, { name: name.trim() });
      setName('');
      load();
      setSelectedId(created.id);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create this corporate account.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Corporate accounts</h2>
      <p className="text-sm text-paper-500 mb-6">
        Corporate accounts are admin-provisioned — there is no public self-signup path for CORPORATE_EMPLOYEE /
        CORPORATE_APPROVER users. Create the account, then add departments, employees, cost centers, and a travel
        policy from its detail panel below.
      </p>

      <div className="border border-ink-700 rounded-lg p-5 bg-ink-900 mb-6">
        <p className="text-xs text-paper-500 mb-2">New corporate account</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <button
            onClick={createCorporate}
            disabled={creating}
            className="rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        {createError && <p className="mt-2 text-xs text-danger">{createError}</p>}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !corporates && <p className="text-sm text-paper-500">Loading…</p>}

      {corporates && (
        <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
          {corporates.length === 0 && <p className="px-4 py-3 text-sm text-paper-500">No corporate accounts yet.</p>}
          {corporates.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-800"
            >
              <div>
                <p className="text-paper-100">{c.name}</p>
                <p className="text-xs text-paper-500">
                  {c.employeeCount} employee{c.employeeCount === 1 ? '' : 's'} · {c.departmentCount} department
                  {c.departmentCount === 1 ? '' : 's'} · {c.costCenterCount} cost center{c.costCenterCount === 1 ? '' : 's'}
                </p>
              </div>
              <span className={`text-xs font-mono rounded-full px-2.5 py-1 ${c.hasTravelPolicy ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-paper-500'}`}>
                {c.hasTravelPolicy ? 'POLICY SET' : 'NO POLICY'}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedId && (
        <CorporateDetailPanel
          corporateId={selectedId}
          accessToken={accessToken!}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </AdminShell>
  );
}

function CorporateDetailPanel({
  corporateId,
  accessToken,
  onClose,
  onChanged,
}: {
  corporateId: string;
  accessToken: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [corporate, setCorporate] = useState<CorporateDetailShape | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiClient
      .getCorporate(accessToken, corporateId)
      .then(setCorporate)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this corporate account.'));
  }

  useEffect(load, [accessToken, corporateId]);

  function refresh() {
    load();
    onChanged();
  }

  return (
    <div className="mt-6 border border-ink-700 rounded-lg p-5 bg-ink-900">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-paper-100 font-medium">{corporate?.name ?? 'Loading…'}</h3>
        <button onClick={onClose} className="text-sm text-paper-500 hover:text-paper-100">Close</button>
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {!error && !corporate && <p className="text-sm text-paper-500">Loading…</p>}

      {corporate && (
        <div className="space-y-8">
          <DepartmentsSection corporateId={corporateId} accessToken={accessToken} departments={corporate.departments} onChanged={refresh} />
          <CostCentersSection corporateId={corporateId} accessToken={accessToken} costCenters={corporate.costCenters} onChanged={refresh} />
          <EmployeesSection
            corporateId={corporateId}
            accessToken={accessToken}
            employees={corporate.employees}
            departments={corporate.departments}
            costCenters={corporate.costCenters}
            onChanged={refresh}
          />
          <TravelPolicySection corporateId={corporateId} accessToken={accessToken} policy={corporate.travelPolicy} onChanged={refresh} />
        </div>
      )}
    </div>
  );
}

function DepartmentsSection({
  corporateId,
  accessToken,
  departments,
  onChanged,
}: {
  corporateId: string;
  accessToken: string;
  departments: DepartmentRow[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) {
      setFormError('Enter a department name.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.createDepartment(accessToken, corporateId, { name: name.trim() });
      setName('');
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create this department.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h4 className="text-sm font-medium text-paper-300 mb-2">Departments</h4>
      <div className="border border-ink-700 rounded-lg divide-y divide-ink-800 mb-3">
        {departments.length === 0 && <p className="px-3 py-2 text-xs text-paper-500">No departments yet.</p>}
        {departments.map((d) => (
          <div key={d.id}>
            <button
              onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-ink-800"
            >
              <span className="text-sm text-paper-100">{d.name}</span>
              <span className="text-xs text-paper-500">{expandedId === d.id ? 'Hide policy override ▲' : 'Policy override ▼'}</span>
            </button>
            {expandedId === d.id && (
              <div className="px-3 pb-3">
                <DepartmentPolicyEditor corporateId={corporateId} accessToken={accessToken} departmentId={d.id} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Department name"
          className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
        />
        <button
          onClick={create}
          disabled={submitting}
          className="rounded-md bg-signal/20 text-signal font-medium px-3 py-2 text-sm hover:bg-signal/30 disabled:opacity-60"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>
      {formError && <p className="mt-2 text-xs text-danger">{formError}</p>}
    </section>
  );
}

/**
 * Fetched lazily on expand (rather than bundled into GET
 * /admin/corporates/:id) — most departments will never have an
 * override, so there's no reason to join it into every corporate detail
 * load. Falls back to the corporate's own default policy whenever no
 * override is set (see TravelPolicyService.resolvePolicy) — this editor
 * only ever writes/reads the OVERRIDE, never the corporate default
 * itself (that's TravelPolicySection, below).
 */
function DepartmentPolicyEditor({
  corporateId,
  accessToken,
  departmentId,
}: {
  corporateId: string;
  accessToken: string;
  departmentId: string;
}) {
  const [policy, setPolicy] = useState<DepartmentTravelPolicyRow | null | undefined>(undefined); // undefined = still loading
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('Department policy');
  const [maxCabin, setMaxCabin] = useState<(typeof CABINS)[number]>('BUSINESS');
  const [blockOverMaxCabin, setBlockOverMaxCabin] = useState(true);
  const [softFareCapAmount, setSoftFareCapAmount] = useState('');
  const [hardFareCapAmount, setHardFareCapAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function applyToForm(p: DepartmentTravelPolicyRow | null) {
    setName(p?.name ?? 'Department policy');
    setMaxCabin(p?.maxCabin ?? 'BUSINESS');
    setBlockOverMaxCabin(p?.blockOverMaxCabin ?? true);
    setSoftFareCapAmount(p?.softFareCapAmount ?? '');
    setHardFareCapAmount(p?.hardFareCapAmount ?? '');
    setCurrency(p?.currency ?? 'USD');
  }

  useEffect(() => {
    apiClient
      .getDepartmentPolicy(accessToken, corporateId, departmentId)
      .then((p) => {
        setPolicy(p);
        applyToForm(p);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load this department\'s policy.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, corporateId, departmentId]);

  async function save() {
    if (!currency.trim() || currency.trim().length !== 3) {
      setFormError('Currency must be a 3-letter code (e.g. USD).');
      return;
    }
    const soft = softFareCapAmount === '' ? undefined : Number(softFareCapAmount);
    const hard = hardFareCapAmount === '' ? undefined : Number(hardFareCapAmount);
    if (soft !== undefined && !Number.isFinite(soft)) {
      setFormError('Soft fare cap must be a number.');
      return;
    }
    if (hard !== undefined && !Number.isFinite(hard)) {
      setFormError('Hard fare cap must be a number.');
      return;
    }
    if (soft !== undefined && hard !== undefined && hard < soft) {
      setFormError('Hard fare cap must be greater than or equal to the soft fare cap.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const saved = await apiClient.upsertDepartmentPolicy(accessToken, corporateId, departmentId, {
        name: name.trim() || undefined,
        maxCabin,
        blockOverMaxCabin,
        softFareCapAmount: soft,
        hardFareCapAmount: hard,
        currency: currency.trim().toUpperCase(),
      });
      setPolicy(saved);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this department policy override.');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeOverride() {
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.deleteDepartmentPolicy(accessToken, corporateId, departmentId);
      setPolicy(null);
      applyToForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not remove this override.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="text-xs text-danger">{loadError}</p>;
  if (policy === undefined) return <p className="text-xs text-paper-500">Loading…</p>;

  return (
    <div className="border border-ink-700 rounded-md p-3 bg-ink-950">
      <p className="text-xs text-paper-500 mb-3">
        {policy
          ? 'This department overrides its company\'s default travel policy with the rules below.'
          : "No override — this department currently follows its company's default travel policy."}
      </p>
      <div className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Override name"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <select value={maxCabin} onChange={(e) => setMaxCabin(e.target.value as typeof maxCabin)} className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100">
            {CABINS.map((c) => (
              <option key={c} value={c}>Max cabin: {c}</option>
            ))}
          </select>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            value={softFareCapAmount}
            onChange={(e) => setSoftFareCapAmount(e.target.value)}
            placeholder="Soft fare cap (optional)"
            inputMode="decimal"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <input
            value={hardFareCapAmount}
            onChange={(e) => setHardFareCapAmount(e.target.value)}
            placeholder="Hard fare cap (optional)"
            inputMode="decimal"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="Currency (e.g. USD)"
            maxLength={3}
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-paper-300">
          <input type="checkbox" checked={blockOverMaxCabin} onChange={(e) => setBlockOverMaxCabin(e.target.checked)} className="accent-signal" />
          Block bookings above the max cabin outright (otherwise they're flagged for approval instead)
        </label>
        {formError && <p className="text-xs text-danger">{formError}</p>}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={submitting}
            className="rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60"
          >
            {submitting ? 'Saving…' : policy ? 'Update override' : 'Create override'}
          </button>
          {policy && (
            <button
              onClick={removeOverride}
              disabled={submitting}
              className="rounded-md border border-ink-700 text-paper-300 font-medium px-4 py-2 text-sm hover:bg-ink-800 disabled:opacity-60"
            >
              Remove override (revert to company default)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CostCentersSection({
  corporateId,
  accessToken,
  costCenters,
  onChanged,
}: {
  corporateId: string;
  accessToken: string;
  costCenters: CostCenterRow[];
  onChanged: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function create() {
    if (!code.trim() || !name.trim()) {
      setFormError('Enter both a code and a name.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.createCostCenter(accessToken, corporateId, { code: code.trim(), name: name.trim() });
      setCode('');
      setName('');
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create this cost center.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(cc: CostCenterRow) {
    setBusyId(cc.id);
    try {
      await apiClient.updateCostCenter(accessToken, corporateId, cc.id, { active: !cc.active });
      onChanged();
    } catch {
      setFormError('Could not update that cost center.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h4 className="text-sm font-medium text-paper-300 mb-2">Cost centers</h4>
      <div className="border border-ink-700 rounded-lg divide-y divide-ink-800 mb-3">
        {costCenters.length === 0 && <p className="px-3 py-2 text-xs text-paper-500">No cost centers yet.</p>}
        {costCenters.map((cc) => (
          <div key={cc.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-paper-100 font-mono">{cc.code}</span>
            <span className="text-sm text-paper-300 flex-1 px-3">{cc.name}</span>
            <button
              onClick={() => toggleActive(cc)}
              disabled={busyId === cc.id}
              className={`text-xs font-mono rounded-full px-3 py-1 disabled:opacity-60 ${cc.active ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-paper-500'}`}
            >
              {cc.active ? 'ACTIVE' : 'INACTIVE'}
            </button>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-[120px_1fr_auto] gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code"
          className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
        />
        <button
          onClick={create}
          disabled={submitting}
          className="rounded-md bg-signal/20 text-signal font-medium px-3 py-2 text-sm hover:bg-signal/30 disabled:opacity-60"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>
      {formError && <p className="mt-2 text-xs text-danger">{formError}</p>}
    </section>
  );
}

function EmployeesSection({
  corporateId,
  accessToken,
  employees,
  departments,
  costCenters,
  onChanged,
}: {
  corporateId: string;
  accessToken: string;
  employees: EmployeeRow[];
  departments: DepartmentRow[];
  costCenters: CostCenterRow[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof EMPLOYEE_ROLES)[number]>('CORPORATE_EMPLOYEE');
  const [departmentId, setDepartmentId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function create() {
    if (!email.trim() || !fullName.trim() || password.length < 8) {
      setFormError('Enter an email, a full name, and a password of at least 8 characters.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.createEmployee(accessToken, corporateId, {
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        role,
        departmentId: departmentId || undefined,
        costCenterId: costCenterId || undefined,
        title: title.trim() || undefined,
      });
      setEmail('');
      setFullName('');
      setPassword('');
      setTitle('');
      setDepartmentId('');
      setCostCenterId('');
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create this employee.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h4 className="text-sm font-medium text-paper-300 mb-2">Employees</h4>
      <div className="border border-ink-700 rounded-lg divide-y divide-ink-800 mb-3">
        {employees.length === 0 && <p className="px-3 py-2 text-xs text-paper-500">No employees yet.</p>}
        {employees.map((e) => (
          <div key={e.id} className="px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-paper-100">{e.user.fullName}{e.title ? ` — ${e.title}` : ''}</p>
              {!e.user.isActive && <span className="text-xs font-mono rounded-full px-2 py-0.5 bg-ink-700 text-paper-500">INACTIVE</span>}
            </div>
            <p className="text-xs text-paper-500">
              {e.user.email}
              {e.department ? ` · ${e.department.name}` : ''}
              {e.costCenter ? ` · ${e.costCenter.code}` : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password (min 8 chars)"
            type="password"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100">
            {EMPLOYEE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100">
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100">
            <option value="">No cost center</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
            ))}
          </select>
        </div>
        {formError && <p className="text-xs text-danger">{formError}</p>}
        <button
          onClick={create}
          disabled={submitting}
          className="rounded-md bg-signal/20 text-signal font-medium px-3 py-2 text-sm hover:bg-signal/30 disabled:opacity-60"
        >
          {submitting ? 'Adding…' : 'Add employee'}
        </button>
      </div>
    </section>
  );
}

function TravelPolicySection({
  corporateId,
  accessToken,
  policy,
  onChanged,
}: {
  corporateId: string;
  accessToken: string;
  policy: CorporateDetailShape['travelPolicy'];
  onChanged: () => void;
}) {
  const [name, setName] = useState(policy?.name ?? 'Standard policy');
  const [maxCabin, setMaxCabin] = useState<(typeof CABINS)[number]>(policy?.maxCabin ?? 'BUSINESS');
  const [blockOverMaxCabin, setBlockOverMaxCabin] = useState(policy?.blockOverMaxCabin ?? true);
  const [softFareCapAmount, setSoftFareCapAmount] = useState(policy?.softFareCapAmount ?? '');
  const [hardFareCapAmount, setHardFareCapAmount] = useState(policy?.hardFareCapAmount ?? '');
  const [currency, setCurrency] = useState(policy?.currency ?? 'USD');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function save() {
    if (!currency.trim() || currency.trim().length !== 3) {
      setFormError('Currency must be a 3-letter code (e.g. USD).');
      return;
    }
    const soft = softFareCapAmount === '' ? undefined : Number(softFareCapAmount);
    const hard = hardFareCapAmount === '' ? undefined : Number(hardFareCapAmount);
    if (soft !== undefined && !Number.isFinite(soft)) {
      setFormError('Soft fare cap must be a number.');
      return;
    }
    if (hard !== undefined && !Number.isFinite(hard)) {
      setFormError('Hard fare cap must be a number.');
      return;
    }
    if (soft !== undefined && hard !== undefined && hard < soft) {
      setFormError('Hard fare cap must be greater than or equal to the soft fare cap.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.upsertTravelPolicy(accessToken, corporateId, {
        name: name.trim() || undefined,
        maxCabin,
        blockOverMaxCabin,
        softFareCapAmount: soft,
        hardFareCapAmount: hard,
        currency: currency.trim().toUpperCase(),
      });
      onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this travel policy.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h4 className="text-sm font-medium text-paper-300 mb-2">Travel policy</h4>
      <p className="text-xs text-paper-500 mb-3">
        {policy
          ? 'A policy is configured — bookings above the cabin/fare limits below are blocked or flagged for approval per the rules.'
          : 'No policy configured yet — every CORPORATE booking currently requires manual approval by default.'}
      </p>

      <div className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Policy name"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <select value={maxCabin} onChange={(e) => setMaxCabin(e.target.value as typeof maxCabin)} className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100">
            {CABINS.map((c) => (
              <option key={c} value={c}>Max cabin: {c}</option>
            ))}
          </select>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            value={softFareCapAmount}
            onChange={(e) => setSoftFareCapAmount(e.target.value)}
            placeholder="Soft fare cap (optional)"
            inputMode="decimal"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <input
            value={hardFareCapAmount}
            onChange={(e) => setHardFareCapAmount(e.target.value)}
            placeholder="Hard fare cap (optional)"
            inputMode="decimal"
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="Currency (e.g. USD)"
            maxLength={3}
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-paper-300">
          <input
            type="checkbox"
            checked={blockOverMaxCabin}
            onChange={(e) => setBlockOverMaxCabin(e.target.checked)}
            className="accent-signal"
          />
          Block bookings above the max cabin outright (otherwise they're flagged for approval instead)
        </label>
        {formError && <p className="text-xs text-danger">{formError}</p>}
        <button
          onClick={save}
          disabled={submitting}
          className="rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60"
        >
          {submitting ? 'Saving…' : policy ? 'Update policy' : 'Create policy'}
        </button>
      </div>
    </section>
  );
}
