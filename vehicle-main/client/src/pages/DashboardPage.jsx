import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import useVehicleStore from '../store/useVehicleStore';
import useAlertStore from '../store/useAlertStore';
import useSocket from '../hooks/useSocket';
import api from '../services/api';
import { formatTimeAgo, getStatusColor, getVehicleIcon, getSeverityIcon, formatWeight, getWasteTypeIcon } from '../utils/formatters';
import ActiveStopsTable from '../components/stops/ActiveStopsTable';
import AlertDetailsDialog from '../components/alerts/AlertDetailsDialog';
import './DashboardPage.css';

const COLORS = ['#059669', '#10b981', '#0d9488', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

export default function DashboardPage() {
  const { vehicles, fetchVehicles, stats, fetchStats } = useVehicleStore();
  const { alerts, fetchAlerts, unacknowledgedCount, acknowledgeAlert } = useAlertStore();
  const { socket } = useSocket();
  const [summary, setSummary] = useState(null);
  const [complaintStats, setComplaintStats] = useState(null);
  const [recentComplaints, setRecentComplaints] = useState([]);
  const [locationError, setLocationError] = useState('');
  const [selectedAlertForDialog, setSelectedAlertForDialog] = useState(null);
  const navigate = useNavigate();

  // Requirements 1, 2, 3, 5, 8: View on map for ANY vehicle alert or stop
  const handleViewOnMap = (item) => {
    const vId = item.vehicleId?._id || (typeof item.vehicleId === 'string' ? item.vehicleId : null) || item._id;
    const regNumber = item.vehicleNumber || item.vehicleId?.vehicleNumber || (item.message?.match(/AP24[A-Z0-9]+/)?.[0]) || '';
    const driver = item.driverName || item.vehicleId?.driverName || (item.message?.match(/Driver:\s*([^)]+)/)?.[1]) || 'Unassigned';

    // Captured GPS coordinates associated with that alert
    const capturedLat = item.location?.lat ?? item.lat ?? item.stopId?.location?.lat;
    const capturedLng = item.location?.lng ?? item.lng ?? item.stopId?.location?.lng;
    const alertAddress = item.address || item.location?.address || item.stopId?.location?.address || item.cleaningZone || 'Kurnool Municipal Area';

    const matchedVehicle = vehicles.find(v => (vId && v._id === vId) || (regNumber && v.vehicleNumber === regNumber));

    const effectiveLat = (capturedLat != null && !isNaN(capturedLat)) ? capturedLat : null;
    const effectiveLng = (capturedLng != null && !isNaN(capturedLng)) ? capturedLng : null;

    if (effectiveLat == null || effectiveLng == null) {
      setLocationError(`Location unavailable: No valid GPS coordinates recorded for ${regNumber || 'this vehicle'} alert.`);
      return;
    }

    setLocationError('');
    const isStopAlert = item.type === 'prolonged-stop' || Boolean(item.stopId) || Boolean(item.startTime);
    const stopDuration = item.stopDuration || item.stopId?.durationMinutes || item.durationMinutes || (item.message?.match(/(\d+)\s*mins?/)?.[1]) || 10;
    const stopStartTime = item.stopStartTime || item.stopId?.startTime || item.startTime || item.createdAt;

    navigate(`/tracking?vehicleId=${matchedVehicle?._id || vId || ''}&alertLat=${effectiveLat}&alertLng=${effectiveLng}&type=${encodeURIComponent(item.type || (isStopAlert ? 'prolonged-stop' : 'alert'))}${isStopAlert ? '&stopped=true' : ''}`, {
      state: {
        targetVehicleId: matchedVehicle?._id || vId,
        vehicleNumber: regNumber || matchedVehicle?.vehicleNumber,
        driverName: driver || matchedVehicle?.driverName,
        alertId: item._id,
        alertType: item.type || (isStopAlert ? 'prolonged-stop' : 'alert'),
        alertSeverity: item.severity || 'medium',
        alertMessage: item.message,
        alertTime: item.createdAt || new Date().toISOString(),
        alertAddress,
        alertLat: Number(effectiveLat),
        alertLng: Number(effectiveLng),
        isStopAlert,
        stopDuration: Number(stopDuration),
        stopStartTime,
        currentVehicleStatus: matchedVehicle?.status || 'idle',
        currentVehicleLocation: matchedVehicle?.currentLocation || null
      }
    });
  };

  useEffect(() => {
    fetchVehicles(); fetchStats(); fetchAlerts();
    api.get('/reports/summary').then(r => setSummary(r.data)).catch(() => {});
    api.get('/complaints/stats').then(r => setComplaintStats(r.data.stats)).catch(() => {});
    api.get('/complaints').then(r => setRecentComplaints(r.data.complaints.slice(0, 6))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('new_complaint', (complaint) => {
      setRecentComplaints((prev) => [complaint, ...prev].slice(0, 6));
      setComplaintStats(prev => prev ? {
        ...prev,
        totalPending: prev.totalPending + 1,
        citizenComplaintsToday: complaint.source === 'Citizen' ? prev.citizenComplaintsToday + 1 : prev.citizenComplaintsToday,
        cctvAlertsToday: complaint.source === 'CCTV' ? prev.cctvAlertsToday + 1 : prev.cctvAlertsToday
      } : prev);
    });
    return () => {
      socket.off('new_complaint');
    };
  }, [socket]);

  const statusData = stats ? [
    { name: 'Active', value: stats.active, color: '#10b981' },
    { name: 'Idle', value: stats.idle, color: '#f59e0b' },
    { name: 'Maintenance', value: stats.maintenance, color: '#0ea5e9' },
    { name: 'Offline', value: stats.offline, color: '#ef4444' },
  ] : [];

  const zoneData = stats?.zoneDistribution?.map(z => ({
    name: z._id, total: z.count, active: z.activeCount
  })) || [];

  const wasteData = stats?.wasteTypeDistribution?.map(w => ({
    name: w._id, count: w.count, load: Math.round(w.totalLoad / 1000)
  })) || [];

  const fuelData = vehicles.slice(0, 12).map(v => ({
    name: v.vehicleNumber?.slice(-4), fuel: v.fuelLevel, load: Math.round((v.currentLoadWeight || 0) / 100)
  }));

  const recentAlerts = alerts.filter(a => !a.acknowledged).slice(0, 6);
  const totalWaste = summary?.waste?.totalWeight || vehicles.reduce((s, v) => s + (v.currentLoadWeight || 0), 0);
  const tooltipStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' };

  return (
    <div className="dashboard">

      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate('/tracking')}>
          <div className="stat-icon emerald">🚛</div>
          <div className="stat-info"><span className="stat-label">Total Vehicles</span><span className="stat-value">{stats?.total || 0}</span><span className="stat-change up">↑ {stats?.active || 0} active</span></div>
        </div>
        <div className="stat-card" onClick={() => navigate('/tracking')}>
          <div className="stat-icon green">✅</div>
          <div className="stat-info"><span className="stat-label">Active Now</span><span className="stat-value">{stats?.active || 0}</span><span className="stat-change up">On cleaning duty</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">🔧</div>
          <div className="stat-info"><span className="stat-label">Under Maintenance</span><span className="stat-value">{stats?.maintenance || 0}</span><span className="stat-change down">Vehicles</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon teal">♻️</div>
          <div className="stat-info"><span className="stat-label">Waste Collected</span><span className="stat-value">{formatWeight(totalWaste)}</span><span className="stat-change up">Today</span></div>
        </div>
        <div className="stat-card" onClick={() => navigate('/routes')}>
          <div className="stat-icon purple">🗺️</div>
          <div className="stat-info"><span className="stat-label">Cleaning Routes</span><span className="stat-value">{summary?.routes?.total || 0}</span><span className="stat-change up">Assigned</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">🔔</div>
          <div className="stat-info"><span className="stat-label">Active Alerts</span><span className="stat-value">{unacknowledgedCount}</span><span className="stat-change down">Unresolved</span></div>
        </div>
        <div className="stat-card" onClick={() => navigate('/complaints')}>
          <div className="stat-icon red">🚨</div>
          <div className="stat-info"><span className="stat-label">Pending Complaints</span><span className="stat-value">{complaintStats?.totalPending || 0}</span><span className="stat-change down">{complaintStats?.cctvAlertsToday || 0} CCTV alerts today</span></div>
        </div>
        <div className="stat-card" onClick={() => {
          const el = document.querySelector('.active-stops-card');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}>
          <div className="stat-icon yellow">🛑</div>
          <div className="stat-info">
            <span className="stat-label">Stopped Vehicles</span>
            <span className="stat-value">{vehicles.filter(v => v.status === 'idle' || v.currentStop?.stopId).length}</span>
            <span className="stat-change down">Idle / Stationary</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card chart-card">
          <div className="card-header"><h3 className="card-title">Vehicle Status</h3><span className="badge badge-active badge-pulse"><span className="badge-dot"></span> Live</span></div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" stroke="none">{statusData.map((e, i) => (<Cell key={i} fill={e.color} />))}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{v}</span>} /></PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card chart-card span-2">
          <div className="card-header"><h3 className="card-title">Zone-wise Vehicle Distribution</h3></div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={zoneData}><CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" /><XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} /><YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="total" fill="#059669" radius={[4,4,0,0]} name="Total" /><Bar dataKey="active" fill="#14b8a6" radius={[4,4,0,0]} name="Active" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Requirements 1, 2, 7, 8: Alert list with location & View on Map button for every alert */}
        <div className="card alerts-card">
          <div className="card-header">
            <h3 className="card-title">Recent Alerts</h3>
            <span className="badge badge-offline">{unacknowledgedCount} new</span>
          </div>
          <div className="alerts-list">
            {recentAlerts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">✅</span>
                <span className="empty-state-text">No active alerts</span>
              </div>
            ) : (
              recentAlerts.map((alert) => {
                const isStopAlert = alert.type === 'prolonged-stop' || Boolean(alert.stopId);
                const lat = alert.location?.lat ?? alert.lat ?? alert.stopId?.location?.lat;
                const lng = alert.location?.lng ?? alert.lng ?? alert.stopId?.location?.lng;
                const hasValidLocation = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
                const regNumber = alert.vehicleNumber || alert.vehicleId?.vehicleNumber || (alert.message?.match(/AP24[A-Z0-9]+/)?.[0]) || 'Vehicle Alert';

                return (
                  <div
                    key={alert._id}
                    className={`alert-item ${alert.severity}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedAlertForDialog(alert)}
                  >
                    <div className="alert-icon">{getSeverityIcon(alert.severity)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                          {regNumber}
                        </span>
                        <span className={`badge ${alert.severity === 'critical' ? 'badge-offline' : 'badge-warning'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          {(alert.type || 'alert').replace(/-/g, ' ').toUpperCase()}
                        </span>
                      </div>

                      <p className="alert-message" style={{ margin: '2px 0 4px' }}>{alert.message}</p>

                      {/* Requirements 1, 2, 8: Latitude, Longitude, and Location Address */}
                      <div style={{
                        fontSize: '0.74rem',
                        color: 'var(--text-secondary)',
                        margin: '4px 0',
                        background: hasValidLocation ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        flexWrap: 'wrap'
                      }}>
                        {hasValidLocation ? (
                          <>
                            <span>📍 <strong>GPS:</strong> {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</span>
                            {alert.address && (
                              <span style={{ color: 'var(--text-tertiary)' }}>• {alert.address}</span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ Location unavailable</span>
                        )}

                        {isStopAlert && (
                          <span>⏱️ <strong>Duration:</strong> {alert.stopDuration || alert.stopId?.durationMinutes || '10+'}m</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                        <span className="alert-time">{formatTimeAgo(alert.createdAt)}</span>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAlertForDialog(alert);
                            }}
                            style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                            title="View Alert Details"
                          >
                            Details
                          </button>

                          {/* Requirements 2, 3, 8: View on Map button for every alert */}
                          <button
                            className={`btn ${hasValidLocation ? 'btn-primary' : 'btn-ghost'} btn-sm view-map-btn`}
                            disabled={!hasValidLocation}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasValidLocation) {
                                handleViewOnMap(alert);
                              }
                            }}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 9px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: hasValidLocation ? 'pointer' : 'not-allowed',
                              opacity: hasValidLocation ? 1 : 0.6
                            }}
                            title={hasValidLocation ? 'View alert location on map' : 'Location unavailable'}
                          >
                            📍 {hasValidLocation ? 'View on Map' : 'No GPS'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card alerts-card">
          <div className="card-header"><h3 className="card-title">Recent Complaints</h3><span className="badge badge-warning">{recentComplaints.length} pending</span></div>
          <div className="alerts-list">
            {recentComplaints.length === 0 ? (<div className="empty-state"><span className="empty-state-icon">✅</span><span className="empty-state-text">No active complaints</span></div>) : (
              recentComplaints.map((comp) => (<div key={comp._id} className="alert-item High" onClick={() => navigate('/complaints')} style={{ cursor: 'pointer' }}><div className="alert-icon">{comp.source === 'CCTV' ? '📷' : '👤'}</div><div><p className="alert-message"><strong>{comp.complaintId}</strong>: {comp.description}</p><span className="alert-time">{formatTimeAgo(comp.createdAt)} - {comp.zone}</span></div></div>))
            )}
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header"><h3 className="card-title">Fuel & Waste Load</h3></div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={fuelData}><CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" /><XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} /><YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="fuel" fill="#059669" radius={[4,4,0,0]} name="Fuel %" /><Bar dataKey="load" fill="#0d9488" radius={[4,4,0,0]} name="Load (x100kg)" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header"><h3 className="card-title">Waste Type Distribution</h3></div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={wasteData} cx="50%" cy="50%" outerRadius={90} dataKey="count" label={({ name }) => `${getWasteTypeIcon(name)} ${name}`} labelLine={false}>{wasteData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Real-time Vehicle Stop Detection & Explanation Table */}
      {/* Error notification for missing coordinates */}
      {locationError && (
        <div style={{ margin: '0 0 16px 0', padding: '10px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '0.86rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {locationError}</span>
          <button onClick={() => setLocationError('')} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}
      <ActiveStopsTable onSelectStopOnMap={handleViewOnMap} />

      <div className="card vehicle-table-card">
        <div className="card-header"><h3 className="card-title">Fleet Overview</h3><button className="btn btn-primary btn-sm" onClick={() => navigate('/tracking')}>View All →</button></div>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead><tr><th>Vehicle</th><th>Driver</th><th>Type</th><th>Zone</th><th>Status</th><th>Speed</th><th>Fuel</th><th>Waste Load</th></tr></thead>
            <tbody>
              {vehicles.slice(0, 10).map((v) => (
                <tr key={v._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/vehicle/${v._id}`)}>
                  <td><strong>{v.vehicleNumber}</strong></td>
                  <td>{v.driverName}</td>
                  <td>{getVehicleIcon(v.vehicleType)} {v.vehicleType}</td>
                  <td><span className="badge badge-in-progress">{v.cleaningZone}</span></td>
                  <td><span className={`badge ${getStatusColor(v.status)}`}><span className="badge-dot"></span> {v.status}</span></td>
                  <td>{v.speed} km/h</td>
                  <td><div className="fuel-cell"><div className="progress-bar" style={{ width: 60 }}><div className={`progress-fill ${v.fuelLevel > 50 ? 'green' : v.fuelLevel > 20 ? 'yellow' : 'red'}`} style={{ width: `${v.fuelLevel}%` }}></div></div><span>{v.fuelLevel}%</span></div></td>
                  <td>{formatWeight(v.currentLoadWeight || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Requirement 2, 7: Dedicated Alert Details Dialog */}
      <AlertDetailsDialog
        open={Boolean(selectedAlertForDialog)}
        onClose={() => setSelectedAlertForDialog(null)}
        alert={selectedAlertForDialog}
        onViewOnMap={handleViewOnMap}
        onAcknowledge={acknowledgeAlert}
      />
    </div>
  );
}
