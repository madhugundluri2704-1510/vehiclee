import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAlertStore from '../../store/useAlertStore';
import useThemeStore from '../../store/useThemeStore';
import { formatTimeAgo, getSeverityIcon } from '../../utils/formatters';
import AlertDetailsDialog from '../alerts/AlertDetailsDialog';
import './Header.css';

export default function Header({ title, onMobileMenuToggle }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedAlertForDialog, setSelectedAlertForDialog] = useState(null);
  const { alerts, unacknowledgedCount, acknowledgeAlert } = useAlertStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const recentAlerts = alerts.filter(a => !a.acknowledged).slice(0, 8);

  const handleViewOnMap = (alert) => {
    setShowNotifications(false);
    const lat = alert.location?.lat ?? alert.lat ?? alert.stopId?.location?.lat;
    const lng = alert.location?.lng ?? alert.lng ?? alert.stopId?.location?.lng;
    const vId = alert.vehicleId?._id || (typeof alert.vehicleId === 'string' ? alert.vehicleId : null) || '';
    const regNumber = alert.vehicleNumber || alert.vehicleId?.vehicleNumber || (alert.message?.match(/AP24[A-Z0-9]+/)?.[0]) || '';
    const driver = alert.driverName || alert.vehicleId?.driverName || (alert.message?.match(/Driver:\s*([^)]+)/)?.[1]) || 'Unassigned';
    const alertAddress = alert.address || alert.location?.address || alert.stopId?.location?.address || alert.cleaningZone || 'Kurnool Municipal Area';

    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      alert(`Location is unavailable for ${regNumber || 'this vehicle'} (No GPS coordinates recorded).`);
      return;
    }

    navigate(`/tracking?vehicleId=${vId}&alertLat=${lat}&alertLng=${lng}&type=${encodeURIComponent(alert.type || 'alert')}`, {
      state: {
        targetVehicleId: vId,
        vehicleNumber: regNumber,
        driverName: driver,
        alertId: alert._id,
        alertType: alert.type,
        alertSeverity: alert.severity,
        alertMessage: alert.message,
        alertTime: alert.createdAt,
        alertAddress,
        alertLat: Number(lat),
        alertLng: Number(lng),
        isStopAlert: alert.type === 'prolonged-stop' || Boolean(alert.stopId),
        stopDuration: alert.stopDuration || alert.stopId?.durationMinutes,
        stopStartTime: alert.stopStartTime || alert.stopId?.startTime,
        currentVehicleStatus: alert.vehicleId?.status || 'idle',
        currentVehicleLocation: alert.vehicleId?.currentLocation || null
      }
    });
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <button className="mobile-menu-btn" onClick={onMobileMenuToggle}>☰</button>
          <div className="header-title-wrap">
            <h1 className="header-title">{title}</h1>
            <span className="header-subtitle">Kurnool Municipal Corporation</span>
          </div>
        </div>
        <div className="header-right">
          <div className="header-search">
            <span className="search-icon-h">🔍</span>
            <input type="text" placeholder="Search vehicles, zones..." className="header-search-input" />
          </div>
          <button className="header-theme-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="notification-wrapper">
            <button
              className="notification-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              title="Alert Notifications"
            >
              🔔
              {unacknowledgedCount > 0 && (
                <span className="notification-badge">
                  {unacknowledgedCount > 99 ? '99+' : unacknowledgedCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <span className="notification-title">Vehicle Alerts</span>
                  <span className="notification-count">{unacknowledgedCount} unacknowledged</span>
                </div>
                <div className="notification-list">
                  {recentAlerts.length === 0 ? (
                    <div className="notification-empty">No active alerts</div>
                  ) : (
                    recentAlerts.map((alert) => {
                      const lat = alert.location?.lat ?? alert.lat ?? alert.stopId?.location?.lat;
                      const lng = alert.location?.lng ?? alert.lng ?? alert.stopId?.location?.lng;
                      const hasLoc = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
                      const regNum = alert.vehicleNumber || alert.vehicleId?.vehicleNumber || 'Vehicle Alert';

                      return (
                        <div
                          key={alert._id}
                          className="notification-item"
                          onClick={() => setSelectedAlertForDialog(alert)}
                        >
                          <span className="notification-icon">{getSeverityIcon(alert.severity)}</span>
                          <div className="notification-content">
                            <div className="notification-meta-row">
                              <span className="notification-veh-number">{regNum}</span>
                              <span className="notification-time">{formatTimeAgo(alert.createdAt)}</span>
                            </div>
                            <p className="notification-message">{alert.message}</p>
                            
                            {/* Requirement 1, 2, 4, 8: Vehicle Location in notification item */}
                            <div className="notification-loc-row">
                              <span className={hasLoc ? 'notification-loc-text' : 'notification-loc-unavailable'}>
                                {hasLoc ? `📍 ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : '⚠️ Location unavailable'}
                              </span>
                              {alert.address && hasLoc && (
                                <span className="notification-loc-address" title={alert.address}>
                                  • {alert.address}
                                </span>
                              )}
                            </div>

                            <div className="notification-actions-row">
                              {hasLoc ? (
                                <button
                                  className="notif-map-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewOnMap(alert);
                                  }}
                                  title="View on Map"
                                >
                                  📍 View on Map
                                </button>
                              ) : (
                                <span className="notif-unavailable-pill">No GPS Fix</span>
                              )}
                              <button
                                className="notif-ack-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  acknowledgeAlert(alert._id);
                                }}
                                title="Acknowledge Alert"
                              >
                                ✓ Ack
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Requirement 2, 7: Dedicated Alert Details Dialog */}
      <AlertDetailsDialog
        open={Boolean(selectedAlertForDialog)}
        onClose={() => setSelectedAlertForDialog(null)}
        alert={selectedAlertForDialog}
        onViewOnMap={handleViewOnMap}
        onAcknowledge={acknowledgeAlert}
      />
    </>
  );
}
