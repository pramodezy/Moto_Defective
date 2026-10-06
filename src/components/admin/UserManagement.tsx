import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Key, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  Warehouse, 
  Store, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  X,
  Lock,
  Building2,
  AlertCircle
} from 'lucide-react';
import { UserProfile, UserRole, CCIMaster } from '../../types/crm';
import { 
  fetchAllUsers, 
  createNewUser, 
  resetUserPassword, 
  toggleUserStatus 
} from '../../services/userService';
import { toast } from 'sonner';

interface UserManagementProps {
  currentUser: UserProfile;
  stations: CCIMaster[];
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, stations }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetPwUser, setResetPwUser] = useState<UserProfile | null>(null);
  const [statusConfirmUser, setStatusConfirmUser] = useState<UserProfile | null>(null);

  // Form states - Create User
  const [createUsername, setCreateUsername] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('CCI');
  const [createStationCode, setCreateStationCode] = useState('');
  const [createPassword, setCreatePassword] = useState('Moto@123');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Form states - Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Load users
  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch {
      toast.error('Failed to load user profiles.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && u.is_active === false) return false;
      if (statusFilter === 'INACTIVE' && u.is_active !== false) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (u.full_name || '').toLowerCase().includes(q);
        const matchUser = (u.username || '').toLowerCase().includes(q);
        const matchStation = (u.station_code || '').toLowerCase().includes(q);
        const stObj = stations.find((s) => s.station_code === u.station_code);
        const matchStName = (stObj?.station_name || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchStation && !matchStName) {
          return false;
        }
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchTerm, stations]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter, pageSize]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active !== false).length;
    const inactive = users.filter((u) => u.is_active === false).length;
    const admins = users.filter((u) => u.role === 'ADMIN').length;
    const cwh = users.filter((u) => u.role === 'CWH').length;
    const cci = users.filter((u) => u.role === 'CCI').length;
    return { total, active, inactive, admins, cwh, cci };
  }, [users]);

  // Helper to generate password
  const generateRandomPassword = () => {
    const randNum = Math.floor(1000 + Math.random() * 9000);
    return `Moto@${randNum}`;
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setCreateUsername('');
    setCreateFullName('');
    setCreateRole('CCI');
    setCreateStationCode(stations[0]?.station_code || '');
    setCreatePassword(generateRandomPassword());
    setShowCreateModal(true);
  };

  // Submit Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim()) {
      toast.error('Username is required.');
      return;
    }
    if (!createFullName.trim()) {
      toast.error('Full Name is required.');
      return;
    }
    if (createRole === 'CCI' && !createStationCode) {
      toast.error('Please assign a CCI station.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const res = await createNewUser({
        username: createUsername,
        full_name: createFullName,
        role: createRole,
        station_code: createRole === 'CCI' ? createStationCode : undefined,
        password: createPassword,
      });

      if (res.success && res.user) {
        toast.success(`User ${res.user.username} created successfully!`);
        setShowCreateModal(false);
        await loadUsers();
      } else {
        toast.error(res.error || 'Failed to create user.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating user.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Submit Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwUser) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setIsSubmittingReset(true);
    try {
      const res = await resetUserPassword(resetPwUser.username, newPassword);
      if (res.success) {
        toast.success(res.message || `Password reset successfully for ${resetPwUser.username}!`);
        setResetPwUser(null);
        setNewPassword('');
      } else {
        toast.error(res.error || 'Password reset failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Submit Toggle Status
  const handleConfirmToggleStatus = async () => {
    if (!statusConfirmUser) return;
    const newStatus = statusConfirmUser.is_active === false;

    try {
      const res = await toggleUserStatus(statusConfirmUser.username, newStatus);
      if (res.success) {
        toast.success(
          `User ${statusConfirmUser.username} ${newStatus ? 'activated' : 'deactivated'} successfully.`
        );
        setStatusConfirmUser(null);
        await loadUsers();
      } else {
        toast.error(res.error || 'Failed to update user status.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status.');
    }
  };

  // Role Badge Helper
  const renderRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Shield className="w-3 h-3 text-purple-600" />
            Company Admin
          </span>
        );
      case 'CWH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Warehouse className="w-3 h-3 text-amber-600" />
            CWH Hub Staff
          </span>
        );
      case 'CCI':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Store className="w-3 h-3 text-blue-600" />
            CCI Agent
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-[#001489] rounded-xl border border-blue-100">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 font-['Outfit']">
                  System User Management
                  <span className="text-xs font-normal font-sans px-2.5 py-0.5 rounded-full bg-blue-50 text-[#001489] border border-blue-200/60 font-semibold">
                    Admin Console
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage Motorola CRM enterprise users, CWH warehouse staff, and authorized CCI service center logins.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={loadUsers}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#001489] hover:bg-[#08209e] rounded-xl shadow-md shadow-blue-900/15 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Create New User
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-200/60">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Users</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-200/50">
            <div className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Active</div>
            <div className="text-lg font-bold text-emerald-700 mt-0.5">{stats.active}</div>
          </div>
          <div className="bg-red-50/50 rounded-xl p-3 border border-red-200/50">
            <div className="text-[11px] font-medium text-red-700 uppercase tracking-wider">Inactive</div>
            <div className="text-lg font-bold text-red-700 mt-0.5">{stats.inactive}</div>
          </div>
          <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-200/50">
            <div className="text-[11px] font-medium text-purple-700 uppercase tracking-wider">Admins</div>
            <div className="text-lg font-bold text-purple-700 mt-0.5">{stats.admins}</div>
          </div>
          <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-200/50">
            <div className="text-[11px] font-medium text-amber-800 uppercase tracking-wider">CWH Staff</div>
            <div className="text-lg font-bold text-amber-800 mt-0.5">{stats.cwh}</div>
          </div>
          <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-200/50">
            <div className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">CCI Agents</div>
            <div className="text-lg font-bold text-blue-700 mt-0.5">{stats.cci}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by full name, username, station code..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-[#001489]"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="CWH">CWH Hub</option>
              <option value="CCI">CCI Agent</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-[#001489]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Page Size */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-[#001489]"
            >
              <option value={12}>12</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">User / Login ID</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Assigned Station / Scope</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No user profiles found matching the current filters.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const isActive = u.is_active !== false;
                  const stObj = stations.find((s) => s.station_code === u.station_code);

                  return (
                    <tr key={u.id || u.username} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700">
                            {u.full_name ? u.full_name[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{u.full_name}</div>
                            <div className="font-mono text-[11px] text-[#001489] font-medium">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{renderRoleBadge(u.role)}</td>
                      <td className="py-3.5 px-4">
                        {u.role === 'CCI' ? (
                          <div>
                            <span className="font-mono font-bold text-[#001489] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                              {u.station_code || 'Unassigned'}
                            </span>
                            {stObj && (
                              <div className="text-[11px] text-slate-500 mt-1 truncate max-w-[200px]" title={stObj.station_name}>
                                {stObj.station_name}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-1 font-medium">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {u.role === 'ADMIN' ? 'Headquarters (Global)' : 'Central Warehouse Hub'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }) : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setResetPwUser(u);
                              setNewPassword(generateRandomPassword());
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition shadow-xs cursor-pointer"
                            title="Reset Password"
                          >
                            <Key className="w-3 h-3 text-slate-500" />
                            Reset PW
                          </button>

                          <button
                            onClick={() => setStatusConfirmUser(u)}
                            disabled={u.username === currentUser.username}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition shadow-xs cursor-pointer ${
                              isActive
                                ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200'
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                            } ${u.username === currentUser.username ? 'opacity-40 cursor-not-allowed' : ''}`}
                            title={u.username === currentUser.username ? 'Cannot deactivate self' : ''}
                          >
                            {isActive ? (
                              <>
                                <XCircle className="w-3 h-3" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Activate
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-slate-700">{Math.min(currentPage * pageSize, filteredUsers.length)}</span> of{' '}
            <span className="font-semibold text-slate-700">{filteredUsers.length}</span> user accounts
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Create New User */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100/70 text-[#001489] rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 font-['Outfit'] text-base">Create New System User</h3>
                  <p className="text-xs text-slate-500">Add an administrator, CWH logistics lead, or CCI station agent</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  User Role *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateRole('CCI');
                      if (!createStationCode && stations[0]) setCreateStationCode(stations[0].station_code);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      createRole === 'CCI'
                        ? 'border-[#001489] bg-blue-50/70 text-[#001489] font-bold shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Store className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                    <div className="text-xs">CCI Agent</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRole('CWH')}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      createRole === 'CWH'
                        ? 'border-[#001489] bg-blue-50/70 text-[#001489] font-bold shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Warehouse className="w-4 h-4 mx-auto mb-1 text-amber-600" />
                    <div className="text-xs">CWH Staff</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRole('ADMIN')}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      createRole === 'ADMIN'
                        ? 'border-[#001489] bg-blue-50/70 text-[#001489] font-bold shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Shield className="w-4 h-4 mx-auto mb-1 text-purple-600" />
                    <div className="text-xs">Admin</div>
                  </button>
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Username / Login ID *
                </label>
                <input
                  type="text"
                  required
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder={createRole === 'CCI' ? 'e.g. cci_068' : 'e.g. rahul_cwh'}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name / Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                />
              </div>

              {/* CCI Station Selector */}
              {createRole === 'CCI' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Assigned CCI Station *
                  </label>
                  <select
                    required
                    value={createStationCode}
                    onChange={(e) => {
                      setCreateStationCode(e.target.value);
                      if (!createUsername || createUsername.startsWith('cci_')) {
                        setCreateUsername(`cci_${e.target.value}`);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  >
                    <option value="">Select Station...</option>
                    {stations.map((st) => (
                      <option key={st.station_code} value={st.station_code}>
                        {st.station_code} - {st.station_name} ({st.city || st.region})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Initial Password (Min 6 Characters) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setCreatePassword(generateRandomPassword())}
                    className="px-3 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Default format is <code>Moto@xxxx</code>. You can customize or regenerate.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#001489] hover:bg-[#08209e] rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCreate ? 'Creating User...' : 'Create User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Reset Password */}
      {resetPwUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100/70 text-amber-800 rounded-xl">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 font-['Outfit'] text-base">Reset User Password</h3>
                  <p className="text-xs text-slate-500">For user: @{resetPwUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setResetPwUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                <div className="text-slate-500">Target User:</div>
                <div className="font-bold text-slate-800 mt-0.5">{resetPwUser.full_name}</div>
                <div className="text-slate-500 font-mono mt-0.5">Role: {resetPwUser.role}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="px-3 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetPwUser(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#001489] hover:bg-[#08209e] rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingReset ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Activate / Deactivate Confirmation */}
      {statusConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  statusConfirmUser.is_active === false
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {statusConfirmUser.is_active === false ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 font-['Outfit'] text-base">
                  {statusConfirmUser.is_active === false ? 'Activate User Account?' : 'Deactivate User Account?'}
                </h3>
                <p className="text-xs text-slate-500">@{statusConfirmUser.username}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {statusConfirmUser.is_active === false ? (
                <>
                  Are you sure you want to reactivate user <strong>{statusConfirmUser.full_name}</strong>? They will immediately regain access to the portal.
                </>
              ) : (
                <>
                  Are you sure you want to deactivate user <strong>{statusConfirmUser.full_name}</strong>? Once deactivated, this user will be immediately blocked from signing into the Motorola Returns CRM.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStatusConfirmUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleStatus}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition cursor-pointer ${
                  statusConfirmUser.is_active === false
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {statusConfirmUser.is_active === false ? 'Yes, Reactivate User' : 'Yes, Deactivate User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
