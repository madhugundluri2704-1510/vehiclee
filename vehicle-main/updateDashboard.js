const fs = require('fs');
const filePath = 'C:/Users/Joker/Desktop/vehicleeeee/vehicle-main/client/src/pages/DashboardPage.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add locationError state and handleViewOnMap function
const oldNav = '  const navigate = useNavigate();';
const newNav = `  const [locationError, setLocationError] = useState('');
  const navigate = useNavigate();

  const handleViewOnMap = (item) => {
    const vId = item.vehicleId?._id || (typeof item.vehicleId === 'string' ? item.vehicleId : null) || item._id;
    const regNumber = item.vehicleNumber || item.vehicleId?.vehicleNumber || (item.message?.match(/AP24[A-Z0-9]+/)?.[0]) || '';
    const driver = item.driverName || item.vehicleId?.driverName || (item.message?.match(/Driver:\\s*([^)]+)/)?.[1]) || 'Unassigned';

    // Requirement 5: Use GPS coordinates recorded when the vehicle stopped!
    const stopLat = item.location?.lat ?? item.lat ?? item.stopId?.location?.lat;
    const stopLng = item.location?.lng ?? item.lng ?? item.stopId?.location?.lng;
    const stopAddress = item.address || item.location?.address || item.stopId?.location?.address || item.cleaningZone || 'Kurnool Municipal Area';

    const matchedVehicle = vehicles.find(v => (vId && v._id === vId) || (regNumber && v.vehicleNumber === regNumber));

    const effectiveLat = stopLat ?? matchedVehicle?.currentLocation?.lat;
    const effectiveLng = stopLng ?? matchedVehicle?.currentLocation?.lng;

    if (effectiveLat == null || effectiveLng == null || isNaN(effectiveLat) || isNaN(effectiveLng)) {
      setLocationError(\`Vehicle stop location is currently unavailable for \${regNumber || 'this vehicle'}.\`);
      return;
    }

    setLocationError('');
    const stopDuration = item.stopDuration || item.stopId?.durationMinutes || item.durationMinutes || (item.message?.match(/(\\d+)\\s*mins?/)?.[1]) || 10;
    const stopStartTime = item.stopStartTime || item.stopId?.startTime || item.startTime || item.createdAt;

    navigate(\`/tracking?vehicleId=\${matchedVehicle?._id || vId || ''}&stopLat=\${effectiveLat}&stopLng=\${effectiveLng}&stopped=true\`, {
      state: {
        targetVehicleId: matchedVehicle?._id || vId,
        vehicleNumber: regNumber || matchedVehicle?.vehicleNumber,
        driverName: driver || matchedVehicle?.driverName,
        stopLat: Number(effectiveLat),
        stopLng: Number(effectiveLng),
        stopAddress,
        stopDuration: Number(stopDuration),
        stopStartTime,
        isStopAlert: true,
        currentVehicleStatus: matchedVehicle?.status || 'idle',
        currentVehicleLocation: matchedVehicle?.currentLocation || null
      }
    });
  };`;

// 2. Update alerts rendering to show View on Map ONLY for stop alerts
const oldAlerts = `              recentAlerts.map((alert) => (<div key={alert._id} className={\`alert-item \${alert.severity}\`}><div className="alert-icon">{getSeverityIcon(alert.severity)}</div><div><p className="alert-message">{alert.message}</p><span className="alert-time">{formatTimeAgo(alert.createdAt)}</span></div></div>))`;

const newAlerts = `              recentAlerts.map((alert) => {
                const isStopAlert = alert.type === 'prolonged-stop' || Boolean(alert.stopId);
                return (
                  <div key={alert._id} className={\`alert-item \${alert.severity}\`}>
                    <div className="alert-icon">{getSeverityIcon(alert.severity)}</div>
                    <div style={{ flex: 1 }}>
                      <p className="alert-message">{alert.message}</p>
                      {isStopAlert && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '4px 0', background: 'rgba(239,68,68,0.06)', padding: '4px 8px', borderRadius: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span>⏱️ <strong>Duration:</strong> {alert.stopDuration || alert.stopId?.durationMinutes || '10+'} mins</span>
                          <span>📍 <strong>Location:</strong> {alert.location?.lat ? \`\${Number(alert.location.lat).toFixed(4)}, \${Number(alert.location.lng).toFixed(4)}\` : (alert.cleaningZone || 'Recorded Location')}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span className="alert-time">{formatTimeAgo(alert.createdAt)}</span>
                        {/* Requirement 3: View on Map button in stop alert */}
                        {isStopAlert && (
                          <button
                            className="btn btn-primary btn-sm view-map-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewOnMap(alert);
                            }}
                            style={{
                              fontSize: '0.72rem',
                              padding: '3px 9px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer'
                            }}
                            title="View stop location on map"
                          >
                            📍 View on Map
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })`;

// 3. Update ActiveStopsTable callback
const oldTable = `<ActiveStopsTable onSelectStopOnMap={() => navigate('/tracking')} />`;
const newTable = `{/* Error notification for missing stop coordinates */}
      {locationError && (
        <div style={{ margin: '0 0 16px 0', padding: '10px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '0.86rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {locationError}</span>
          <button onClick={() => setLocationError('')} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}
      <ActiveStopsTable onSelectStopOnMap={handleViewOnMap} />`;

const normalizedContent = content.replace(/\r\n/g, '\n');
let updated = normalizedContent.replace(oldNav.replace(/\r\n/g, '\n'), newNav.replace(/\r\n/g, '\n'));
updated = updated.replace(oldAlerts.replace(/\r\n/g, '\n'), newAlerts.replace(/\r\n/g, '\n'));
updated = updated.replace(oldTable.replace(/\r\n/g, '\n'), newTable.replace(/\r\n/g, '\n'));

fs.writeFileSync(filePath, updated.replace(/\n/g, '\r\n'), 'utf8');
console.log('✅ DashboardPage.jsx updated successfully!');
