import {
  WeatherCondition,
  ActivityEnvironmentalSnapshot,
  EnvironmentalStrainCategory
} from './types';

export class EnvironmentalTelemetryEngine {
  /**
   * Calculates Rothfusz / NOAA Heat Index in Celsius.
   */
  static calculateHeatIndexCelsius(tempCelsius: number, relativeHumidityPct: number): number {
    if (tempCelsius < 26.7) {
      return tempCelsius; // Heat index formula only valid for temperatures >= 80°F (26.7°C)
    }

    const T = (tempCelsius * 9) / 5 + 32; // to Fahrenheit
    const R = relativeHumidityPct;

    const c1 = -42.379;
    const c2 = 2.04901523;
    const c3 = 10.14333127;
    const c4 = -0.22475541;
    const c5 = -0.00683783;
    const c6 = -0.05481717;
    const c7 = 0.00122874;
    const c8 = 0.00085282;
    const c9 = -0.00000199;

    let hiF =
      c1 +
      c2 * T +
      c3 * R +
      c4 * T * R +
      c5 * T * T +
      c6 * R * R +
      c7 * T * T * R +
      c8 * T * R * R +
      c9 * T * T * R * R;

    const hiC = ((hiF - 32) * 5) / 9;
    return Math.round(hiC * 10) / 10;
  }

  /**
   * Evaluates overall athletic environmental strain.
   */
  static assessStrain(weather: WeatherCondition): {
    strainCategory: EnvironmentalStrainCategory;
    apparentTemp: number;
    coachingNote: string;
  } {
    const heatIndex = this.calculateHeatIndexCelsius(
      weather.temperatureCelsius,
      weather.relativeHumidityPercent
    );

    // 1. Hazardous Air Quality Guard
    if (weather.aqiUsEpa && weather.aqiUsEpa >= 150) {
      return {
        strainCategory: 'HAZARDOUS_AIR_QUALITY',
        apparentTemp: heatIndex,
        coachingNote: `AQI ${weather.aqiUsEpa} is in unhealthy range. Elevated respiratory and cardiovascular effort observed.`
      };
    }

    // 2. High Heat Strain Guard (> 38°C apparent temperature)
    if (heatIndex >= 38.0) {
      return {
        strainCategory: 'HIGH_HEAT_STRAIN',
        apparentTemp: heatIndex,
        coachingNote: `High thermal strain (apparent temp ${heatIndex}°C, humidity ${weather.relativeHumidityPercent}%). Internal HR drift expected due to thermoregulation.`
      };
    }

    // 3. Moderate Strain (32°C - 38°C apparent temp or cold < 0°C)
    if (heatIndex >= 32.0) {
      return {
        strainCategory: 'MODERATE_STRAIN',
        apparentTemp: heatIndex,
        coachingNote: `Warm conditions (${heatIndex}°C apparent). Mild cardiac drift possible over extended duration.`
      };
    }

    if (weather.temperatureCelsius < 0.0) {
      return {
        strainCategory: 'HIGH_COLD_STRAIN',
        apparentTemp: weather.temperatureCelsius,
        coachingNote: `Freezing ambient temperatures (${weather.temperatureCelsius}°C). Peripheral vasoconstriction and higher initial aerobic warm-up cost.`
      };
    }

    return {
      strainCategory: 'OPTIMAL',
      apparentTemp: heatIndex,
      coachingNote: 'Optimal environmental conditions for athletic performance.'
    };
  }

  /**
   * Creates an immutable environmental snapshot for an activity.
   */
  static createSnapshot(
    activityId: string,
    startWeather: WeatherCondition,
    endWeather?: WeatherCondition
  ): ActivityEnvironmentalSnapshot {
    const assessment = this.assessStrain(startWeather);

    const avgApparent = endWeather
      ? Math.round(
          ((assessment.apparentTemp +
            this.calculateHeatIndexCelsius(
              endWeather.temperatureCelsius,
              endWeather.relativeHumidityPercent
            )) /
            2) *
            10
        ) / 10
      : assessment.apparentTemp;

    return {
      activityId,
      startWeather,
      endWeather,
      averageApparentTemperature: avgApparent,
      environmentalStrain: assessment.strainCategory,
      heatStrainIndex: assessment.apparentTemp >= 26.7 ? assessment.apparentTemp : undefined,
      aiCoachingContextNote: assessment.coachingNote,
      recordedAt: Date.now()
    };
  }
}
