import { AdaptiveGpsPollingEngine } from '../src/tracking/adaptive-gps-polling-engine';
import { MediaUploadSanitizer } from '../src/security/media-upload-sanitizer';

describe('Phase 26 & 28: Adaptive Battery Optimization & EXIF Security Sanitization', () => {
  describe('AdaptiveGpsPollingEngine', () => {
    test('1. Critical Battery Conservation: Shifts to 5s balanced polling when battery < 15%', () => {
      const engine = new AdaptiveGpsPollingEngine();

      const config = engine.evaluateOptimalPolling(
        3.5, // 3.5 m/s running speed
        12,  // 12% battery
        false
      );

      expect(config.powerProfileName).toBe('CRITICAL_BATTERY_CONSERVE');
      expect(config.updateIntervalMs).toBe(5000);
      expect(config.priority).toBe('BALANCED_POWER');
      expect(engine.getCurrentMovementState()).toBe('CRITICAL_BATTERY_CONSERVE');
    });

    test('2. Stationary Eco: Reduces polling frequency after consecutive low-speed ticks', () => {
      const engine = new AdaptiveGpsPollingEngine();

      engine.evaluateOptimalPolling(0.2, 80, false);
      engine.evaluateOptimalPolling(0.1, 80, false);
      const config = engine.evaluateOptimalPolling(0.0, 80, false);

      expect(config.powerProfileName).toBe('STATIONARY_ECO');
      expect(config.updateIntervalMs).toBe(4000);
      expect(engine.getCurrentMovementState()).toBe('STATIONARY');
    });

    test('3. High-Speed Cycling: Demands 1Hz high accuracy updates', () => {
      const engine = new AdaptiveGpsPollingEngine();

      const config = engine.evaluateOptimalPolling(9.5, 80, false); // 34.2 km/h
      expect(config.powerProfileName).toBe('HIGH_SPEED_HIGH_ACCURACY');
      expect(config.updateIntervalMs).toBe(1000);
      expect(config.priority).toBe('HIGH_ACCURACY');
    });
  });

  describe('MediaUploadSanitizer', () => {
    test('1. EXIF Location Stripping: Strips GPS tags and returns clean UUID filename', () => {
      const result = MediaUploadSanitizer.sanitizePhotoUpload({
        filename: 'my_home_finish_photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2500000,
        exifTags: {
          GPSLatitude: 18.94302,
          GPSLongitude: 72.82301,
          GPSAltitude: 15.2,
          CameraSerialNumber: 'SN-982173-PRO'
        }
      });

      expect(result.isAllowed).toBe(true);
      expect(result.hasGpsMetadataStripped).toBe(true);
      expect(result.strippedExifFields).toContain('GPSLatitude');
      expect(result.strippedExifFields).toContain('CameraSerialNumber');
      expect(result.sanitizedFilename).toMatch(/^act_photo_\d+_[a-z0-9]+\.jpg$/);
    });

    test('2. File Size & MIME Type Rejection: Enforces security constraints', () => {
      const oversizeRes = MediaUploadSanitizer.sanitizePhotoUpload({
        filename: 'giant_video.mov',
        mimeType: 'video/quicktime',
        sizeBytes: 25 * 1024 * 1024 // 25 MB
      });

      expect(oversizeRes.isAllowed).toBe(false);
      expect(oversizeRes.rejectionReason).toBe('FILE_SIZE_EXCEEDS_LIMIT');

      const badMimeRes = MediaUploadSanitizer.sanitizePhotoUpload({
        filename: 'script.sh',
        mimeType: 'text/x-shellscript',
        sizeBytes: 500
      });

      expect(badMimeRes.isAllowed).toBe(false);
      expect(badMimeRes.rejectionReason).toBe('UNSUPPORTED_MIME_TYPE');
    });
  });
});
