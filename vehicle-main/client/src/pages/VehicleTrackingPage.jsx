import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import useVehicleStore from '../store/useVehicleStore';
import { getStatusColor, getVehicleIcon, formatSpeed, formatFuel, formatWeight, getSeverityIcon } from '../utils/formatters';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './VehicleTrackingPage.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createVehicleIcon = (type, status, currentStop) => {
  const isProlongedStop = currentStop?.alertTriggered || (currentStop?.durationMinutes >= 10);
  const isStopped = Boolean(currentStop?.stopId) || status === 'idle';

  let borderColor = 'white';
  let badgeHtml = '';

  if (isProlongedStop) {
    borderColor = '#ef4444';
    badgeHtml = `<div style="position:absolute;top:-8px;right:-8px;background:#ef4444;color:white;font-size:10px;font-weight:bold;padding:1px 5px;border-radius:10px;border:1px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);white-space:nowrap;">🛑 ${Math.round(currentStop?.durationMinutes || 10)}m</div>`;
  } else if (isStopped) {
    borderColor = '#f59e0b';
    badgeHtml = `<div style="position:absolute;top:-8px;right:-8px;background:#f59e0b;color:black;font-size:9px;font-weight:bold;padding:1px 4px;border-radius:10px;border:1px solid white;white-space:nowrap;">⏸️ ${Math.round(currentStop?.durationMinutes || 0)}m</div>`;
  }

  const colors = { active: '#10b981', idle: '#f59e0b', maintenance: '#0ea5e9', offline: '#ef4444', returning: '#8b5cf6' };
  const color = isProlongedStop ? '#ef4444' : (colors[status] || '#94a3b8');

  return L.divIcon({
    className: 'vehicle-marker-icon',
    html: `<div style="position:relative;width:36px;height:36px;border-radius:50%;background:${color};border:3px solid ${borderColor};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${getVehicleIcon(type)}${badgeHtml}</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
};

const dumpIcon = L.divIcon({
  className: 'dump-marker',
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#ef4444;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏭</div>',
  iconSize: [30, 30], iconAnchor: [15, 15],
});

const dumpingYards = [
  { name: 'Kurnool Municipal Dumping Yard', lat: 15.8450, lng: 78.0650 },
  { name: 'Orvakal Dump Site', lat: 15.7900, lng: 78.0800 },
  { name: 'Panyam Road Yard', lat: 15.8550, lng: 78.0200 },
];

// Dynamic Alert Marker Icon for any alert type (Requirements 1, 3, 5)
const createAlertMarkerIcon = (alertType = '', severity = 'high') => {
  let iconEmoji = '🚨';
  let labelText = 'ALERT';
  let bgColor = '#dc2626';
  let glowColor = 'rgba(239, 68, 68, 0.4)';

  switch (alertType.toLowerCase()) {
    case 'prolonged-stop':
      iconEmoji = '🛑';
      labelText = 'STOPPED >10m';
      bgColor = '#dc2626';
      break;
    case 'overspeed':
      iconEmoji = '⚡';
      labelText = 'OVERSPEED';
      bgColor = '#ea580c';
      glowColor = 'rgba(234, 88, 12, 0.4)';
      break;
    case 'fuel-low':
      iconEmoji = '⛽';
      labelText = 'LOW FUEL';
      bgColor = '#d97706';
      glowColor = 'rgba(217, 119, 6, 0.4)';
      break;
    case 'overload':
      iconEmoji = '⚖️';
      labelText = 'OVERLOAD';
      bgColor = '#9333ea';
      glowColor = 'rgba(147, 51, 234, 0.4)';
      break;
    case 'vehicle-offline':
      iconEmoji = '📵';
      labelText = 'OFFLINE';
      bgColor = '#b91c1c';
      glowColor = 'rgba(185, 28, 28, 0.4)';
      break;
    case 'route-deviation':
      iconEmoji = '🛣️';
      labelText = 'DEVIATION';
      bgColor = '#c026d3';
      glowColor = 'rgba(192, 38, 211, 0.4)';
      break;
    case 'fatigue':
      iconEmoji = '⏰';
      labelText = 'FATIGUE';
      bgColor = '#e11d48';
      glowColor = 'rgba(225, 29, 72, 0.4)';
      break;
    default:
      iconEmoji = '🚨';
      labelText = (alertType || 'ALERT').replace(/-/g, ' ').toUpperCase();
      break;
  }

  return L.divIcon({
    className: 'alert-target-marker',
    html: `
      <div style="position:relative;width:44px;height:44px;border-radius:50%;background:${bgColor};border:3px solid #ffffff;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 0 5px ${glowColor}, 0 6px 16px rgba(0,0,0,0.5);cursor:pointer;animation:pulse 1.8s infinite;">
        ${iconEmoji}
        <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:${bgColor};color:white;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:10px;border:1.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);white-space:nowrap;letter-spacing:0.3px;">
          ${labelText}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

function FitBounds({ vehicles, hasTarget }) {
  const map = useMap();
  useEffect(() => {
    if (!hasTarget && vehicles.length > 0) {
      const bounds = vehicles.filter(v => v.currentLocation?.lat && v.currentLocation?.lng).map(v => [v.currentLocation.lat, v.currentLocation.lng]);
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [vehicles.length, hasTarget]);
  return null;
}

// Controller to smoothly center and zoom to exact vehicle alert coordinates (Requirement 3)
function MapCenterController({ targetCoords }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords && !isNaN(targetCoords.lat) && !isNaN(targetCoords.lng)) {
      map.flyTo([targetCoords.lat, targetCoords.lng], 16, { animate: true, duration: 0.6 });
    }
  }, [targetCoords?.lat, targetCoords?.lng]);
  return null;
}

