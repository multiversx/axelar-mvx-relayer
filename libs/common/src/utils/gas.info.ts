export class GasInfo {
  public value: number = 0;

  static UnwrapEgld: GasInfo = {
    value: 5_000_000,
  };

  static CollectFeesBase: GasInfo = {
    value: 5_000_000,
  };

  static CollectFeesExtra: GasInfo = {
    value: 1_000_000,
  };
}
