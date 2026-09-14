import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { Toaster, toast } from 'sonner';
import { 
  UserRole, 
  UserProfile, 
  ShippingOrder, 
  ScreeningStatus 
} from './types/crm';
import { crmDb } from './lib/db';
import { Navbar } from './components/layout/Navbar';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { IngestionHub } from './components/admin/IngestionHub';
import { CciDirectory } from './components/admin/CciDirectory';
import { ShippingOrdersTable } from './components/orders/ShippingOrdersTable';
import { OrderDetailModal } from './components/orders/OrderDetailModal';
import { CWHInwardStation } from './components/cwh/CWHInwardStation';
import { UnboxingModal } from './components/cwh/UnboxingModal';
import { AwbDispatchModal } from './components/cwh/AwbDispatchModal';
import { CCIPortal } from './components/cci/CCIPortal';
import { DefectiveMasterVault } from './components/vault/DefectiveMasterVault';
import { AuditLogsViewer } from './components/audit/AuditLogsViewer';

export function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('ADMIN');
  const [currentStation, setCurrentStation] = useState<string>('068');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [unboxingOrder, setUnboxingOrder] = useState<ShippingOrder | null>(null);
  const [awbModalOrder, setAwbModalOrder] = useState<ShippingOrder | null>(null);

  // Subscribe to reactive database changes
  const [, setDbVersion] = useState(0);
  useEffect(() => {
    return crmDb.subscribe(() => {
      setDbVersion((v) => v + 1);
    });
  }, []);

  // Fetch current snapshot from DB
  const stations = crmDb.getStations();
  const orders = crmDb.getShippingOrders();
  const items = crmDb.getDefectiveItems();
  const logs = crmDb.getAuditLogs();

  // Active Station object
  const activeStationObj = stations.find((s) => s.station_code === currentStation);

  // Current User Profile based on role
  const currentUser: UserProfile = {
    id: currentRole === 'ADMIN' ? 'usr-admin-1' : currentRole === 'CWH' ? 'usr-cwh-1' : `usr-cci-${currentStation}`,
    username: currentRole === 'ADMIN' ? 'admin_pramod' : currentRole === 'CWH' ? 'cwh_nilesh' : `cci_${currentStation}`,
    full_name: currentRole === 'ADMIN' ? 'Pramod Kumar (Admin)' : currentRole === 'CWH' ? 'Nilesh Shinde (CWH Lead)' : `${activeStationObj?.station_name || `Station ${currentStation}`}`,
    role: currentRole,
    station_code: currentRole === 'CCI' ? currentStation : undefined,
  };

  // Handle role switch defaults
  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    if (role === 'ADMIN') {
      setActiveTab('dashboard');
      toast.info('Switched to ADMIN view: Full Operations & File Ingestion Access');
    } else if (role === 'CWH') {
      setActiveTab('cwh_inward');
      toast.info('Switched to CWH view: Inward Scanning & CCTV Unboxing Station');
    } else if (role === 'CCI') {
      setActiveTab('cci_consignments');
      toast.info(`Switched to CCI view: Scoped to Station ${currentStation} (${activeStationObj?.city || 'Local'})`);
    }
  };

  // Reset to seed data
  const handleResetData = () => {
    if (confirm('Reset entire system to initial seed data from Dump.xlsx?')) {
      crmDb.resetToSeedData();
      toast.success('Database reset to fresh Motorola seed state');
    }
  };

  // Inward verification handler
  const handleCompleteInward = (
    soId: string,
    screeningMap: Record<string, { status: ScreeningStatus; remarks?: string }>,
    evidenceRef: string | null
  ) => {
    try {
      crmDb.inwardVerifyConsignment(soId, screeningMap, evidenceRef, currentUser);
      toast.success('Inward verification & CCTV logs recorded successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    }
  };

  // Assign AWB handler
  const handleAssignAwb = (
    soId: string,
    courier: string,
    awbNumber: string,
    cancellationReason?: string,
    ewayNumber?: string,
    ewayUrl?: string
  ) => {
    try {
      crmDb.assignAwbToken(soId, courier, awbNumber, currentUser, cancellationReason);
      if (ewayNumber) {
        crmDb.attachEwayBill(soId, ewayNumber, ewayUrl || '', currentUser);
      }
      toast.success(`AWB ${awbNumber} successfully assigned (${courier})`);
    } catch (err: any) {
      toast.error(err.message || 'AWB assignment failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#080d1e] text-slate-100 flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300">
      <Toaster position="top-right" richColors theme="dark" />

      {/* Global Navigation Header */}
      <Navbar
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        currentStation={currentStation}
        onStationChange={setCurrentStation}
        stations={stations}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onResetData={handleResetData}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ADMIN VIEWS */}
        {currentRole === 'ADMIN' && (
          <>
            {activeTab === 'dashboard' && (
              <AdminDashboard
                orders={orders}
                items={items}
                stations={stations}
                onNavigateTab={setActiveTab}
                onSelectOrder={setSelectedOrder}
              />
            )}
            {activeTab === 'orders' && (
              <ShippingOrdersTable
                orders={orders}
                items={items}
                stations={stations}
                currentRole={currentRole}
                onSelectOrder={setSelectedOrder}
                onOpenAwbModal={setAwbModalOrder}
                onOpenInward={setUnboxingOrder}
              />
            )}
            {activeTab === 'vault' && (
              <DefectiveMasterVault
                items={items}
                stations={stations}
                currentRole={currentRole}
              />
            )}
            {activeTab === 'ingestion' && (
              <IngestionHub user={currentUser} />
            )}
            {activeTab === 'cci_master' && (
              <CciDirectory
                stations={stations}
                onSelectStation={(code) => {
                  setCurrentStation(code);
                  handleRoleChange('CCI');
                }}
              />
            )}
            {activeTab === 'audit' && (
              <AuditLogsViewer logs={logs} />
            )}
          </>
        )}

        {/* CWH VIEWS */}
        {currentRole === 'CWH' && (
          <>
            {activeTab === 'cwh_inward' && (
              <CWHInwardStation
                orders={orders}
                items={items}
                stations={stations}
                user={currentUser}
                onOpenUnboxing={setUnboxingOrder}
                onOpenAwbModal={setAwbModalOrder}
                onSelectOrder={setSelectedOrder}
              />
            )}
            {activeTab === 'orders' && (
              <ShippingOrdersTable
                orders={orders}
                items={items}
                stations={stations}
                currentRole={currentRole}
                onSelectOrder={setSelectedOrder}
                onOpenAwbModal={setAwbModalOrder}
                onOpenInward={setUnboxingOrder}
              />
            )}
            {activeTab === 'vault' && (
              <DefectiveMasterVault
                items={items}
                stations={stations}
                currentRole={currentRole}
              />
            )}
            {activeTab === 'audit' && (
              <AuditLogsViewer logs={logs} />
            )}
          </>
        )}

        {/* CCI VIEWS */}
        {currentRole === 'CCI' && (
          <>
            <CCIPortal
              stationCode={currentStation}
              station={activeStationObj}
              orders={orders}
              items={items}
              onSelectOrder={setSelectedOrder}
            />
          </>
        )}
      </main>

      {/* Modals */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          items={items}
          station={stations.find((s) => s.station_code === selectedOrder.station_code)}
          onClose={() => setSelectedOrder(null)}
          onOpenInward={(o) => {
            setSelectedOrder(null);
            setUnboxingOrder(o);
          }}
          onOpenAwbModal={(o) => {
            setSelectedOrder(null);
            setAwbModalOrder(o);
          }}
        />
      )}

      {unboxingOrder && (
        <UnboxingModal
          order={unboxingOrder}
          items={items}
          user={currentUser}
          onClose={() => setUnboxingOrder(null)}
          onSubmitVerification={handleCompleteInward}
        />
      )}

      {awbModalOrder && (
        <AwbDispatchModal
          order={awbModalOrder}
          user={currentUser}
          onClose={() => setAwbModalOrder(null)}
          onSubmit={handleAssignAwb}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-[#1f2e5a] bg-[#0b1329] py-4 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Motorola Mobility India • Reverse Logistics & Defective Returns Tracking CRM</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Logged in as: <strong className="text-white">{currentUser.username}</strong> ({currentRole})</span>
            <span>•</span>
            <span>SLA Engine Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