export default function VehicleTrackingPage() {
  const { vehicles, fetchVehicles, filters, setFilters } = useVehicleStore();
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMissingNotice, setShowMissingNotice] = useState(false);
  const alertMarkerRef = useRef(null);
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Read recorded alert coordinates (Requirements 1, 3, 5, 8)
  const targetVehicleId = searchParams.get('vehicleId') || location.state?.targetVehicleId;

  const rawLat = searchParams.get('alertLat') ?? searchParams.get('stopLat') ?? searchParams.get('lat') ?? location.state?.alertLat ?? location.state?.stopLat;
  const rawLng = searchParams.get('alertLng') ?? searchParams.get('stopLng') ?? searchParams.get('lng') ?? location.state?.alertLng ?? location.state?.stopLng;

  const alertLat = (rawLat != null && rawLat !== '' && !isNaN(Number(rawLat))) ? parseFloat(rawLat) : null;
  const alertLng = (rawLng != null && rawLng !== '' && !isNaN(Number(rawLng))) ? parseFloat(rawLng) : null;
  const hasValidLocation = alertLat != null && alertLng != null;

  const isStopAlert = searchParams.get('stopped') === 'true' || location.state?.isStopAlert || location.state?.alertType === 'prolonged-stop';
  const alertType = searchParams.get('type') || location.state?.alertType || (isStopAlert ? 'prolonged-stop' : 'alert');
  const alertSeverity = location.state?.alertSeverity || 'high';
  const alertMessage = location.state?.alertMessage || '';
  const alertTime = location.state?.alertTime;

  const passedStopDuration = location.state?.stopDuration;
  const passedStopStartTime = location.state?.stopStartTime;
  const passedAddress = location.state?.alertAddress || location.state?.stopAddress || searchParams.get('address');
  const passedDriverName = location.state?.driverName;
  const passedVehicleNumber = location.state?.vehicleNumber;
  const currentVehicleStatus = location.state?.currentVehicleStatus;

  useEffect(() => {
    fetchVehicles();
  }, []);

  // Handle missing GPS coordinates notice (Requirement 8)
  useEffect(() => {
    const alertMissingParam = searchParams.get('missingGps') === 'true';
    if (alertMissingParam || (targetVehicleId && !hasValidLocation && location.state?.missingLocation)) {
      setShowMissingNotice(true);
    }
  }, [hasValidLocation, targetVehicleId]);

  // Sync selectedId and auto-open alert popup (Requirement 3)
  useEffect(() => {
    if (targetVehicleId) {
      setSelectedId(targetVehicleId);
    }
    if (hasValidLocation && alertMarkerRef.current) {
      const timer = setTimeout(() => {
        alertMarkerRef.current?.openPopup();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [targetVehicleId, hasValidLocation]);

  const filtered = vehicles.filter(v => {
    const matchSearch = !searchTerm || v.vehicleNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || v.driverName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filters.status || v.status === filters.status;
    const matchType = !filters.type || v.vehicleType === filters.type;
    const matchZone = !filters.zone || v.cleaningZone === filters.zone;
    return matchSearch && matchStatus && matchType && matchZone;
  });

  const selected = vehicles.find(v => v._id === selectedId);

  return (
    <div className="tracking-page">
      <div className="tracking-map-container">
        {/* Requirement 8: Notice if location is unavailable */}
        {showMissingNotice && (
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#fbbf24',
            border: '2px solid #f59e0b',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
          }}>
            <span>⚠️ Location unavailable: No valid GPS coordinates were recorded at the time of this alert.</span>
            <button
              onClick={() => setShowMissingNotice(false)}
              style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        )}

        <MapContainer
          center={hasValidLocation ? [alertLat, alertLng] : [15.83, 78.04]}
          zoom={hasValidLocation ? 16 : 13}
          className="tracking-map"
          zoomControl={true}
        >
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapCenterController targetCoords={hasValidLocation ? { lat: alertLat, lng: alertLng } : null} />
          <FitBounds vehicles={filtered} hasTarget={hasValidLocation} />

          {/* Requirements 1, 3, 5: Dedicated Marker at exact recorded alert location */}
          {hasValidLocation && (
            <Marker
              ref={alertMarkerRef}
              position={[alertLat, alertLng]}
              icon={createAlertMarkerIcon(alertType, alertSeverity)}
            >
              <Popup className="vehicle-popup" autoPan={true} maxWidth={320}>
                <div className="popup-content" style={{ minWidth: '250px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #cbd5e1',
                    paddingBottom: '6px',
                    marginBottom: '8px'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#dc2626' }}>
                      {isStopAlert ? '🛑 Recorded Stop Location' : `🚨 ${alertType.replace(/-/g, ' ').toUpperCase()} ALERT`}
                    </h4>
                    <span className="badge badge-offline" style={{ fontSize: '0.7rem', fontWeight: 800 }}>
                      {alertSeverity.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.8rem', color: '#334155' }}>
                    <div>
                      <strong>Vehicle:</strong> {passedVehicleNumber || selected?.vehicleNumber || 'Tracked Vehicle'}
                    </div>
                    {targetVehicleId && (
                      <div style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: '#64748b' }}>
                        <strong>Vehicle ID:</strong> {targetVehicleId}
                      </div>
                    )}
                    <div>
                      <strong>👷 Driver:</strong> {passedDriverName || selected?.driverName || 'Assigned Driver'}
                    </div>

                    {alertMessage && (
                      <div style={{
                        padding: '6px 8px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        fontSize: '0.78rem',
                        color: '#1e293b'
                      }}>
                        <strong>Alert:</strong> {alertMessage}
                      </div>
                    )}

                    {/* Specific prolonged stop duration details */}
                    {isStopAlert && (
                      <div style={{
                        margin: '2px 0',
                        padding: '5px 8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.25)'
                      }}>
                        <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.82rem' }}>
                          ⏱️ <strong>Stop Duration:</strong> {Math.round(passedStopDuration || selected?.currentStop?.durationMinutes || 10)} minutes
                        </div>
                        {passedStopStartTime && (
                          <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                            📅 <strong>Stop Start:</strong> {new Date(passedStopStartTime).toLocaleTimeString('en-IN')}
                          </div>
                        )}
                      </div>
                    )}

                    {alertTime && !isStopAlert && (
                      <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                        🕒 <strong>Occurred At:</strong> {new Date(alertTime).toLocaleString('en-IN')}
                      </div>
                    )}

                    <div>
                      📍 <strong>Alert Coordinates:</strong> {alertLat.toFixed(5)}, {alertLng.toFixed(5)}
                    </div>
                    <div>
                      🗺️ <strong>Location:</strong> {passedAddress || selected?.cleaningZone || 'Kurnool Municipal Area'}
                    </div>

                    <div style={{
                      marginTop: '4px',
                      paddingTop: '4px',
                      borderTop: '1px dashed #cbd5e1',
                      fontSize: '0.74rem',
                      color: '#64748b'
                    }}>
                      <strong>Live Fleet Status:</strong>{' '}
                      <span className={`badge ${getStatusColor(currentVehicleStatus || selected?.status || 'idle')}`}>
                        {currentVehicleStatus || selected?.status || 'idle'}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {dumpingYards.map((dy, i) => (
            <Marker key={`dy-${i}`} position={[dy.lat, dy.lng]} icon={dumpIcon}>
              <Popup><strong>🏭 {dy.name}</strong><br/>Dumping Yard</Popup>
            </Marker>
          ))}

          {filtered.map(v => (
            v.currentLocation?.lat && v.currentLocation?.lng && (
              <Marker
                key={v._id}
                position={[v.currentLocation.lat, v.currentLocation.lng]}
                icon={createVehicleIcon(v.vehicleType, v.status, v.currentStop)}
                eventHandlers={{ click: () => setSelectedId(v._id) }}
              >
                <Popup className="vehicle-popup">
                  <div className="popup-content">
                    <h4>{v.vehicleNumber}</h4>
                    <p>👷 {v.driverName}</p>
                    <p>⚡ {formatSpeed(v.speed)} | ⛽ {formatFuel(v.fuelLevel)}</p>
                    <p>♻️ {formatWeight(v.currentLoadWeight || 0)} | 📍 {v.cleaningZone}</p>
                    {v.currentStop?.stopId && (
                      <div style={{
                        margin: '6px 0',
                        padding: '4px 8px',
                        background: v.currentStop.alertTriggered ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        borderRadius: '4px',
                        border: v.currentStop.alertTriggered ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(245,158,11,0.3)'
                      }}>
                        <span style={{ fontWeight: 700, color: v.currentStop.alertTriggered ? '#ef4444' : '#f59e0b', fontSize: '0.8rem' }}>
                          🛑 Stopped for {Math.round(v.currentStop.durationMinutes || 0)} mins
                        </span>
                        {v.currentStop.alertTriggered && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                            ⚠️ Prolonged Stop Alert Triggered!
                          </span>
                        )}
                        {v.currentStop.explanationStatus && v.currentStop.explanationStatus !== 'not_required' && (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Explanation: {v.currentStop.explanationStatus.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    )}
                    <span className={`badge ${getStatusColor(v.status)}`}>{v.status}</span>
                  </div>
                </Popup>
              </Marker>
            )
          ))}

          {selected?.assignedRoute?.waypoints && (
            <Polyline
              positions={selected.assignedRoute.waypoints}
              pathOptions={{ color: '#059669', weight: 3, opacity: 0.8, dashArray: '8,8' }}
            />
          )}
        </MapContainer>

        <div className="map-stats-overlay">
          <div className="map-stat"><span className="map-stat-val">{filtered.length}</span><span className="map-stat-label">Showing</span></div>
          <div className="map-stat"><span className="map-stat-val">{filtered.filter(v => v.status === 'active').length}</span><span className="map-stat-label">Active</span></div>
          <div className="map-stat"><span className="map-stat-val">{filtered.filter(v => v.status === 'idle' || v.currentStop?.stopId).length}</span><span className="map-stat-label">Stopped</span></div>
          <div className="map-stat"><span className="map-stat-val" style={{ color: '#ef4444' }}>{filtered.filter(v => v.currentStop?.alertTriggered).length}</span><span className="map-stat-label">Prolonged</span></div>
        </div>
      </div>

      <div className="tracking-sidebar">
        <div className="tracking-filters">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input type="text" className="input" placeholder="Search vehicles..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="filter-row">
            <select className="select" value={filters.status} onChange={(e) => setFilters({ status: e.target.value })}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="maintenance">Maintenance</option>
              <option value="offline">Offline</option>
            </select>
            <select className="select" value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
              <option value="">All Types</option>
              <option value="garbage-truck">Garbage Truck</option>
              <option value="mini-truck">Mini Truck</option>
              <option value="auto-tipper">Auto Tipper</option>
              <option value="compactor">Compactor</option>
              <option value="road-sweeper">Road Sweeper</option>
              <option value="water-tanker">Water Tanker</option>
            </select>
          </div>
          <select className="select w-full" value={filters.zone} onChange={(e) => setFilters({ zone: e.target.value })}>
            <option value="">All Zones</option>
            {[...Array(10)].map((_, i) => <option key={i} value={`Zone ${i+1}`}>Zone {i+1}</option>)}
          </select>
        </div>
        <div className="vehicle-list">
          {filtered.map(v => (
            <div
              key={v._id}
              className={`vehicle-list-item ${selectedId === v._id ? 'selected' : ''}`}
              onClick={() => setSelectedId(v._id)}
            >
              <div className="vli-header">
                <span className="vli-icon">{getVehicleIcon(v.vehicleType)}</span>
                <div className="vli-info">
                  <span className="vli-number">{v.vehicleNumber}</span>
                  <span className="vli-driver">{v.driverName}</span>
                </div>
                <span className={`badge ${getStatusColor(v.status)} badge-pulse`}>
                  <span className="badge-dot"></span> {v.status}
                </span>
              </div>
              <div className="vli-stats">
                <span>⚡ {v.speed} km/h</span>
                <span>⛽ {v.fuelLevel}%</span>
                <span>♻️ {formatWeight(v.currentLoadWeight || 0)}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); navigate(`/vehicle/${v._id}`); }}
                >
                  Details →
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon">🔍</span>
              <span className="empty-state-text">No vehicles found</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
