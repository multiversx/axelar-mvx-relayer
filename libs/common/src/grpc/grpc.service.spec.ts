import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { Observable } from 'rxjs';
import {
  Amplifier,
  Error,
  ErrorCode,
  VerifyRequest,
  VerifyResponse,
} from '@mvx-monorepo/common/grpc/entities/amplifier';
import { ClientGrpc } from '@nestjs/microservices';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { ContractCallEvent, ContractCallEventStatus } from '@prisma/client';

describe('ContractCallProcessor', () => {
  let amplifierService: Amplifier;

  let client: DeepMocked<ClientGrpc>;
  let contractCallEventRepository: DeepMocked<ContractCallEventRepository>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: GrpcService;

  const errorQueue: Error[] = [];

  beforeEach(async () => {
    // @ts-ignore
    amplifierService = {
      verify(requestStream: Observable<VerifyRequest>): Observable<VerifyResponse> {
        return new Observable<VerifyResponse>((observer) => {
          requestStream.subscribe({
            next: (request) => {
              const item = errorQueue.shift();

              // Simulate receiving a response for each request
              observer.next({
                message: request.message,
                error: item,
              });
            },
            error: (err) => observer.error(err),
            complete: () => observer.complete(),
          });
        });
      },
    };

    client = createMock();
    contractCallEventRepository = createMock();
    apiConfigService = createMock();

    client.getService.mockReturnValue(amplifierService);

    const moduleRef = await Test.createTestingModule({
      providers: [GrpcService],
    })
      .useMocker((token) => {
        if (token === ProviderKeys.AXELAR_GRPC_CLIENT) {
          return client;
        }

        if (token === ContractCallEventRepository) {
          return contractCallEventRepository;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();
    await moduleRef.init();

    service = moduleRef.get(GrpcService);
  });

  describe('verify', () => {
    it('Should handle event success', () => {
      const contractCallEvent: DeepMocked<ContractCallEvent> = createMock();
      contractCallEvent.id = 'id';

      service.verify(contractCallEvent);

      expect(contractCallEventRepository.updateStatus).toHaveBeenCalledTimes(1);
      expect(contractCallEventRepository.updateStatus).toHaveBeenCalledWith('id', ContractCallEventStatus.APPROVED);
    });

    it('Should handle event error', () => {
      const contractCallEvent: DeepMocked<ContractCallEvent> = createMock();
      contractCallEvent.id = 'id';

      errorQueue.push({
        error: 'some error',
        errorCode: ErrorCode.INTERNAL_ERROR,
      });

      service.verify(contractCallEvent);

      expect(contractCallEventRepository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
