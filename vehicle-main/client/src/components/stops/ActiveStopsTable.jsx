import React, { useState, useEffect } from 'react';
import { stopApi } from '../../services/api';
import AdminStopReviewDialog from './AdminStopReviewDialog';
import { Button, Tooltip } from '@mui/material';

export default function ActiveStopsTable({ onSelectStopOnMap }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReviewStop, setSelectedReviewStop] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [now, setNow] = useState(Date.now());

  const fetchStops = async () => {
    try {
      const res = await stopApi.getActiveStops();
      setStops(res.data);
    } catch (err) {
      console.error('Failed to load active vehicle stops:', err);
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

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await stopApi.simulateStop({ durationMinutes: 12 });
      setTimeout(fetchStops, 800);
    } catch (err) {
      alert(err.response?.data?.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const formatElapsed = (startTime) => {
    if (!startTime) return '0m 00s';
    const elapsedMs = Math.max(0, now - new Date(startTime).getTime());
    const mins = Math.floor(elapsedMs / 60000);
    const secs = Math.floor((elapsedMs % 60000) / 1000);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  return (
    <div className="card active-stops-card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 className="card-title">🛑 Active Vehicle Stops & Idle Detection</h3>
          <span className="badge badge-warning" style={{ fontSize: '0.8rem' }}>
            {stops.length} Stopped
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip title="Trigger a 12-minute stop on an active vehicle to test alerts and explanations immediately without waiting 10 minutes">
            <Button
              variant="outlined"
              size="small"
              color="warning"
              disabled={simulating}
              onClick={handleSimulate}
              sx={{ textTransform: 'none', fontSize: '0.78rem', py: 0.5 }}
            >
              {simulating ? 'Simulating...' : '⚡ Simulate 12-Min Stop'}
            </Button>
          </Tooltip>
          <button className="btn btn-secondary btn-sm" onClick={fetchStops}>
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vehicle Number</th>
              <th>Driver</th>
              <th>Zone / Locality</th>
              <th>Started At</th>
              <th>Live Stop Timer</th>
              <th>Threshold Status</th>
              <th>Driver Explanation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stops.map((stop) => {
              const elapsedMinutes = (now - new Date(stop.startTime).getTime()) / 60000;
              const isProlonged = elapsedMinutes >= (stop.thresholdMinutes || 10) || stop.alertTriggered;
              const explanation = stop.explanation;
              const review = stop.review;

              return (
                <tr key={stop._id} className={isProlonged ? 'highlight-alert-row' : ''}>
                  <td>
                    <strong>{stop.vehicleNumber}</strong>
                    {stop.vehicleId?.vehicleType && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                        {stop.vehicleId.vehicleType}
                      </span>
                    )}
                  </td>
                  <td>
                    {stop.driverName}
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
                    {new Date(stop.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        color: isProlonged ? '#ef4444' : '#f59e0b',
                        padding: '2px 8px',
                        background: isProlonged ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}
                    >
                      ⏱️ {formatElapsed(stop.startTime)}
                    </span>
                  </td>
                  <td>
                    {isProlonged ? (
                      <span className="badge badge-offline badge-pulse">
                        <span className="badge-dot"></span> 🚨 {Math.round(elapsedMinutes)}m Prolonged Alert
                      </span>
                    ) : (
                      <span className="badge badge-warning">
                        Stationary ({Math.round(stop.thresholdMinutes || 10) - Math.floor(elapsedMinutes)}m left)
                      </span>
                    )}
                  </td>
                  <td>
                    {explanation?.reason ? (
                      <div>
                        <span
                          className={`badge ${
                            review?.status === 'approved'
                              ? 'badge-active'
                              : review?.status === 'rejected'
                              ? 'badge-offline'
                              : 'badge-in-progress'
                          }`}
                        >
                          {review?.status === 'approved' ? '✓ ' : review?.status === 'rejected' ? '✕ ' : '⏳ '}
                          {explanation.reason.toUpperCase()}
                        </span>
                        {review?.status === 'pending' && (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: '#10b981', marginTop: '2px' }}>
                            Awaiting Admin Review
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: isProlonged ? '#ef4444' : 'var(--text-tertiary)' }}>
                        {isProlonged ? '⚠️ Explanation Required' : 'Within normal limit'}
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
                        {explanation?.reason ? 'Review' : 'View'}
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
            {stops.length === 0 && !loading && (
              <tr>
                <td colSpan="8" className="text-center" style={{ padding: '24px', color: 'var(--text-tertiary)' }}>
                  ✅ No vehicles currently stopped. Fleet is in active motion.
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
