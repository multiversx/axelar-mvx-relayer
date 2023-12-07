import { Test, TestingModule } from '@nestjs/testing';
import { GasServiceProcessor } from './gas-service.processor';

describe('GasServiceProcessor', () => {
  let service: GasServiceProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GasServiceProcessor],
    }).compile();

    service = module.get<GasServiceProcessor>(GasServiceProcessor);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
