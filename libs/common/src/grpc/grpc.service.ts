import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { ClientGrpc } from '@nestjs/microservices';
import { ContractCallEvent, ContractCallEventStatus } from '@prisma/client';
import { Amplifier, SubscribeToApprovalsResponse, VerifyRequest } from '@mvx-monorepo/common/grpc/entities/amplifier';
import { Observable, Subject, Subscription } from 'rxjs';
import BigNumber from 'bignumber.js';
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';

const AMPLIFIER_SERVICE = 'Amplifier';

@Injectable()
export class GrpcService implements OnModuleInit {
  // @ts-ignore
  private amplifierService: Amplifier;
  private readonly axelarContractVotingVerifier: string;
  private readonly logger: Logger;

  private verifySubscription: Subscription | null = null;
  private requestVerifySubject: Subject<VerifyRequest> | null = null;

  constructor(
    @Inject(ProviderKeys.AXELAR_GRPC_CLIENT) private readonly client: ClientGrpc,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
    this.logger = new Logger(GrpcService.name);
  }

  onModuleInit() {
    this.amplifierService = this.client.getService<Amplifier>(AMPLIFIER_SERVICE);
  }

  verify(contractCallEvent: ContractCallEvent) {
    if (
      !this.verifySubscription ||
      this.verifySubscription.closed ||
      !this.requestVerifySubject ||
      this.requestVerifySubject.closed
    ) {
      if (this.verifySubscription && !this.verifySubscription.closed) {
        this.verifySubscription.unsubscribe();
      }

      this.requestVerifySubject = new Subject<VerifyRequest>();
      this.verifySubscription = this.amplifierService.verify(this.requestVerifySubject.asObservable()).subscribe({
        next: async (response) => {
          if (!response.error && response.message) {
            this.logger.debug(`Succesfully verified contract call event ${response.message.id}!`);

            await this.contractCallEventRepository.updateStatus(response.message.id, ContractCallEventStatus.APPROVED);

            return;
          }

          // TODO: In case of some errors, should we just mark the message directly as failed?

          this.logger.warn(`Verify contract call event ${response.message?.id} was not successful. Will be retried.`, response);
        },
        error: (err) => {
          this.logger.error(`Verify stream ended with error...`, err);

          this.verifySubscription?.unsubscribe();
        },
      });
    }

    const request = {
      message: {
        id: contractCallEvent.id,
        sourceChain: contractCallEvent.sourceChain,
        sourceAddress: contractCallEvent.sourceAddress,
        destinationChain: contractCallEvent.destinationChain,
        destinationAddress: contractCallEvent.destinationAddress,
        payload: contractCallEvent.payload,
      },
    };

    this.requestVerifySubject.next(request);
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
  async verifyVerifierSet(
    messageId: string,
    signers: {
      signer: string;
      weight: BigNumber;
    }[],
    threshold: BigNumber,
    nonce: string,
  ) {
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
