import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Client as AxelarGmpApiClient, Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { AxiosResponse } from 'axios';
import Event = Components.Schemas.Event;
import PublishEventsResult = Components.Schemas.PublishEventsResult;

describe('ContractCallProcessor', () => {
  let apiClient: DeepMocked<AxelarGmpApiClient>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: AxelarGmpApi;

  beforeEach(async () => {
    apiClient = createMock();
    apiConfigService = createMock();

    apiConfigService.getAxelarContractVotingVerifier.mockReturnValueOnce('mockVotingVerifier');

    const moduleRef = await Test.createTestingModule({
      providers: [AxelarGmpApi],
    })
      .useMocker((token) => {
        if (token === ProviderKeys.AXELAR_GMP_API_CLIENT) {
          return apiClient;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();
    await moduleRef.init();

    service = moduleRef.get(AxelarGmpApi);
  });

  describe('postEvents', () => {
    it('Should handle events success', async () => {
      const contractCallEvent: DeepMocked<Event> = createMock();
      const messageApprovedEvent: DeepMocked<Event> = createMock();

      apiClient.post.mockReturnValueOnce(
        Promise.resolve({
          data: {
            results: [
              {
                status: 'ACCEPTED',
                index: 0,
              },
              {
                status: 'ACCEPTED',
                index: 1,
              },
            ],
          },
        } as AxiosResponse<PublishEventsResult>),
      );

      await service.postEvents([contractCallEvent, messageApprovedEvent], 'txHash');

      expect(apiClient.post).toBeCalledTimes(1);
    });

    it('Should handle events error length', async () => {
      const contractCallEvent: DeepMocked<Event> = createMock();

      apiClient.post.mockReturnValueOnce(
        Promise.resolve({
          data: {
            results: [],
          },
        }),
      );

      await expect(service.postEvents([contractCallEvent], 'txHash')).rejects.toThrow('Not all events were sent');
    });

    it('Should handle events error retriable', async () => {
      const contractCallEvent: DeepMocked<Event> = createMock();

      apiClient.post.mockReturnValueOnce(
        Promise.resolve({
          data: {
            results: [
              {
                status: 'ERROR',
                index: 0,
                retriable: false, // Will only log error
              },
              {
                status: 'ERROR',
                index: 0,
                retriable: true,
              },
            ],
          },
        } as AxiosResponse<PublishEventsResult>),
      );

      await expect(service.postEvents([contractCallEvent, contractCallEvent], 'txHash')).rejects.toThrow(
        'Received retriable event error',
      );
    });
  });

  it('Should get tasks', async () => {
    apiClient.getTasks.mockReturnValueOnce(
      // @ts-ignore
      Promise.resolve({
        data: {
          tasks: [],
        },
      }),
    );

    const result = await service.getTasks('chain', 'lastUUID', 10);

    expect(result.data.tasks).toHaveLength(0);
    expect(apiClient.getTasks).toHaveBeenCalledTimes(1);
    expect(apiClient.getTasks).toHaveBeenCalledWith({
      chain: 'chain',
      after: 'lastUUID',
      limit: 10,
    });
  });
});
