import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from 'src/config/configuration';
import { AppController } from './app.controller';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
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
        extra: {
          timezone: 'Asia/Kolkata',
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
          limit: 20,
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

  ],
})
export class AppModule { }
