import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { ClientGrpc } from '@nestjs/microservices';
import { ContractCallEvent } from '@prisma/client';
import {
  BroadcastRequest,
  Relayer,
  SubscribeToApprovalsResponse,
  VerifyRequest,
} from '@mvx-monorepo/common/grpc/entities/relayer';
import { first, Observable, ReplaySubject, timeout } from 'rxjs';
import BigNumber from 'bignumber.js';
import { ApiConfigService } from '@mvx-monorepo/common/config';

const RELAYER_SERVICE = 'Relayer';

const VERIFY_TIMEOUT = 30_000; // TODO: Check if this timeout is enough

@Injectable()
export class GrpcService implements OnModuleInit {
  // @ts-ignore
  private relayerService: Relayer;
  private readonly axelarContractVotingVerifier: string;

  constructor(
    @Inject(ProviderKeys.AXELAR_GRPC_CLIENT) private readonly client: ClientGrpc,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
  }

  onModuleInit() {
    this.relayerService = this.client.getService<Relayer>(RELAYER_SERVICE);
  }

  verify(contractCallEvent: ContractCallEvent) {
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

    return this.relayerService.verify(replaySubject).pipe(first(), timeout(VERIFY_TIMEOUT));
  }

  async getPayload(payloadHash: string): Promise<Buffer> {
    const result = await this.relayerService.getPayload({
      hash: Buffer.from(payloadHash, 'hex'),
    });

    return Buffer.from(result.payload);
  }

  subscribeToApprovals(chain: string, startHeight?: number | undefined): Observable<SubscribeToApprovalsResponse> {
    return this.relayerService.subscribeToApprovals({
      chain,
      startHeight,
    });
  }

  async verifyWorkerSet(messageId: string, newOperators: string[], newWeights: BigNumber[], newThreshold: BigNumber) {
    const weightsByAddresses: string[] = newOperators.reduce<any[]>((previousValue, operator, currentIndex) => {
      previousValue.push([operator, newWeights[currentIndex].toString()]);

      return previousValue;
    }, []);

    // JSON format is used by CosmWasm contracts running on Axelar
    const payload = Buffer.from(
      JSON.stringify({
        verify_worker_set: {
          message_id: messageId,
          new_operators: {
            weights_by_addresses: weightsByAddresses,
            threshold: newThreshold.toString(),
          },
        },
      }),
    );

    const request: BroadcastRequest = {
      address: this.axelarContractVotingVerifier,
      payload,
    };

    // TODO: Should we add a retry mechanism here?
    await this.relayerService.broadcast(request);
  }
}
