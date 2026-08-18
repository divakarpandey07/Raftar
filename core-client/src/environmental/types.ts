export type EnvironmentalStrainCategory =
  | 'OPTIMAL'
  | 'MODERATE_STRAIN'
  | 'HIGH_HEAT_STRAIN'
  | 'HIGH_COLD_STRAIN'
  | 'HAZARDOUS_AIR_QUALITY';

export interface WeatherCondition {
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  relativeHumidityPercent: number;
  windSpeedMps: number;
  windDirectionDegrees: number;
  atmosphericPressureHpa?: number;
  aqiUsEpa?: number;
  weatherCode: string; // e.g. "CLEAR", "RAIN", "HIGH_WIND", "SMOG"
}

export interface ActivityEnvironmentalSnapshot {
  activityId: string;
  startWeather: WeatherCondition;
  endWeather?: WeatherCondition;
  averageApparentTemperature: number;
  environmentalStrain: EnvironmentalStrainCategory;
  heatStrainIndex?: number;
  aiCoachingContextNote?: string;
  recordedAt: number;
}
