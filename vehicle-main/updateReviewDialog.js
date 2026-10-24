const fs = require('fs');
const filePath = 'C:/Users/Joker/Desktop/vehicleeeee/vehicle-main/client/src/components/stops/AdminStopReviewDialog.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const target = `{stop.location?.lat && (
              <Typography variant="body2" sx={{ gridColumn: 'span 2', color: 'text.secondary' }}>
                📍 Coordinates: {stop.location.lat.toFixed(4)}, {stop.location.lng.toFixed(4)}
              </Typography>
            )}`;

const replacement = `{stop.location?.lat && (
              <Box sx={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  📍 Coordinates: {stop.location.lat.toFixed(4)}, {stop.location.lng.toFixed(4)}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  onClick={() => {
                    onClose();
                    window.location.href = \`/tracking?vehicleId=\${stop.vehicleId?._id || stop.vehicleId}&stopLat=\${stop.location.lat}&stopLng=\${stop.location.lng}&stopped=true\`;
                  }}
                  sx={{ textTransform: 'none', py: 0.2, px: 1, fontSize: '0.72rem' }}
                >
                  🗺️ View on Map
                </Button>
              </Box>
            )}`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
  const updated = normalizedContent.replace(normalizedTarget, normalizedReplacement);
  fs.writeFileSync(filePath, updated.replace(/\n/g, '\r\n'), 'utf8');
  console.log('✅ AdminStopReviewDialog.jsx updated successfully!');
} else {
  console.log('Target not found in AdminStopReviewDialog.jsx');
}
