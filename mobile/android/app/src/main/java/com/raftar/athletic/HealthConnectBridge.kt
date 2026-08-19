package com.raftar.athletic

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.*
import java.time.Instant
import java.time.ZoneOffset

class HealthConnectBridge(private val context: Context) {

    private val healthConnectClient: HealthConnectClient? by lazy {
        try {
            if (HealthConnectClient.isProviderAvailable(context)) {
                HealthConnectClient.getOrCreate(context)
            } else null
        } catch (e: Exception) {
            null
        }
    }

    val requiredPermissions = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class)
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
            title = title,
            notes = null,
            metadata = Metadata.manualEntry()
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
                    distance = Length.meters(distanceMeters),
                    metadata = Metadata.manualEntry()
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
                    energy = Energy.kilocalories(activeCaloriesKcal),
                    metadata = Metadata.manualEntry()
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
                    samples = samples,
                    metadata = Metadata.manualEntry()
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
