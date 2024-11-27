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
        const httpsAgent = new https.Agent({
          cert: apiConfigService.getClientCert(),
          key: apiConfigService.getClientKey(),
        });

        const schema = join(__dirname, '../assets/axelar-gmp-api.schema.yaml');
        const doc = yaml.load(readFileSync(schema, 'utf8')) as Document;

        const api = new OpenAPIClientAxios({
          definition: doc,
          axiosConfigDefaults: {
            httpsAgent,
            timeout: 30_000,
          },
        });
        api.withServer({ url: apiConfigService.getAxelarGmpApiUrl() });

        await api.init();

        return await api.getClient<AxelarGmpApiClient>();
      },
      inject: [ApiConfigService],
    },
  ],
  exports: [AxelarGmpApi],
})
export class ApiModule {}
