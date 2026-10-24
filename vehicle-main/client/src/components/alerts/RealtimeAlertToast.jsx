import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSocket from '../../hooks/useSocket';
import { getSeverityIcon } from '../../utils/formatters';

export default function RealtimeAlertToast({ onViewOnMap }) {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const { socket } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    const handleNewAlert = (alert) => {
      // Add incoming alert to toast list
      setActiveAlerts(prev => [alert, ...prev.slice(0, 2)]);

      // Auto dismiss after 10 seconds
      setTimeout(() => {
        setActiveAlerts(prev => prev.filter(a => (a._id || a.createdAt) !== (alert._id || alert.createdAt)));
      }, 10000);
    };

    socket.on('alert:new', handleNewAlert);
    return () => {
      socket.off('alert:new', handleNewAlert);
    };
  }, [socket]);

  const dismiss = (id) => {
    setActiveAlerts(prev => prev.filter(a => (a._id || a.createdAt) !== id));
  };

  const handleMapClick = (alert) => {
    dismiss(alert._id || alert.createdAt);
    if (onViewOnMap) {
      onViewOnMap(alert);
    } else {
      const lat = alert.location?.lat;
      const lng = alert.location?.lng;
      const vId = alert.vehicleId?._id || alert.vehicleId || '';
      if (lat != null && lng != null) {
        navigate(`/tracking?vehicleId=${vId}&alertLat=${lat}&alertLng=${lng}&type=${encodeURIComponent(alert.type || 'alert')}`, {
          state: {
            targetVehicleId: vId,
            vehicleNumber: alert.vehicleNumber,
            driverName: alert.driverName,
            alertType: alert.type,
            alertSeverity: alert.severity,
            alertMessage: alert.message,
            alertTime: alert.createdAt || new Date().toISOString(),
            alertAddress: alert.address || alert.cleaningZone,
            alertLat: Number(lat),
            alertLng: Number(lng),
            isStopAlert: alert.type === 'prolonged-stop' || Boolean(alert.stopId),
            stopDuration: alert.stopDuration,
            stopStartTime: alert.stopStartTime
          }
        });
      }
    }
  };

  if (activeAlerts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '76px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '380px',
      width: 'calc(100vw - 40px)',
      pointerEvents: 'none'
    }}>
      {activeAlerts.map(alert => {
        const id = alert._id || alert.createdAt || Math.random();
        const lat = alert.location?.lat;
        const lng = alert.location?.lng;
        const hasLoc = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
        const vNum = alert.vehicleNumber || alert.vehicleId?.vehicleNumber || 'Vehicle';

        return (
          <div
            key={id}
            style={{
              pointerEvents: 'auto',
              background: '#0f172a',
              color: '#f8fafc',
              borderRadius: '10px',
              border: alert.severity === 'critical' ? '2px solid #ef4444' : '2px solid #f59e0b',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
              padding: '12px 14px',
              animation: 'slideInRight 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>{getSeverityIcon(alert.severity)}</span>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: alert.severity === 'critical' ? '#f87171' : '#fbbf24' }}>
                    🚨 {alert.type?.replace(/-/g, ' ').toUpperCase() || 'NEW'} ALERT
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                    {vNum} {alert.driverName ? `• ${alert.driverName}` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => dismiss(id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: '0 4px',
                  lineHeight: 1
                }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#e2e8f0', marginTop: '6px', lineHeight: 1.3 }}>
              {alert.message}
            </div>

            {/* Location row (Requirement 1, 4, 8) */}
            <div style={{
              marginTop: '8px',
              padding: '5px 8px',
              borderRadius: '6px',
              background: hasLoc ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: hasLoc ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: '0.74rem',
              color: hasLoc ? '#34d399' : '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '4px'
            }}>
              <span>
                {hasLoc
                  ? `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}${alert.address ? ' (' + alert.address + ')' : ''}`
                  : '📍 Location unavailable'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              {hasLoc ? (
                <button
                  onClick={() => handleMapClick(alert)}
                  style={{
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  📍 View on Map
                </button>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', alignSelf: 'center' }}>
                  Location unavailable
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
