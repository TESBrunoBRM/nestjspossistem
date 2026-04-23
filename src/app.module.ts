import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SiiModule } from './sii/sii.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // Variables de entorno (.env) disponibles globalmente
    ConfigModule.forRoot({ isGlobal: true }),
    // Previsualización HTML en http://localhost:3000/
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*splat}'],
    }),
    // Limitador de peticiones para prevenir ataques (100 peticiones cada 60 seg)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    // Módulo SII — Integración SimpleAPI para boletas y facturas
    SiiModule,
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
export class AppModule {}
