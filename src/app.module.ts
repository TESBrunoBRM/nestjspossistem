import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FiscalModule } from './fiscal/fiscal.module';
import { FiscalPollingModule } from './fiscal-polling/fiscal-polling.module';
import { FiscalDocumentsModule } from './fiscal-documents/fiscal-documents.module';
import { FiscalRvdModule } from './fiscal-rvd/fiscal-rvd.module';
import { FiscalCafAcquisitionModule } from './fiscal-caf-acquisition/fiscal-caf-acquisition.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { SecurityInterceptor } from './common/interceptors/security.interceptor';

@Module({
  imports: [
    // Variables de entorno (.env) disponibles globalmente
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    // Previsualización HTML en http://localhost:3000/
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*splat}'],
    }),
    // Limitador de peticiones para prevenir ataques (100 peticiones cada 60 seg)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    // Motor fiscal nativo basado exclusivamente en sii-engine
    FiscalModule,
    FiscalPollingModule,
    FiscalDocumentsModule,
    FiscalRvdModule,
    FiscalCafAcquisitionModule,
  ],
  controllers: [AppController],

  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SecurityInterceptor,
    },
  ],
})
export class AppModule {}
