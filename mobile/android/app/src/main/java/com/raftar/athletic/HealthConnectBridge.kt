package com.raftar.athletic

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.units.*
import java.time.Instant
import java.time.ZoneOffset

class HealthConnectBridge(private val context: Context) {

    private val healthConnectClient: HealthConnectClient? by lazy {
        if (HealthConnectClient.isProviderAvailable(context)) {
            HealthConnectClient.getOrCreate(context)
        } else null
    }

    val requiredPermissions = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
    )

    suspend fun insertCompletedWorkout(
        title: String,
        exerciseType: Int,
        startTime: Instant,
        endTime: Instant,
        distanceMeters: Double,
        activeCaloriesKcal: Double,
        heartRateSamples: List<Pair<Instant, Long>>
    ): Boolean {
        val client = healthConnectClient ?: return false

        val records = mutableListOf<Record>()

        // 1. Exercise Session Record
        val sessionRecord = ExerciseSessionRecord(
            startTime = startTime,
            startZoneOffset = ZoneOffset.UTC,
            endTime = endTime,
            endZoneOffset = ZoneOffset.UTC,
            exerciseType = exerciseType,
            title = title
        )
        records.add(sessionRecord)

        // 2. Distance Record
        if (distanceMeters > 0) {
            records.add(
                DistanceRecord(
                    startTime = startTime,
                    startZoneOffset = ZoneOffset.UTC,
                    endTime = endTime,
                    endZoneOffset = ZoneOffset.UTC,
                    distance = Length.meters(distanceMeters)
                )
            )
        }

        // 3. Active Calories Burned Record
        if (activeCaloriesKcal > 0) {
            records.add(
                ActiveCaloriesBurnedRecord(
                    startTime = startTime,
                    startZoneOffset = ZoneOffset.UTC,
                    endTime = endTime,
                    endZoneOffset = ZoneOffset.UTC,
                    energy = Energy.kilocalories(activeCaloriesKcal)
                )
            )
        }

        // 4. Heart Rate Time Series Record
        if (heartRateSamples.isNotEmpty()) {
            val samples = heartRateSamples.map { (time, bpm) ->
                HeartRateRecord.Sample(time, bpm)
            }
            records.add(
                HeartRateRecord(
                    startTime = startTime,
                    startZoneOffset = ZoneOffset.UTC,
                    endTime = endTime,
                    endZoneOffset = ZoneOffset.UTC,
                    samples = samples
                )
            )
        }

        return try {
            client.insertRecords(records)
            true
        } catch (e: Exception) {
            false
        }
    }
}
