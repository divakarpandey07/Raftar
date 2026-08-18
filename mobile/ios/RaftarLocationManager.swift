import Foundation
import CoreLocation

@objc public class RaftarLocationManager: NSObject, CLLocationManagerDelegate {

    public static let shared = RaftarLocationManager()

    private let locationManager = CLLocationManager()
    private var isTracking = false
    public var onLocationUpdate: ((CLLocation) -> Void)?

    override private init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.activityType = .fitness
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = true
    }

    public func requestPermissions() {
        locationManager.requestAlwaysAuthorization()
    }

    public func startWorkoutTracking() {
        guard !isTracking else { return }
        isTracking = true
        locationManager.startUpdatingLocation()
    }

    public func pauseTracking() {
        locationManager.stopUpdatingLocation()
    }

    public func resumeTracking() {
        locationManager.startUpdatingLocation()
    }

    public func stopWorkoutTracking() {
        isTracking = false
        locationManager.stopUpdatingLocation()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            // Forward to React Native / Native JS Engine
            onLocationUpdate?(loc)
        }
    }
}
