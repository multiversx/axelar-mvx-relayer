import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ApiConfigModule, ApiConfigService } from '@mvx-monorepo/common';
import { join } from 'path';
import { PROVIDER_KEYS } from '@mvx-monorepo/common/utils/provider.enum';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { protobufPackage } from '@mvx-monorepo/common/grpc/entities/relayer';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PROVIDER_KEYS.AXELAR_GRPC_CLIENT,
        imports: [ApiConfigModule],
        useFactory: (apiConfigService: ApiConfigService) => {
          return {
            transport: Transport.GRPC,
            options: {
              package: protobufPackage,
              protoPath: join(__dirname, '../assets/relayer.proto'),
              url: apiConfigService.getAxelarApiUrl(),
            },
          };
        },
        inject: [ApiConfigService],
      },
    ]),
  ],
  providers: [GrpcService],
  exports: [GrpcService],
})
export class GrpcModule {}
