import { Test, TestingModule } from '@nestjs/testing';
import { GasCheckerService } from './gas-checker.service';

describe('GasCheckerService', () => {
  let service: GasCheckerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GasCheckerService],
    }).compile();

    service = module.get<GasCheckerService>(GasCheckerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
