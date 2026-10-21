import React, { useState, useEffect } from 'react';
import { stopApi } from '../../services/api';
import AdminStopReviewDialog from './AdminStopReviewDialog';
import { Button, Tooltip, Chip } from '@mui/material';
import useSocket from '../../hooks/useSocket';

export default function ActiveStopsTable({ onSelectStopOnMap }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReviewStop, setSelectedReviewStop] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected', 'running'
  const { socket } = useSocket();

  const fetchStops = async () => {
    try {
      const res = await stopApi.getActiveStops();
      setStops(res.data || []);
    } catch (err) {
      console.error('Failed to load vehicle stops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStops();
    // Live ticker every 1 second based on server timestamps
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to WebSocket events for real-time dashboard updates
  useEffect(() => {
    if (!socket) return;
    const handleImmediateUpdate = () => {
      fetchStops();
    };

    socket.on('stop:explanation_submitted', handleImmediateUpdate);
    socket.on('stop:explanation_reviewed', handleImmediateUpdate);
    socket.on('stop:timer_stopped', handleImmediateUpdate);
    socket.on('vehicle:stop_alert', handleImmediateUpdate);
    socket.on('vehicle:stop_started', handleImmediateUpdate);
    socket.on('vehicle:stop_ended', handleImmediateUpdate);
    socket.on('vehicle:stop_update', handleImmediateUpdate);

    return () => {
      socket.off('stop:explanation_submitted', handleImmediateUpdate);
      socket.off('stop:explanation_reviewed', handleImmediateUpdate);
      socket.off('stop:timer_stopped', handleImmediateUpdate);
      socket.off('vehicle:stop_alert', handleImmediateUpdate);
      socket.off('vehicle:stop_started', handleImmediateUpdate);
      socket.off('vehicle:stop_ended', handleImmediateUpdate);
      socket.off('vehicle:stop_update', handleImmediateUpdate);
    };
  }, [socket]);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await stopApi.simulateStop({ durationMinutes: 16 });
      setTimeout(fetchStops, 600);
    } catch (err) {
      alert(err.response?.data?.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const isIncidentTimerStopped = (stop) => {
    return Boolean(
      stop.timerStopped ||
      stop.review?.status === 'approved' ||
      stop.review?.status === 'rejected' ||
      stop.endTime ||
      stop.isTimerRunning === false
    );
  };

  const formatElapsed = (stop) => {
    if (isIncidentTimerStopped(stop)) {
      const dur = stop.finalDurationMinutes != null ? stop.finalDurationMinutes : (stop.durationMinutes || 0);
      const mins = Math.floor(dur);
      const secs = Math.round((dur % 1) * 60);
      return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    const startTime = stop.startTime;
    if (!startTime) return '0m 00s';
    const elapsedMs = Math.max(0, now - new Date(startTime).getTime());
    const mins = Math.floor(elapsedMs / 60000);
    const secs = Math.floor((elapsedMs % 60000) / 1000);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // Filtered stops
  const filteredStops = stops.filter((stop) => {
    if (filter === 'pending') return stop.review?.status === 'pending' && stop.explanation?.reason;
    if (filter === 'approved') return stop.review?.status === 'approved';
    if (filter === 'rejected') return stop.review?.status === 'rejected';
    if (filter === 'running') return !isIncidentTimerStopped(stop);
    return true;
  });

  const pendingCount = stops.filter(s => s.review?.status === 'pending' && s.explanation?.reason).length;
  const approvedCount = stops.filter(s => s.review?.status === 'approved').length;
  const rejectedCount = stops.filter(s => s.review?.status === 'rejected').length;
  const activeTimersCount = stops.filter(s => !isIncidentTimerStopped(s)).length;

  return (
    <div className="card active-stops-card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 className="card-title">🛑 Vehicle Stop Monitoring & Driver Explanation Approvals</h3>
          <span className="badge badge-warning" style={{ fontSize: '0.8rem' }}>
            {stops.length} Total Incidents
          </span>
          {pendingCount > 0 && (
            <span className="badge badge-offline badge-pulse" style={{ fontSize: '0.8rem' }}>
              ⚠️ {pendingCount} Pending Approval
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip title="Simulate a 16-minute stop on an active vehicle to test the 15-minute threshold, explanation submission, and approve/reject flow immediately">
            <Button
              variant="outlined"
              size="small"
              color="warning"
              disabled={simulating}
              onClick={handleSimulate}
              sx={{ textTransform: 'none', fontSize: '0.78rem', py: 0.5 }}
            >
              {simulating ? 'Simulating...' : '⚡ Simulate 16-Min Stop'}
            </Button>
          </Tooltip>
          <button className="btn btn-secondary btn-sm" onClick={fetchStops}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('all')}
        >
          All ({stops.length})
        </button>
        <button
          className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('pending')}
        >
          ⏳ Pending Review ({pendingCount})
        </button>
        <button
          className={`btn btn-sm ${filter === 'approved' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('approved')}
        >
          ✓ Approved ({approvedCount})
        </button>
        <button
          className={`btn btn-sm ${filter === 'rejected' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('rejected')}
        >
          ✕ Rejected ({rejectedCount})
        </button>
        <button
          className={`btn btn-sm ${filter === 'running' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('running')}
        >
          ⏱️ Running Timers ({activeTimersCount})
        </button>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vehicle ID</th>
              <th>Driver Details</th>
              <th>Zone / Locality</th>
              <th>Stop Window</th>
              <th>Stop Duration & Timer</th>
              <th>Explanation</th>
              <th>Submission Time</th>
              <th>Approval Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStops.map((stop) => {
              const timerStopped = isIncidentTimerStopped(stop);
              const elapsedMinutes = timerStopped
                ? (stop.finalDurationMinutes != null ? stop.finalDurationMinutes : (stop.durationMinutes || 0))
                : (now - new Date(stop.startTime).getTime()) / 60000;
              const threshold = stop.thresholdMinutes || 15;
              const isProlonged = elapsedMinutes >= threshold || stop.alertTriggered;
              const explanation = stop.explanation;
              const reviewStatus = stop.review?.status || (explanation?.reason ? 'pending' : 'none');

              return (
                <tr key={stop._id} className={isProlonged && !timerStopped ? 'highlight-alert-row' : ''}>
                  <td>
                    <strong>{stop.vehicleNumber}</strong>
                    {stop.vehicleId?.vehicleType && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                        {stop.vehicleId.vehicleType}
                      </span>
                    )}
                  </td>
                  <td>
                    <strong>{stop.driverName}</strong>
                    {stop.driverPhone && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                        📞 {stop.driverPhone}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-in-progress">{stop.cleaningZone || 'Zone 1'}</span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <strong>Start:</strong> {new Date(stop.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    {(stop.endTime || stop.timerStoppedAt) && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                        <strong>End:</strong> {new Date(stop.endTime || stop.timerStoppedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    )}
                  </td>
                  <td>
                    {timerStopped ? (
                      <div>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            color: reviewStatus === 'approved' ? '#10b981' : reviewStatus === 'rejected' ? '#ef4444' : '#94a3b8',
                            padding: '3px 8px',
                            background: reviewStatus === 'approved' ? 'rgba(16, 185, 129, 0.12)' : reviewStatus === 'rejected' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}
                        >
                          ⏹️ {formatElapsed(stop)}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          Timer Stopped
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            color: isProlonged ? '#ef4444' : '#f59e0b',
                            padding: '3px 8px',
                            background: isProlonged ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}
                        >
                          ⏱️ {formatElapsed(stop)}
                        </span>
                        {isProlonged ? (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: '#ef4444', fontWeight: 600, marginTop: '2px' }}>
                            🚨 Over {threshold}m limit
                          </span>
                        ) : (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            {Math.max(0, Math.round(threshold - elapsedMinutes))}m until alert
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {explanation?.reason ? (
                      <div style={{ maxWidth: '200px' }}>
                        <span
                          className="badge badge-in-progress"
                          style={{ fontWeight: 700, fontSize: '0.75rem' }}
                        >
                          {explanation.reason.toUpperCase()}
                        </span>
                        {explanation.details && (
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                            title={explanation.details}
                          >
                            "{explanation.details}"
                          </p>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: isProlonged ? '#ef4444' : 'var(--text-tertiary)' }}>
                        {isProlonged ? '⚠️ Explanation Required' : 'Within normal limits'}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {explanation?.submittedAt ? (
                      <div>
                        {new Date(explanation.submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                          {new Date(explanation.submittedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {reviewStatus === 'approved' ? (
                      <span className="badge badge-active" style={{ fontWeight: 700 }}>
                        ✓ Approved
                      </span>
                    ) : reviewStatus === 'rejected' ? (
                      <span className="badge badge-offline" style={{ fontWeight: 700 }}>
                        ✕ Rejected
                      </span>
                    ) : explanation?.reason ? (
                      <span className="badge badge-warning badge-pulse" style={{ fontWeight: 700 }}>
                        ⏳ Pending
                      </span>
                    ) : (
                      <span className="badge badge-ghost" style={{ fontSize: '0.75rem' }}>
                        {isProlonged ? 'Awaiting Form' : 'Normal'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                        onClick={() => setSelectedReviewStop(stop)}
                      >
                        {reviewStatus === 'approved' || reviewStatus === 'rejected' ? 'Details' : explanation?.reason ? 'Review' : 'View'}
                      </button>
                      {onSelectStopOnMap && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          onClick={() => onSelectStopOnMap(stop)}
                        >
                          📍 Map
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredStops.length === 0 && !loading && (
              <tr>
                <td colSpan="9" className="text-center" style={{ padding: '28px', color: 'var(--text-tertiary)' }}>
                  ✅ No vehicle stop incidents found under the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedReviewStop && (
        <AdminStopReviewDialog
          open={Boolean(selectedReviewStop)}
          onClose={() => setSelectedReviewStop(null)}
          stop={selectedReviewStop}
          onSuccess={fetchStops}
        />
      )}
    </div>
  );
}
