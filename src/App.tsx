import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TeamProvider } from '@/contexts/TeamContext';
import HomePage from '@/pages/HomePage';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { DesignStudioPage } from '@/pages/DesignStudioPage';
import CompilePerDcPanel from '@/components/design-studio/CompilePerDcPanel';
import { MigrationStudioPage } from '@/pages/MigrationStudioPage';
import ReviewPage from '@/pages/ReviewPage';
import FirewallManagementPage from '@/pages/FirewallManagementPage';
import DataImportPage from '@/pages/DataImportPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/AdminPage';
import LifecycleDashboardPage from '@/pages/LifecycleDashboardPage';
import RequestTrackingPage from '@/pages/RequestTrackingPage';
import AuditTrailPage from '@/pages/AuditTrailPage';
import PassThroughValidationPage from '@/pages/PassThroughValidationPage';

function App() {
  return (
    <TeamProvider>
    <BrowserRouter>
      <Routes>
        {/* Home Screen - no header */}
        <Route path="/" element={<HomePage />} />

        {/* Firewall Studio Module */}
        <Route path="/firewall-studio" element={
          <ModuleLayout module="firewall-studio" title="Firewall Studio">
            <DesignStudioPage />
          </ModuleLayout>
        } />
        {/* Import removed from Firewall Studio - auto-imports from NFR */}
        <Route path="/firewall-studio/compile" element={
          <ModuleLayout module="firewall-studio" title="Firewall Studio">
            <CompilePerDcPanel />
          </ModuleLayout>
        } />
        <Route path="/firewall-studio/review" element={
          <ModuleLayout module="firewall-studio" title="Firewall Studio">
            <ReviewPage context="firewall-studio" />
          </ModuleLayout>
        } />

        {/* NGDC Standardization Module */}
        <Route path="/ngdc-standardization" element={
          <ModuleLayout module="ngdc-standardization" title="NGDC Standardization">
            <MigrationStudioPage />
          </ModuleLayout>
        } />
        <Route path="/ngdc-standardization/import" element={
          <ModuleLayout module="ngdc-standardization" title="NGDC Standardization">
            <DataImportPage context="ngdc-import-rules" />
          </ModuleLayout>
        } />
        <Route path="/ngdc-standardization/review" element={
          <ModuleLayout module="ngdc-standardization" title="NGDC Standardization">
            <ReviewPage context="ngdc-standardization" />
          </ModuleLayout>
        } />

        {/* Network Firewall Request Module */}
        <Route path="/firewall-management" element={
          <ModuleLayout module="firewall-management" title="Network Firewall Request">
            <FirewallManagementPage />
          </ModuleLayout>
        } />
        <Route path="/firewall-management/import" element={
          <ModuleLayout module="firewall-management" title="Network Firewall Request">
            <DataImportPage context="firewall-management" />
          </ModuleLayout>
        } />
        <Route path="/firewall-management/review" element={
          <ModuleLayout module="firewall-management" title="Network Firewall Request">
            <ReviewPage context="firewall-management" />
          </ModuleLayout>
        } />

        {/* Request Tracking — dedicated tab */}
        <Route path="/request-tracking" element={
          <ModuleLayout module="firewall-studio" title="Request Tracking">
            <RequestTrackingPage />
          </ModuleLayout>
        } />

        {/* Pass-Through Validation */}
        <Route path="/pass-through-validation" element={
          <ModuleLayout module="firewall-studio" title="Pass-Through Validation">
            <PassThroughValidationPage />
          </ModuleLayout>
        } />

        {/* Audit Trail */}
        <Route path="/audit-trail" element={
          <ModuleLayout module="settings" title="Audit Trail">
            <AuditTrailPage />
          </ModuleLayout>
        } />

        {/* Shared */}
        <Route path="/settings" element={
          <ModuleLayout module="settings" title="Settings">
            <SettingsPage />
          </ModuleLayout>
        } />

        {/* Lifecycle Management */}
        <Route path="/lifecycle" element={
          <ModuleLayout module="lifecycle" title="Lifecycle Management">
            <LifecycleDashboardPage />
          </ModuleLayout>
        } />

        {/* Admin */}
        <Route path="/admin" element={
          <ModuleLayout module="settings" title="Admin">
            <AdminPage />
          </ModuleLayout>
        } />

        {/* Legacy routes redirect */}
        <Route path="/migration" element={
          <ModuleLayout module="ngdc-standardization" title="NGDC Standardization">
            <MigrationStudioPage />
          </ModuleLayout>
        } />
        <Route path="/review" element={
          <ModuleLayout module="firewall-studio" title="Review & Approval">
            <ReviewPage />
          </ModuleLayout>
        } />
        <Route path="/management" element={
          <ModuleLayout module="firewall-management" title="Network Firewall Request">
            <FirewallManagementPage />
          </ModuleLayout>
        } />
        <Route path="/import" element={
          <ModuleLayout module="firewall-studio" title="Data Import">
            <DataImportPage />
          </ModuleLayout>
        } />
      </Routes>
    </BrowserRouter>
    </TeamProvider>
  );
}

export default App;
