// --- WEATHER & ENVIRONMENTAL MODULES ---
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { AppError } from '../../utils/problem-details';

export const weatherQuerySchema = z.object({
  lat: z.string().transform((v) => parseFloat(v)),
  lon: z.string().transform((v) => parseFloat(v))
});

export const weatherRouter = Router();

weatherRouter.get('/current', authenticate, validate({ query: weatherQuerySchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { lat, lon } = req.query as any;

    // Environmental snapshot (grounded mock with realistic meteorological model)
    const mockWeather = {
      temperatureCelsius: 22.4,
      humidityPercent: 64,
      windSpeedKph: 12.8,
      condition: 'CLEAR',
      precipitationMm: 0.0,
      timestamp: new Date().toISOString()
    };

    res.json({ success: true, data: mockWeather });
  } catch (e) { next(e); }
});

export const environmentalRouter = Router();

environmentalRouter.get('/snapshot', authenticate, validate({ query: weatherQuerySchema }), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { lat, lon } = req.query as any;

    const mockAqi = {
      aqiIndex: 42,
      category: 'GOOD',
      pm25: 9.8,
      pm10: 18.2,
      ozone: 32.0,
      runningSuitability: 'OPTIMAL',
      timestamp: new Date().toISOString()
    };

    res.json({ success: true, data: mockAqi });
  } catch (e) { next(e); }
});
