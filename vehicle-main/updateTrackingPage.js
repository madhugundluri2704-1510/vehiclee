const fs = require('fs');
const filePath = 'C:/Users/Joker/Desktop/vehicleeeee/vehicle-main/client/src/pages/VehicleTrackingPage.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add imports: useRef, useSearchParams, useLocation
content = content.replace(
  "import { useEffect, useState } from 'react';",
  "import { useEffect, useState, useRef } from 'react';"
);

content = content.replace(
  "import { useNavigate } from 'react-router-dom';",
  "import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';"
);

// 2. Add stopMarkerIcon and MapCenterController
const oldFitBounds = `function FitBounds({ vehicles }) {
  const map = useMap();
  useEffect(() => {
    if (vehicles.length > 0) {
      const bounds = vehicles.filter(v => v.currentLocation?.lat && v.currentLocation?.lng).map(v => [v.currentLocation.lat, v.currentLocation.lng]);
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [vehicles.length]);
  return null;
}`;

const newMapControls = `// Dedicated pulsing marker for the exact recorded stop coordinates (Requirement 4 & 5)
const stopMarkerIcon = L.divIcon({
  className: 'stopped-target-marker',
  html: \`
    <div style="position:relative;width:44px;height:44px;border-radius:50%;background:#dc2626;border:3px solid #fecaca;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 0 5px rgba(239,68,68,0.4), 0 6px 16px rgba(0,0,0,0.5);cursor:pointer;">
      🛑
      <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#ef4444;color:white;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:10px;border:1.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);white-space:nowrap;letter-spacing:0.3px;">
        STOPPED &gt;10m
      </div>
    </div>
  \`,
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

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

// Controller to smoothly center and zoom to exact vehicle stop coordinates (Requirement 7)
function MapCenterController({ targetCoords }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords && !isNaN(targetCoords.lat) && !isNaN(targetCoords.lng)) {
      map.flyTo([targetCoords.lat, targetCoords.lng], 16, { animate: true, duration: 0.6 });
    }
  }, [targetCoords?.lat, targetCoords?.lng]);
  return null;
}`;

// 3. Inside VehicleTrackingPage component, read URL search params and location state
const oldCompStart = `export default function VehicleTrackingPage() {
  const { vehicles, fetchVehicles, filters, setFilters } = useVehicleStore();
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchVehicles(); }, []);`;

const newCompStart = `export default function VehicleTrackingPage() {
  const { vehicles, fetchVehicles, filters, setFilters } = useVehicleStore();
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const stopMarkerRef = useRef(null);
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Read recorded stop parameters (Requirement 2 & 5)
  const targetVehicleId = searchParams.get('vehicleId') || location.state?.targetVehicleId;
  const stopLat = searchParams.get('stopLat') ? parseFloat(searchParams.get('stopLat')) : (location.state?.stopLat ?? (searchParams.get('lat') ? parseFloat(searchParams.get('lat')) : null));
  const stopLng = searchParams.get('stopLng') ? parseFloat(searchParams.get('stopLng')) : (location.state?.stopLng ?? (searchParams.get('lng') ? parseFloat(searchParams.get('lng')) : null));
  const isStopAlert = searchParams.get('stopped') === 'true' || Boolean(location.state?.isStopAlert);

  const passedStopDuration = location.state?.stopDuration;
  const passedStopStartTime = location.state?.stopStartTime;
  const passedStopAddress = location.state?.stopAddress;
  const passedDriverName = location.state?.driverName;
  const passedVehicleNumber = location.state?.vehicleNumber;
  const currentVehicleStatus = location.state?.currentVehicleStatus;

  useEffect(() => { fetchVehicles(); }, []);

  // Sync selectedId and auto-open stop popup
  useEffect(() => {
    if (targetVehicleId) {
      setSelectedId(targetVehicleId);
    }
    if (stopLat != null && stopLng != null && stopMarkerRef.current) {
      const timer = setTimeout(() => {
        stopMarkerRef.current?.openPopup();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [targetVehicleId, stopLat, stopLng]);`;

