import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import useVehicleStore from '../store/useVehicleStore';
import useAlertStore from '../store/useAlertStore';
import useSocket from '../hooks/useSocket';
import api from '../services/api';
import { formatTimeAgo, getStatusColor, getVehicleIcon, getSeverityIcon, formatWeight, getWasteTypeIcon } from '../utils/formatters';
import ActiveStopsTable from '../components/stops/ActiveStopsTable';
import './DashboardPage.css';

const COLORS = ['#059669', '#10b981', '#0d9488', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

export default function DashboardPage() {
  const { vehicles, fetchVehicles, stats, fetchStats } = useVehicleStore();
  const { alerts, fetchAlerts, unacknowledgedCount } = useAlertStore();
  const { socket } = useSocket();
  const [summary, setSummary] = useState(null);
  const [complaintStats, setComplaintStats] = useState(null);
  const [recentComplaints, setRecentComplaints] = useState([]);
  const navigate = useNavigate();

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

        <div className="card alerts-card">
          <div className="card-header"><h3 className="card-title">Recent Alerts</h3><span className="badge badge-offline">{unacknowledgedCount} new</span></div>
          <div className="alerts-list">
            {recentAlerts.length === 0 ? (<div className="empty-state"><span className="empty-state-icon">✅</span><span className="empty-state-text">No active alerts</span></div>) : (
              recentAlerts.map((alert) => (<div key={alert._id} className={`alert-item ${alert.severity}`}><div className="alert-icon">{getSeverityIcon(alert.severity)}</div><div><p className="alert-message">{alert.message}</p><span className="alert-time">{formatTimeAgo(alert.createdAt)}</span></div></div>))
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
      <ActiveStopsTable onSelectStopOnMap={() => navigate('/tracking')} />

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
    </div>
  );
}
