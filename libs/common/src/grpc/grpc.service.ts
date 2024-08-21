import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { ClientGrpc } from '@nestjs/microservices';
import { ContractCallEvent, ContractCallEventStatus } from '@prisma/client';
import { Amplifier, SubscribeToApprovalsResponse, VerifyRequest } from '@mvx-monorepo/common/grpc/entities/amplifier';
import { firstValueFrom, Observable, retry, Subject, Subscription } from 'rxjs';
import BigNumber from 'bignumber.js';
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';

const AMPLIFIER_SERVICE = 'Amplifier';

const RETRY_DELAY = 5000; // 5 seconds

@Injectable()
export class GrpcService implements OnModuleInit {
  // @ts-ignore
  private amplifierService: Amplifier;
  private readonly axelarContractVotingVerifier: string;
  private readonly logger: Logger;

  private verifySubscription: Subscription | null = null;
  private requestVerifySubject: Subject<VerifyRequest>;

  constructor(
    @Inject(ProviderKeys.AXELAR_GRPC_CLIENT) private readonly client: ClientGrpc,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
    this.logger = new Logger(GrpcService.name);
    this.requestVerifySubject = new Subject<VerifyRequest>();
  }

  onModuleInit() {
    this.amplifierService = this.client.getService<Amplifier>(AMPLIFIER_SERVICE);
  }

  verify(contractCallEvent: ContractCallEvent) {
    if (!this.verifySubscription || this.verifySubscription.closed) {
      this.requestVerifySubject = new Subject<VerifyRequest>();
      this.verifySubscription = this.amplifierService
        .verify(this.requestVerifySubject.asObservable())
        .pipe(
          retry({
            delay: RETRY_DELAY,
          }),
        )
        .subscribe({
          next: async (response) => {
            if (response.error || !response.message) {
              this.logger.warn(
                `Verify contract call event ${response.message?.id} was not successful. Will be retried.`,
                response,
              );

              return;
            }

            this.logger.debug(`Successfully verified contract call event ${response.message.id}!`);

            await this.contractCallEventRepository.updateStatus(response.message.id, ContractCallEventStatus.APPROVED);
          },
          error: (err) => {
            this.logger.error(`Verify stream ended with error... Will restart`, err);
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

    this.logger.debug(`Sent contract call event to Amplifier API for verification, id: ${contractCallEvent.id}`);
  }

  async getPayload(payloadHash: string): Promise<Buffer> {
    try {
      const result = await firstValueFrom(
        this.amplifierService.getPayload({
          hash: Buffer.from(payloadHash, 'hex'),
        }),
      );

      if (!result?.payload) {
        this.logger.warn(`Failed to get payload for payload hash ${payloadHash} ${JSON.stringify(result)}`);

        return Buffer.from('');
      }

      return Buffer.from(result.payload);
    } catch (e) {
      this.logger.error(`Error when trying to get payload for payload hash ${payloadHash}`, e);

      return Buffer.from('');
    }
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
          message_id: messageId,
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
