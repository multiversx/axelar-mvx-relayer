import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PROVIDER_KEYS } from '@mvx-monorepo/common/utils/provider.enum';
import { ClientGrpc } from '@nestjs/microservices';
import { ContractCallEvent } from '@prisma/client';
import { Relayer, VerifyRequest } from '@mvx-monorepo/common/grpc/entities/relayer';
import { firstValueFrom, ReplaySubject } from 'rxjs';

const RELAYER_SERVICE = 'Relayer';

@Injectable()
export class GrpcService implements OnModuleInit {
  // @ts-ignore
  private relayerService: Relayer;

  constructor(@Inject(PROVIDER_KEYS.AXELAR_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.relayerService = this.client.getService<Relayer>(RELAYER_SERVICE);
  }

  async verify(contractCallEvent: ContractCallEvent) {
    const replaySubject = new ReplaySubject<VerifyRequest>();

    replaySubject.next({
      message: {
        id: contractCallEvent.id,
        sourceChain: contractCallEvent.sourceChain,
        sourceAddress: contractCallEvent.sourceAddress,
        destinationChain: contractCallEvent.destinationChain,
        destinationAddress: contractCallEvent.destinationAddress,
        payload: contractCallEvent.payload,
      },
    });
    replaySubject.complete();

    // TODO: Check if this works correctly
    const result = this.relayerService.verify(replaySubject);
    await firstValueFrom(result);
  }
}
