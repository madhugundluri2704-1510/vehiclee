import { useState, useEffect } from 'react';
import useWorkforceStore from '../store/useWorkforceStore';
import useDriverStore from '../store/useDriverStore';
import useVehicleStore from '../store/useVehicleStore';
import { FaUserCheck, FaUserSlash, FaCoffee, FaMapMarkerAlt, FaSearch } from 'react-icons/fa';
import './AttendanceDashboardPage.css';

export default function AttendanceDashboardPage() {
  const { drivers, fetchDrivers } = useDriverStore();
  const { vehicles, fetchVehicles } = useVehicleStore();
  const {
    attendanceLogs,
    loading,
    error,
    fetchTodayAttendance,
    checkInDriver,
    checkOutDriver,
    toggleDriverBreak,
    clearError
  } = useWorkforceStore();

  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [gpsLocation, setGpsLocation] = useState({ lat: 15.8281, lng: 78.0373 });
  const [detectingGps, setDetectingGps] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkoutDriverId, setCheckoutDriverId] = useState('');
  const [activeTab, setActiveTab] = useState('check-in'); // 'check-in', 'check-out', 'break'

  useEffect(() => {
    fetchTodayAttendance();
    fetchDrivers({ limit: 100 });
    fetchVehicles();
  }, []);

  const detectLocation = () => {
    setDetectingGps(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLocation({
            lat: Math.round(position.coords.latitude * 4) / 4 || 15.8281,
            lng: Math.round(position.coords.longitude * 4) / 4 || 78.0373
          });
          setDetectingGps(false);
        },
        () => {
          // Fallback with small random offset around Kurnool
          setGpsLocation({
            lat: 15.8281 + (Math.random() - 0.5) * 0.01,
            lng: 78.0373 + (Math.random() - 0.5) * 0.01
          });
          setDetectingGps(false);
        }
      );
    } else {
      setDetectingGps(false);
    }
  };

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedDriverId || !selectedVehicleId) return;
    try {
      await checkInDriver({
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId,
        latitude: gpsLocation.lat,
        longitude: gpsLocation.lng
      });
      setSelectedDriverId('');
      setSelectedVehicleId('');
      alert('Driver checked in successfully!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCheckOut = async (e) => {
    e.preventDefault();
    if (!checkoutDriverId) return;
    try {
      await checkOutDriver({
        driverId: checkoutDriverId,
        latitude: gpsLocation.lat,
        longitude: gpsLocation.lng
      });
      setCheckoutDriverId('');
      alert('Driver checked out successfully!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleBreak = async (driverId, action) => {
    try {
      await toggleDriverBreak({
        driverId,
        action,
        latitude: gpsLocation.lat,
        longitude: gpsLocation.lng
      });
      alert(`Driver break ${action === 'start' ? 'started' : 'ended'} successfully.`);
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter lists - exclude only drivers and vehicles currently on active duty shift
  const activeDriverIds = attendanceLogs
    .filter(log => !log.checkOut && log.status !== 'Absent')
    .map(log => (log.driverId?._id || log.driverId)?.toString())
    .filter(Boolean);

  const activeVehicleIds = attendanceLogs
    .filter(log => !log.checkOut && log.status !== 'Absent')
    .map(log => (log.assignedVehicle?._id || log.assignedVehicle)?.toString())
    .filter(Boolean);

  const availableDrivers = drivers.filter(d => !activeDriverIds.includes(d._id?.toString()));
  const availableVehicles = vehicles.filter(v => !activeVehicleIds.includes(v._id?.toString()) && v.status !== 'maintenance');

  const currentlyOnShift = attendanceLogs.filter(log => !log.checkOut && log.status !== 'Absent');

  const filteredLogs = attendanceLogs.filter(log => 
    log.driverId?.driverName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.assignedVehicle?.vehicleNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="attendance-page container">
      {error && (
        <div className="alert-banner error">
          <span>⚠️ {error}</span>
          <button className="close-alert-btn" onClick={clearError}>&times;</button>
        </div>
      )}

      <div className="attendance-grid">
        {/* Left Side: Actions Console */}
        <div className="card console-card">
          <div className="console-tabs">
            <button 
              className={`console-tab ${activeTab === 'check-in' ? 'active' : ''}`}
              onClick={() => setActiveTab('check-in')}
            >
              <FaUserCheck /> Check-In
            </button>
            <button 
              className={`console-tab ${activeTab === 'check-out' ? 'active' : ''}`}
              onClick={() => setActiveTab('check-out')}
            >
              <FaUserSlash /> Check-Out
            </button>
            <button 
              className={`console-tab ${activeTab === 'break' ? 'active' : ''}`}
              onClick={() => setActiveTab('break')}
            >
              <FaCoffee /> Breaks
            </button>
          </div>

          <div className="console-body">
            {/* GPS Capture section (Used for all actions) */}
            <div className="gps-section">
              <span className="gps-title"><FaMapMarkerAlt /> Supervisor Location Capture</span>
              <div className="gps-coords">
                <span>Lat: <strong>{gpsLocation.lat.toFixed(4)}</strong></span>
                <span>Lng: <strong>{gpsLocation.lng.toFixed(4)}</strong></span>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={detectLocation}
                disabled={detectingGps}
              >
                {detectingGps ? 'Detecting...' : 'Refresh GPS Coordinate'}
              </button>
            </div>

            {activeTab === 'check-in' && (
              <form onSubmit={handleCheckIn} className="console-form">
                <h3>Digital Shift Check-In</h3>
                
                <div className="input-group">
                  <label className="input-label">Select Driver</label>
                  <select 
                    className="select"
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Operator --</option>
                    {availableDrivers.map(d => (
                      <option key={d._id} value={d._id}>
                        {d.driverName} ({d.shiftTime} shift - Score: {d.performanceScore})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Assign Vehicle</label>
                  <select 
                    className="select"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Sanitation Vehicle --</option>
                    {availableVehicles.map(v => (
                      <option key={v._id} value={v._id}>
                        {v.vehicleNumber} - {v.vehicleType} ({v.cleaningZone})
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary w-full"
                  disabled={loading || !selectedDriverId || !selectedVehicleId}
                >
                  Confirm Shift Check-In
                </button>
              </form>
            )}

            {activeTab === 'check-out' && (
              <form onSubmit={handleCheckOut} className="console-form">
                <h3>Digital Shift Check-Out</h3>

                <div className="input-group">
                  <label className="input-label">Select On-Duty Driver</label>
                  <select 
                    className="select"
                    value={checkoutDriverId}
                    onChange={(e) => setCheckoutDriverId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Operator --</option>
                    {currentlyOnShift.map(log => (
                      <option key={log._id} value={log.driverId?._id}>
                        {log.driverId?.driverName} (Vehicle: {log.assignedVehicle?.vehicleNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-danger w-full"
                  disabled={loading || !checkoutDriverId}
                >
                  Record Shift Check-Out
                </button>
              </form>
            )}

            {activeTab === 'break' && (
              <div className="console-form">
                <h3>Break Control Room</h3>
                {currentlyOnShift.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-state-icon">👷</span>
                    <p className="empty-state-text">No active drivers on duty right now.</p>
                  </div>
                ) : (
                  <div className="break-grid">
                    {currentlyOnShift.map(log => {
                      const isBreak = log.driverId?.status === 'Break';
                      return (
                        <div key={log._id} className="break-row card">
                          <div className="break-row-info">
                            <strong>{log.driverId?.driverName}</strong>
                            <span>{log.assignedVehicle?.vehicleNumber}</span>
                          </div>
                          <button
                            className={`btn btn-sm ${isBreak ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => handleToggleBreak(log.driverId?._id, isBreak ? 'end' : 'start')}
                          >
                            {isBreak ? 'Resume Work' : 'Take Break'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Shift logs table */}
        <div className="card logs-card">
          <div className="card-header">
            <h2 className="card-title">Today's Shift Attendance Roster</h2>
            <div className="search-bar">
              <FaSearch className="search-icon" />
              <input 
                type="text" 
                className="input" 
                placeholder="Search driver or vehicle..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="data-table-wrapper">
            {loading ? (
              <div className="loading-overlay">
                <div className="spinner"></div>
                <p>Loading attendance records...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📋</span>
                <p className="empty-state-text">No attendance logs matches the query.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>Shift</th>
                    <th>Vehicle</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Working Hours</th>
                    <th>Break Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const checkInTime = new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const checkOutTime = log.checkOut 
                      ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Active';

                    return (
                      <tr key={log._id}>
                        <td>
                          <strong>{log.driverId?.driverName || 'Operator'}</strong>
                        </td>
                        <td>{log.driverId?.shiftTime ? <span className="shift-pill">{log.driverId.shiftTime}</span> : '-'}</td>
                        <td>{log.assignedVehicle?.vehicleNumber || 'None'}</td>
                        <td>{checkInTime}</td>
                        <td>
                          <span className={log.checkOut ? '' : 'live-active'}>
                            {checkOutTime}
                          </span>
                        </td>
                        <td>
                          {log.checkOut ? `${log.totalHours.toFixed(1)} hrs` : 'Calculating...'}
                          {log.overtime > 0 && <span className="overtime-tag">+{log.overtime.toFixed(1)} OT</span>}
                        </td>
                        <td>{log.breakTime ? `${log.breakTime.toFixed(1)} hrs` : '0.0 hrs'}</td>
                        <td>
                          <span className={`badge badge-${log.status.toLowerCase()}`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