// 4. Update MapContainer rendering to include recorded stop marker
const oldMapStart = `<MapContainer center={[15.83, 78.04]} zoom={13} className="tracking-map" zoomControl={true}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds vehicles={filtered} />`;

const newMapStart = `<MapContainer center={(stopLat != null && stopLng != null && !isNaN(stopLat) && !isNaN(stopLng)) ? [stopLat, stopLng] : [15.83, 78.04]} zoom={(stopLat != null && stopLng != null) ? 16 : 13} className="tracking-map" zoomControl={true}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapCenterController targetCoords={(stopLat != null && stopLng != null && !isNaN(stopLat) && !isNaN(stopLng)) ? { lat: stopLat, lng: stopLng } : null} />
          <FitBounds vehicles={filtered} hasTarget={Boolean(stopLat != null && stopLng != null)} />

          {/* Requirement 4 & 5: Dedicated Marker at exact recorded stop coordinates */}
          {stopLat != null && stopLng != null && !isNaN(stopLat) && !isNaN(stopLng) && (
            <Marker
              ref={stopMarkerRef}
              position={[stopLat, stopLng]}
              icon={stopMarkerIcon}
            >
              <Popup className="vehicle-popup" autoPan={true}>
                <div className="popup-content" style={{ minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#dc2626' }}>
                      🛑 Recorded Stop Location
                    </h4>
                    <span className="badge badge-offline" style={{ fontSize: '0.72rem' }}>
                      &gt;10 min Stop
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.8rem', color: '#334155' }}>
                    <div><strong>Vehicle:</strong> {passedVehicleNumber || selected?.vehicleNumber || 'Tracked Vehicle'}</div>
                    {targetVehicleId && (
                      <div style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#64748b' }}>
                        <strong>Vehicle ID:</strong> {targetVehicleId}
                      </div>
                    )}
                    <div><strong>👷 Driver:</strong> {passedDriverName || selected?.driverName || 'Assigned Driver'}</div>
                    
                    <div style={{ margin: '4px 0', padding: '6px 8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                      <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.83rem' }}>
                        ⏱️ <strong>Stop Duration:</strong> {Math.round(passedStopDuration || selected?.currentStop?.durationMinutes || 10)} minutes
                      </div>
                      {passedStopStartTime && (
                        <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '2px' }}>
                          📅 <strong>Stop Start Time:</strong> {new Date(passedStopStartTime).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>

                    <div>📍 <strong>Stop Coordinates:</strong> {stopLat.toFixed(5)}, {stopLng.toFixed(5)}</div>
                    <div>🗺️ <strong>Recorded Location:</strong> {passedStopAddress || selected?.cleaningZone || 'Kurnool Municipal Area'}</div>
                    
                    <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #cbd5e1', fontSize: '0.75rem', color: '#64748b' }}>
                      <strong>Current Vehicle Status:</strong>{' '}
                      <span className={\`badge \${getStatusColor(currentVehicleStatus || selected?.status || 'idle')}\`}>
                        {currentVehicleStatus || selected?.status || 'idle'}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}`;

const normalizedContent = content.replace(/\r\n/g, '\n');
let updated = normalizedContent.replace(oldFitBounds.replace(/\r\n/g, '\n'), newMapControls.replace(/\r\n/g, '\n'));
updated = updated.replace(oldCompStart.replace(/\r\n/g, '\n'), newCompStart.replace(/\r\n/g, '\n'));
updated = updated.replace(oldMapStart.replace(/\r\n/g, '\n'), newMapStart.replace(/\r\n/g, '\n'));

fs.writeFileSync(filePath, updated.replace(/\n/g, '\r\n'), 'utf8');
console.log('✅ VehicleTrackingPage.jsx updated successfully!');
