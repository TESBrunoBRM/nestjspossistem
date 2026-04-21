import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SiiModule } from './sii/sii.module';

@Module({
  imports: [
    // Variables de entorno (.env) disponibles globalmente
    ConfigModule.forRoot({ isGlobal: true }),
    // Previsualización HTML en http://localhost:3000/
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/(.*)'],
    }),
    // Módulo SII — Integración SimpleAPI para boletas y facturas
    SiiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
