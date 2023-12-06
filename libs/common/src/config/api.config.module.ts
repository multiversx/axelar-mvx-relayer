import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiConfigService } from './api.config.service';
import configuration from '../../../../config/configuration';

@Global()
@Module({
  imports: [ConfigModule.forRoot({
    load: [configuration],
    ignoreEnvFile: true,
    ignoreEnvVars: true,
    cache: true,
  })],
  providers: [ApiConfigService],
  exports: [ApiConfigService],
})
export class ApiConfigModule {}
