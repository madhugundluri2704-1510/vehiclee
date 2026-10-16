import { useState, useEffect } from 'react';
import useThemeStore from '../store/useThemeStore';
import useAuthStore from '../store/useAuthStore';
import { stopApi } from '../services/api';
import './SettingsPage.css';

export default function SettingsPage() {
  const { theme, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();
  const [settings, setSettings] = useState({
    speedLimit: 40, overloadAlert: 90, fuelAlert: 15, missedAreaAlert: true,
    notifications: { overspeed: true, overload: true, fuelLow: true, routeDeviation: true, missedArea: true, vehicleOffline: true },
    language: 'en',
  });
  const [stopConfig, setStopConfig] = useState({
    thresholdMinutes: 10,
    speedThresholdKmh: 3.0,
    driftThresholdMeters: 40.0,
    disconnectTimeoutMinutes: 5
  });
  const [saved, setSaved] = useState(false);
  const [simMessage, setSimMessage] = useState('');

  useEffect(() => {
    stopApi.getConfig()
      .then(res => setStopConfig(res.data))
      .catch(err => console.error('Failed to load stop config:', err));
  }, []);

  const handleSave = async () => {
    try {
      await stopApi.updateConfig(stopConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    }
  };

  const handleSimulate = async () => {
    try {
      setSimMessage('Simulating stop...');
      const res = await stopApi.simulateStop({ durationMinutes: 12 });
      setSimMessage('✅ 12-minute stop simulated! Check Dashboard for Alert & Explanation.');
      setTimeout(() => setSimMessage(''), 4000);
    } catch (err) {
      setSimMessage('❌ Failed: ' + (err.response?.data?.message || err.message));
      setTimeout(() => setSimMessage(''), 4000);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <div className="settings-grid">
        <div className="card settings-card">
          <h3 className="card-title">👤 Profile</h3>
          <div className="settings-section">
            <div className="input-group"><label className="input-label">Name</label><input className="input" type="text" value={user?.username||'KMC Admin'} readOnly /></div>
            <div className="input-group"><label className="input-label">Email</label><input className="input" type="email" value={user?.email||'admin@kmc.gov.in'} readOnly /></div>
            <div className="input-group"><label className="input-label">Role</label><input className="input" type="text" value={user?.role||'admin'} readOnly style={{textTransform:'capitalize'}} /></div>
            <div className="input-group"><label className="input-label">Department</label><input className="input" type="text" value="Sanitation - KMC" readOnly /></div>
          </div>
        </div>
        <div className="card settings-card">
          <h3 className="card-title">🎨 Appearance</h3>
          <div className="settings-section">
            <div className="setting-row"><div><span className="setting-name">Dark Mode</span><span className="setting-desc">Toggle between dark and light themes</span></div><button className={`toggle-switch ${theme==='dark'?'active':''}`} onClick={toggleTheme}><span className="toggle-knob"></span></button></div>
            <div className="input-group"><label className="input-label">Language</label>
              <select className="select" value={settings.language} onChange={(e)=>setSettings({...settings,language:e.target.value})}>
                <option value="en">English</option><option value="te">తెలుగు (Telugu)</option><option value="hi">हिंदी (Hindi)</option><option value="ur">اردو (Urdu)</option>
              </select>
            </div>
          </div>
        </div>
        {isAdmin && (
          <>
            <div className="card settings-card">
              <h3 className="card-title">⚡ Fleet Alert Thresholds</h3>
              <div className="settings-section">
                <div className="input-group"><label className="input-label">Speed Limit (km/h)</label><input className="input" type="number" value={settings.speedLimit} onChange={(e)=>setSettings({...settings,speedLimit:+e.target.value})} /></div>
                <div className="input-group"><label className="input-label">Overload Alert (%)</label><input className="input" type="number" value={settings.overloadAlert} onChange={(e)=>setSettings({...settings,overloadAlert:+e.target.value})} /></div>
                <div className="input-group"><label className="input-label">Low Fuel Alert (%)</label><input className="input" type="number" value={settings.fuelAlert} onChange={(e)=>setSettings({...settings,fuelAlert:+e.target.value})} /></div>
              </div>
            </div>

            <div className="card settings-card" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="card-title" style={{ color: '#f59e0b' }}>🛑 Vehicle Stop Detection (10m Policy)</h3>
                <span className="badge badge-warning">Active Policy</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Vehicles stationary at approximately the same GPS location exceeding this duration will trigger an alert requiring driver explanation.
              </p>
              <div className="settings-section">
                <div className="input-group">
                  <label className="input-label">Prolonged Stop Alert Threshold (Minutes)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="120"
                    value={stopConfig.thresholdMinutes}
                    onChange={(e) => setStopConfig({ ...stopConfig, thresholdMinutes: parseFloat(e.target.value) || 10 })}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Default: 10 minutes (lower e.g. 1 min for fast testing)</span>
                </div>
                <div className="input-group">
                  <label className="input-label">Stationary Speed Cutoff (km/h)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="15"
                    value={stopConfig.speedThresholdKmh}
                    onChange={(e) => setStopConfig({ ...stopConfig, speedThresholdKmh: parseFloat(e.target.value) || 3 })}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>GPS speed below this is treated as stopped (default: 3 km/h)</span>
                </div>
                <div className="input-group">
                  <label className="input-label">GPS Fluctuation / Drift Radius (Meters)</label>
                  <input
                    className="input"
                    type="number"
                    step="5"
                    min="10"
                    max="200"
                    value={stopConfig.driftThresholdMeters}
                    onChange={(e) => setStopConfig({ ...stopConfig, driftThresholdMeters: parseFloat(e.target.value) || 40 })}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Filters satellite jitter while vehicle is parked (default: 40m)</span>
                </div>
                <div className="input-group">
                  <label className="input-label">Disconnected Vehicle Timeout (Minutes)</label>
                  <input
                    className="input"
                    type="number"
                    step="1"
                    min="1"
                    max="60"
                    value={stopConfig.disconnectTimeoutMinutes}
                    onChange={(e) => setStopConfig({ ...stopConfig, disconnectTimeoutMinutes: parseFloat(e.target.value) || 5 })}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Marks vehicle offline if no GPS signal is received (default: 5 min)</span>
                </div>

                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSimulate}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    ⚡ Simulate 12-Minute Stop for Immediate Testing
                  </button>
                  {simMessage && (
                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: simMessage.includes('✅') ? '#10b981' : '#f59e0b', textAlign: 'center' }}>
                      {simMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="card settings-card">
              <h3 className="card-title">🔔 Notifications</h3>
              <div className="settings-section">
                {Object.entries(settings.notifications).map(([key,val])=>(
                  <div key={key} className="setting-row"><div><span className="setting-name">{key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</span><span className="setting-desc">Alert for {key.replace(/([A-Z])/g,' $1').toLowerCase()}</span></div>
                  <button className={`toggle-switch ${val?'active':''}`} onClick={()=>setSettings({...settings,notifications:{...settings.notifications,[key]:!val}})}><span className="toggle-knob"></span></button></div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      {isAdmin && (
        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handleSave}>{saved ? '✅ Saved!' : 'Save Settings'}</button>
          <button className="btn btn-secondary">Reset to Defaults</button>
        </div>
      )}
    </div>
  );
}
