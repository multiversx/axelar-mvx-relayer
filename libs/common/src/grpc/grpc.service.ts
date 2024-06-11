import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { ClientGrpc } from '@nestjs/microservices';
import { ContractCallEvent } from '@prisma/client';
import { Amplifier, SubscribeToApprovalsResponse, VerifyRequest } from '@mvx-monorepo/common/grpc/entities/amplifier';
import { first, Observable, ReplaySubject, timeout } from 'rxjs';
import BigNumber from 'bignumber.js';
import { ApiConfigService } from '@mvx-monorepo/common/config';

const AMPLIFIER_SERVICE = 'Amplifier';

const VERIFY_TIMEOUT = 30_000; // TODO: Check if this timeout is enough

@Injectable()
export class GrpcService implements OnModuleInit {
  // @ts-ignore
  private amplifierService: Amplifier;
  private readonly axelarContractVotingVerifier: string;

  constructor(
    @Inject(ProviderKeys.AXELAR_GRPC_CLIENT) private readonly client: ClientGrpc,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
  }

  onModuleInit() {
    this.amplifierService = this.client.getService<Amplifier>(AMPLIFIER_SERVICE);
  }

  verify(contractCallEvent: ContractCallEvent) {
    const replaySubject = new ReplaySubject<VerifyRequest>();

    replaySubject.next({
      message: {
        id: '0x' + contractCallEvent.id, // TODO: Check that this format is correct for the messageId
        sourceChain: contractCallEvent.sourceChain,
        sourceAddress: contractCallEvent.sourceAddress,
        destinationChain: contractCallEvent.destinationChain,
        destinationAddress: contractCallEvent.destinationAddress,
        payload: contractCallEvent.payload,
      },
    });
    replaySubject.complete();

    return this.amplifierService.verify(replaySubject).pipe(first(), timeout(VERIFY_TIMEOUT));
  }

  async getPayload(payloadHash: string): Promise<Buffer> {
    const result = await this.amplifierService.getPayload({
      hash: Buffer.from(payloadHash, 'hex'),
    });

    return Buffer.from(result.payload);
  }

  subscribeToApprovals(chain: string, startHeight?: number | undefined): Observable<SubscribeToApprovalsResponse> {
    return this.amplifierService.subscribeToApprovals({
      chains: [chain],
      startHeight,
    });
  }

  // TODO: This is not right... Wait for Amplifier API to provide more endpoints to do this more easily
  async verifyVerifierSet(messageId: string, signers: {
    signer: string,
    weight: BigNumber,
  }[], threshold: BigNumber, nonce: string) {
    // JSON format is used by CosmWasm contracts running on Axelar
    const payload = Buffer.from(
      JSON.stringify({
        verify_verifier_set: {
          message_id: '0x' + messageId, // TODO: Check that this format is correct for the messageId
          new_verifier_set: {
            signers,
            threshold: threshold.toString(),
            nonce,
          },
        },
      }),
    );

    return await this.amplifierService.broadcast({
      address: this.axelarContractVotingVerifier,
      payload,
    });
  }
}
