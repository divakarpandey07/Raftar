import Foundation
import HealthKit

@objc public class HealthKitBridge: NSObject {

    public static let shared = HealthKitBridge()
    private let healthStore = HKHealthStore()

    public func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, nil)
            return
        }

        let typesToRead: Set<HKObjectType> = [
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
            HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKQuantityType.quantityType(forIdentifier: .distanceCycling)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
        ]

        let typesToWrite: Set<HKSampleType> = [
            HKWorkoutType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .heartRate)!
        ]

        healthStore.requestAuthorization(toShare: typesToWrite, read: typesToRead) { success, error in
            completion(success, error)
        }
    }

    public func saveCompletedWorkout(
        activityType: HKWorkoutActivityType,
        startDate: Date,
        endDate: Date,
        distanceMeters: Double,
        activeCaloriesKcal: Double,
        completion: @escaping (Bool, Error?) -> Void
    ) {
        let distanceQuantity = HKQuantity(unit: .meter(), doubleValue: distanceMeters)
        let energyQuantity = HKQuantity(unit: .kilocalorie(), doubleValue: activeCaloriesKcal)

        let workout = HKWorkout(
            activityType: activityType,
            start: startDate,
            end: endDate,
            workoutEvents: nil,
            totalEnergyBurned: energyQuantity,
            totalDistance: distanceQuantity,
            device: HKDevice.local(),
            metadata: [HKMetadataKeyIndoorWorkout: false]
        )

        healthStore.save(workout) { success, error in
            completion(success, error)
        }
    }
}
