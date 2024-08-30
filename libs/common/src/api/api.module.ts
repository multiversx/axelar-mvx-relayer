import { Module } from '@nestjs/common';
import { ApiConfigService, DatabaseModule } from '@mvx-monorepo/common';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import * as https from 'https';
import { join } from 'path';
import { Client as AxelarGmpApiClient } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { Document, OpenAPIClientAxios } from 'openapi-client-axios';

@Module({
  imports: [DatabaseModule],
  providers: [
    AxelarGmpApi,
    {
      provide: ProviderKeys.AXELAR_GMP_API_CLIENT,
      useFactory: async (apiConfigService: ApiConfigService) => {
        // TODO: Use proper values here
        const httpsAgent = new https.Agent({
          // TODO: Add TLS support
          // cert: fs.readFileSync('client.crt'),
          // key: fs.readFileSync('client.key'),
          // ca: fs.readFileSync('ca.crt'),
        });

        const schema = join(__dirname, '../assets/axelar-gmp-api.schema.yaml');
        const doc = yaml.load(readFileSync(schema, 'utf8')) as Document;

        const api = new OpenAPIClientAxios({
          definition: doc,
          axiosConfigDefaults: {
            url: apiConfigService.getAxelarGmpApiUrl(),
            httpsAgent,
            timeout: 30_000,
          },
        });
        await api.init();

        return api.getClient<AxelarGmpApiClient>();
      },
      inject: [ApiConfigService],
    },
  ],
  exports: [AxelarGmpApi],
})
export class ApiModule {}
