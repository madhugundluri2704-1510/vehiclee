import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import useAuthStore from './store/useAuthStore';
import useThemeStore from './store/useThemeStore';
import useSocket from './hooks/useSocket';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import VehicleTrackingPage from './pages/VehicleTrackingPage';
import RouteMonitoringPage from './pages/RouteMonitoringPage';
import AnalyticsDashboardPage from './pages/AnalyticsDashboardPage';
import VehicleDetailsPage from './pages/VehicleDetailsPage';
import VehicleManagementPage from './pages/VehicleManagementPage';
import DriverManagementPage from './pages/DriverManagementPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AttendanceDashboardPage from './pages/AttendanceDashboardPage';
import DriverWorkforceDashboardPage from './pages/DriverWorkforceDashboardPage';
import DriverPerformanceDashboardPage from './pages/DriverPerformanceDashboardPage';
import DriverRankingPage from './pages/DriverRankingPage';
import AttendanceReportsPage from './pages/AttendanceReportsPage';
import CitizenPortal from './pages/CitizenPortal';
import ComplaintManagementPage from './pages/ComplaintManagementPage';
import DriverPortalPage from './pages/DriverPortalPage';
import RealtimeAlertToast from './components/alerts/RealtimeAlertToast';
import './App.css';

const pageTitles = {
  '/': 'Dashboard',
  '/tracking': 'Live Vehicle Tracking',
  '/routes': 'Route Monitoring',
  '/analytics': 'Waste Collection Analytics',
  '/vehicles': 'Vehicle Management',
  '/drivers': 'Driver Management',
  '/attendance': 'Driver Attendance Desk',
  '/workforce': 'Workforce Analytics Hub',
  '/driver-performance': 'Driver Productivity Stats',
  '/driver-ranking': 'Driver Leaderboard',
  '/attendance-reports': 'Attendance Reports & Logs',
  '/reports': 'Reports & Export',
  '/settings': 'Settings',
  '/complaints': 'Complaint Management',
  '/driver-portal': 'Driver Portal',
};

function ProtectedLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = window.location.pathname;
  const title = pageTitles[pathname] || 'KMC SwachthTrack';
  useSocket();

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="app-main">
        <Header title={title} onMobileMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <RealtimeAlertToast />
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'driver' && window.location.pathname === '/') return <Navigate to="/driver-portal" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { initTheme } = useThemeStore();
  useEffect(() => { initTheme(); }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal" element={<CitizenPortal />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><ProtectedLayout /></ProtectedRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tracking" element={<VehicleTrackingPage />} />
          <Route path="/routes" element={<RouteMonitoringPage />} />
          <Route path="/analytics" element={<AnalyticsDashboardPage />} />
          <Route path="/vehicle/:id" element={<VehicleDetailsPage />} />
          <Route path="/vehicles" element={<AdminRoute><VehicleManagementPage /></AdminRoute>} />
          <Route path="/drivers" element={<AdminRoute><DriverManagementPage /></AdminRoute>} />
          <Route path="/attendance" element={<AdminRoute><AttendanceDashboardPage /></AdminRoute>} />
          <Route path="/workforce" element={<AdminRoute><DriverWorkforceDashboardPage /></AdminRoute>} />
          <Route path="/driver-performance" element={<AdminRoute><DriverPerformanceDashboardPage /></AdminRoute>} />
          <Route path="/driver-ranking" element={<DriverRankingPage />} />
          <Route path="/attendance-reports" element={<AdminRoute><AttendanceReportsPage /></AdminRoute>} />
          <Route path="/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
          <Route path="/complaints" element={<ComplaintManagementPage />} />
          <Route path="/driver-portal" element={<DriverPortalPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
