import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api, { stopApi } from '../services/api';
import useAuthStore from '../store/useAuthStore';
import StopExplanationDialog from '../components/stops/StopExplanationDialog';
import { Chip, Button, Alert as MuiAlert } from '@mui/material';
import useSocket from '../hooks/useSocket';
import './DriverPortalPage.css';

export default function DriverPortalPage() {
  const { user } = useAuthStore();
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [driverStops, setDriverStops] = useState([]);
  const [pendingStops, setPendingStops] = useState([]);
  const [selectedStopForExplanation, setSelectedStopForExplanation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDriverStops = async (assignedVehicleId) => {
    try {
      const [pendingRes, historyRes] = await Promise.all([
        stopApi.getDriverPendingStops(),
        assignedVehicleId ? stopApi.getVehicleStops(assignedVehicleId, 15) : Promise.resolve({ data: [] })
      ]);
      const pending = pendingRes.data || [];
      setPendingStops(pending);
      setDriverStops(historyRes.data || []);

      // Mandatory display: automatically pop open modal if there is a pending stop needing explanation
      if (pending.length > 0 && !selectedStopForExplanation) {
        setSelectedStopForExplanation(pending[0]);
      }
    } catch (err) {
      console.error('Error fetching driver stops:', err);
    }
  };

  useEffect(() => {
    const fetchMyPerformance = async () => {
      try {
        const response = await api.get('/performance/me');
        setData(response.data);
        if (response.data?.driver?.assignedVehicle?._id) {
          fetchDriverStops(response.data.driver.assignedVehicle._id);
        } else {
          fetchDriverStops();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load performance data.');
      } finally {
        setLoading(false);
      }
    };
    fetchMyPerformance();
  }, []);

  // Listen to WebSocket events for real-time driver stop alerts and review decisions
  useEffect(() => {
    if (!socket) return;
    const handleDriverUpdate = () => {
      if (data?.driver?.assignedVehicle?._id) {
        fetchDriverStops(data.driver.assignedVehicle._id);
      } else {
        fetchDriverStops();
      }
    };

    socket.on('driver:stop_explanation_required', handleDriverUpdate);
    socket.on('driver:explanation_reviewed', handleDriverUpdate);
    socket.on('stop:timer_stopped', handleDriverUpdate);

    return () => {
      socket.off('driver:stop_explanation_required', handleDriverUpdate);
      socket.off('driver:explanation_reviewed', handleDriverUpdate);
      socket.off('stop:timer_stopped', handleDriverUpdate);
    };
  }, [socket, data]);

  if (loading) return <div className="portal-loading">Loading your dashboard...</div>;
  if (error) return <div className="portal-error">{error}</div>;
  if (!data) return <div className="portal-error">No data available.</div>;

  const { driver, stats, logs } = data;

  // Format logs for the chart (reverse so it goes oldest to newest)
  const chartData = [...logs].reverse().map(log => ({
    date: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: log.performanceScore,
    distance: log.distanceCovered
  }));

  return (
    <div className="driver-portal">
      <div className="portal-header">
        <h1>Welcome back, {driver.driverName}! 🚛</h1>
        <p>Your Personal Performance Dashboard</p>
      </div>

      {/* Urgent Stop Explanation Alert Banner */}
      {pendingStops.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {pendingStops.map((pStop) => (
            <MuiAlert
              key={pStop._id}
              severity="warning"
              sx={{
                mb: 1.5,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '10px',
                border: '1px solid rgba(245, 158, 11, 0.4)'
              }}
              action={
                <Button
                  color="warning"
                  variant="contained"
                  size="small"
                  onClick={() => setSelectedStopForExplanation(pStop)}
                  sx={{ fontWeight: 700, textTransform: 'none' }}
                >
                  Submit Explanation ✍️
                </Button>
              }
            >
              <strong>⚠️ Prolonged Stop Action Required:</strong> Vehicle <strong>{pStop.vehicleNumber}</strong> has been stationary for <strong>{pStop.durationMinutes || 15}+ minutes</strong>. Municipal policy requires a mandatory explanation for stops over 15 minutes.
            </MuiAlert>
          ))}
        </div>
      )}

      <div className="profile-card">
        <div className="profile-info">
          <h3>Driver Profile</h3>
          <p><strong>Phone:</strong> {driver.phoneNumber}</p>
          <p><strong>Shift:</strong> <span className={`shift-badge ${driver.shiftTime}`}>{driver.shiftTime}</span></p>
          <p><strong>Status:</strong> {driver.status}</p>
        </div>
        <div className="vehicle-info">
          <h3>Assigned Vehicle</h3>
          {driver.assignedVehicle ? (
            <>
              <p><strong>Number:</strong> {driver.assignedVehicle.vehicleNumber}</p>
              <p><strong>Type:</strong> {driver.assignedVehicle.vehicleType}</p>
            </>
          ) : (
            <p>No vehicle assigned currently.</p>
          )}
        </div>
        <div className="overall-score">
          <h3>Overall Score</h3>
          <div className="score-circle">
            <span className="score-value">{stats.performanceScore}</span>
            <span className="score-max">/100</span>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🗺️</div>
          <div className="stat-details">
            <h4>Total Distance</h4>
            <p>{stats.totalDistance} km</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">♻️</div>
          <div className="stat-details">
            <h4>Waste Collected</h4>
            <p>{stats.totalWaste} kg</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-details">
            <h4>Hours Worked</h4>
            <p>{stats.totalHours} hrs</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-details">
            <h4>Safety Score</h4>
            <p>{stats.avgSafety}%</p>
          </div>
        </div>
      </div>

      <div className="chart-section">
        <h3>Performance Trend (Last 30 Days)</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
              <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Performance Score" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="logs-section">
        <h3>Recent Activity Logs</h3>
        <div className="table-responsive">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Distance (km)</th>
                <th>Waste (kg)</th>
                <th>Hours</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id}>
                  <td>{new Date(log.date).toLocaleDateString()}</td>
                  <td>{log.distanceCovered}</td>
                  <td>{log.wasteCollected}</td>
                  <td>{log.hoursWorked}</td>
                  <td><span className={`score-badge ${log.performanceScore >= 80 ? 'good' : log.performanceScore >= 60 ? 'avg' : 'poor'}`}>{log.performanceScore}</span></td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center">No recent activity found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vehicle Stops & Explanations History Section */}
      <div className="logs-section" style={{ marginTop: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3>🛑 My Vehicle Stops & Explanations</h3>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              if (driver.assignedVehicle?._id) fetchDriverStops(driver.assignedVehicle._id);
              else fetchDriverStops();
            }}
          >
            🔄 Refresh Stops
          </Button>
        </div>

        <div className="table-responsive">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Vehicle</th>
                <th>Stop Duration</th>
                <th>Reason</th>
                <th>Explanation Details</th>
                <th>Supervisor Review</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {driverStops.map((st) => (
                <tr key={st._id}>
                  <td>{new Date(st.startTime).toLocaleString('en-IN')}</td>
                  <td><strong>{st.vehicleNumber}</strong></td>
                  <td>
                    <span style={{ fontWeight: 600, color: st.durationMinutes >= 15 ? '#ef4444' : 'inherit' }}>
                      ⏱️ {st.durationMinutes} mins
                    </span>
                  </td>
                  <td>
                    {st.explanation?.reason ? (
                      <span className="badge badge-in-progress" style={{ textTransform: 'capitalize' }}>
                        {st.explanation.reason}
                      </span>
                    ) : (
                      <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Unexplained</span>
                    )}
                  </td>
                  <td style={{ maxWidth: '240px', fontSize: '0.85rem' }}>
                    {st.explanation?.details || '—'}
                  </td>
                  <td>
                    {st.review?.status === 'approved' ? (
                      <span className="badge badge-active">✓ Approved</span>
                    ) : st.review?.status === 'rejected' ? (
                      <div>
                        <span className="badge badge-offline">✕ Rejected</span>
                        {st.review.remarks && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#ef4444', marginTop: '2px' }}>
                            "{st.review.remarks}"
                          </span>
                        )}
                      </div>
                    ) : st.explanation?.reason ? (
                      <span className="badge badge-warning">⏳ Pending Review</span>
                    ) : (
                      <span className="badge badge-offline">Action Required</span>
                    )}
                  </td>
                  <td>
                    {(!st.explanation?.reason || st.review?.status === 'rejected') && (
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        onClick={() => setSelectedStopForExplanation(st)}
                        sx={{ fontSize: '0.72rem', py: 0.3, textTransform: 'none' }}
                      >
                        {st.review?.status === 'rejected' ? 'Re-explain' : 'Explain'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {driverStops.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center" style={{ padding: '20px' }}>
                    ✅ No recorded stops exceeding threshold for your vehicle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Driver Stop Explanation Modal */}
      {selectedStopForExplanation && (
        <StopExplanationDialog
          open={Boolean(selectedStopForExplanation)}
          onClose={() => setSelectedStopForExplanation(null)}
          stop={selectedStopForExplanation}
          onSuccess={() => {
            if (driver.assignedVehicle?._id) fetchDriverStops(driver.assignedVehicle._id);
            else fetchDriverStops();
          }}
        />
      )}
    </div>
  );
}
