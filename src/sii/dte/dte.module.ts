import { Module } from '@nestjs/common';
import { DteArtifactsModule } from './artifacts/artifacts.module';
import { DteDispatchModule } from './dispatch/dispatch.module';
import { DteGenerationModule } from './generation/generation.module';
import { DteQueriesModule } from './queries/queries.module';

@Module({
  imports: [
    DteGenerationModule,
    DteDispatchModule,
    DteQueriesModule,
    DteArtifactsModule,
  ],
})
export class DteModule {}