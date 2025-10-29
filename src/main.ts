import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app/app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  // Set timezone for the application
  process.env.TZ = 'Asia/Kolkata';

  const app = await NestFactory.create(AppModule);

  // Configure body parser with larger limits for image uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // CORS configuration for development and production
  const allowedOrigins = [
    'http://localhost:3000', // Local frontend
    'http://localhost:3001', // Local frontend alternative port
    'https://hof-ui-git-main-techdoodle-3947s-projects.vercel.app',
    'https://hof-ui.netlify.app',
    'https://hof-ui.netlify.com',
    'https://app.humansoffootball.in',
    'https://hof-ui-stg.netlify.app',
    'https://hof-python-env-production.up.railway.app',
    'https://admin-stg-hof.netlify.app',
    'https://admin-prod-hof.netlify.app',
    'https://hof-admin.netlify.app',
    '*',
    process.env.FRONTEND_URL, // Production frontend URL from environment
  ].filter(Boolean); // Remove undefined values

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        console.log('Request with no origin - allowing');
        return callback(null, true);
      }

      console.log(`Incoming request from origin: ${origin}`);
      console.log('Allowed origins:', allowedOrigins);

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        console.log(`Origin ${origin} is in allowed list`);
        return callback(null, true);
      }

      // For development, allow localhost variations
      if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
        console.log(`Development mode - allowing localhost origin: ${origin}`);
        return callback(null, true);
      }

      // Allow all origins temporarily for debugging (remove this in production)
      console.log(`Allowing origin temporarily for debugging: ${origin}`);
      return callback(null, true);

      // Uncomment this when you want to restrict origins
      // console.log(`CORS blocked origin: ${origin}`);
      // return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });


  await app.listen(process.env.PORT || 3000);
  console.log(`Server is running on port ${process.env.PORT}`);
}
bootstrap();
