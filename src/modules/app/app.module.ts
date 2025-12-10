import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from 'src/config/configuration';
import playernationConfig from 'src/config/playernation.config';
import { AppController } from './app.controller';
import { ImageProxyController } from './image-proxy.controller';
import { AppService } from './app.service';
import { AuthModule } from '../auth/auth.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UserModule } from '../user/user.module';
import { FootballTeamsModule } from '../football-teams/football-teams.module';
import { CitiesModule } from '../cities/cities.module';
import { VenueModule } from '../venue/venue.module';
import { MatchesModule } from '../matches/matches.module';
import { MatchParticipantsModule } from '../match-participants/match-participants.module';
import { MatchParticipantStatsModule } from '../match-participant-stats/match-participant-stats.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { MatchTypesModule } from '../match-types/match-types.module';
import { NotificationModule } from '../notification/notification.module';
import { BookingModule } from '../booking/booking.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, playernationConfig],
      envFilePath: ['.env'],
      cache: false,
      expandVariables: true,
      ignoreEnvFile: false,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url') || config.get<string>('DB_URL'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize') ?? false,
        migrationsRun: config.get<boolean>('database.migrationsRun') ?? true,
        logging: config.get<any>('database.logging') ?? ['error'],

        // Connection pool configuration
        poolSize: 20,  // Maximum number of connections in pool

        // Connection timeout settings
        connectTimeoutMS: 5000,  // 5 seconds to establish connection

        extra: {
          timezone: 'Asia/Kolkata',

          // PostgreSQL-specific timeout settings
          // These prevent stuck transactions from holding locks indefinitely
          statement_timeout: 30000,  // 30 seconds - kills long-running queries
          idle_in_transaction_session_timeout: 60000,  // 1 minute - kills idle transactions

          // TCP keepalive settings - detects dead connections quickly
          tcp_keepalives_idle: 30,        // 30 seconds before first keepalive probe
          tcp_keepalives_interval: 10,    // 10 seconds between keepalive probes
          tcp_keepalives_count: 3,        // 3 failed probes = connection dead
          // Total dead connection detection: 30 + (10 * 3) = 60 seconds

          // Connection lifetime management
          connectionTimeoutMillis: 5000,  // 5 seconds waiting for connection from pool
          idleTimeoutMillis: 30000,       // 30 seconds - release idle connections
        },

        ssl: {
          rejectUnauthorized: false, // Railway requires SSL
        },
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 200,
        },
      ],
    }),
    AuthModule,
    UserModule,
    FootballTeamsModule,
    CitiesModule,
    VenueModule,
    MatchesModule,
    MatchParticipantsModule,
    MatchParticipantStatsModule,
    MatchTypesModule,
    AdminModule,
    NotificationModule,
    BookingModule,
    WaitlistModule,
    LeaderboardModule,
    PromoCodesModule,
  ],
  controllers: [AppController, ImageProxyController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
