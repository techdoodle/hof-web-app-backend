import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app/app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure body parser with larger limits for image uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // CORS configuration for development and production
  const allowedOrigins = [
    'http://localhost:3000', // Local frontend
    'http://localhost:3001', // Local frontend alternative port
    'https://hof-ui-git-main-techdoodle-3947s-projects.vercel.app',
    'https://hof-ui.netlify.app/',
    process.env.FRONTEND_URL, // Production frontend URL
  ].filter(Boolean); // Remove undefined values

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // For development, allow localhost variations
      if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
        return callback(null, true);
      }
      
      console.log(`CORS blocked origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });
  
  await app.listen(process.env.PORT || 3000); 
  console.log(`Server is running on port ${process.env.PORT}`);
}
bootstrap();
