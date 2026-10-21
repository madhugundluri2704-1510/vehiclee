import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import { stopApi } from '../../services/api';

export default function AdminStopReviewDialog({ open, onClose, stop, onSuccess }) {
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!stop) return null;

  const handleAction = async (status) => {
    setLoading(true);
    setError('');
    try {
      await stopApi.reviewExplanation(stop._id, { status, remarks });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${status} explanation.`);
    } finally {
      setLoading(false);
    }
  };

  const durationMins = stop.durationMinutes || Math.round((Date.now() - new Date(stop.startTime).getTime()) / 60000);
  const explanation = stop.explanation || {};
  const review = stop.review || {};

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span>📋</span> Review Stop Explanation
        </Box>
        <Chip
          label={review.status ? review.status.toUpperCase() : 'PENDING'}
          color={review.status === 'approved' ? 'success' : review.status === 'rejected' ? 'error' : 'warning'}
          size="small"
          sx={{ fontWeight: 700 }}
        />
      </DialogTitle>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {review.status && review.status !== 'pending' && (
          <Alert
            severity={review.status === 'approved' ? 'success' : 'error'}
            sx={{ mb: 2, fontWeight: 600 }}
          >
            ⏹️ Stop timer stopped! This incident was <strong>{review.status.toUpperCase()}</strong> by {review.reviewedByName || 'Admin'} on {review.reviewedAt ? new Date(review.reviewedAt).toLocaleString('en-IN') : 'N/A'}. Final recorded duration: <strong>{stop.finalDurationMinutes != null ? stop.finalDurationMinutes : (stop.durationMinutes || 0)} minutes</strong>.
          </Alert>
        )}

        {/* Vehicle & Stop Summary */}
        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.1)' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Vehicle Information
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
            <Typography variant="body2"><strong>Vehicle:</strong> {stop.vehicleNumber}</Typography>
            <Typography variant="body2"><strong>Driver:</strong> {stop.driverName} {stop.driverPhone ? `(${stop.driverPhone})` : ''}</Typography>
            <Typography variant="body2"><strong>Zone:</strong> {stop.cleaningZone || 'Zone 1'}</Typography>
            <Typography variant="body2">
              <strong>Duration:</strong>{' '}
              <Chip
                size="small"
                color={durationMins >= 15 ? 'error' : 'warning'}
                label={`${durationMins} minutes`}
                sx={{ fontWeight: 600 }}
              />
            </Typography>
            <Typography variant="body2" sx={{ gridColumn: 'span 2' }}>
              <strong>Stop Window:</strong> {new Date(stop.startTime).toLocaleString('en-IN')}{' '}
              {stop.endTime ? `to ${new Date(stop.endTime).toLocaleTimeString('en-IN')}` : '(Ongoing)'}
            </Typography>
            {stop.location?.lat && (
              <Typography variant="body2" sx={{ gridColumn: 'span 2', color: 'text.secondary' }}>
                📍 Coordinates: {stop.location.lat.toFixed(4)}, {stop.location.lng.toFixed(4)}
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Driver's Submitted Explanation */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <span>💬</span> Driver's Submission
          </Typography>

          {explanation.reason ? (
            <Box sx={{ p: 2, bgcolor: 'rgba(5, 150, 105, 0.08)', borderRadius: 1.5, border: '1px solid rgba(5, 150, 105, 0.2)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Reason:</Typography>
                <Chip
                  label={explanation.reason.toUpperCase()}
                  color="primary"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              </Box>

              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Details:</strong> {explanation.details || 'No additional text provided.'}
              </Typography>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Submitted by <strong>{explanation.driverName || stop.driverName}</strong> on{' '}
                {explanation.submittedAt ? new Date(explanation.submittedAt).toLocaleString('en-IN') : 'N/A'}
              </Typography>
            </Box>
          ) : (
            <Alert severity="warning">
              No explanation has been submitted by the driver yet.
            </Alert>
          )}
        </Box>

        {/* Previous Review Remarks if any */}
        {review.reviewedByName && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Previously reviewed by <strong>{review.reviewedByName}</strong> on{' '}
              {review.reviewedAt ? new Date(review.reviewedAt).toLocaleString('en-IN') : ''}
              {review.remarks && ` - Remarks: "${review.remarks}"`}
            </Typography>
          </Box>
        )}

        {/* Supervisor Remarks Input */}
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Supervisor / Admin Remarks"
          placeholder="Optional remarks (e.g. Approved due to verified traffic jam / Rejected: unnecessary halt)..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          Close
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            color="error"
            disabled={loading || !explanation.reason}
            onClick={() => handleAction('rejected')}
            sx={{ fontWeight: 600 }}
          >
            {loading ? 'Processing...' : '✕ Reject Explanation'}
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={loading || !explanation.reason}
            onClick={() => handleAction('approved')}
            sx={{ fontWeight: 600 }}
          >
            {loading ? 'Processing...' : '✓ Approve Explanation'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
