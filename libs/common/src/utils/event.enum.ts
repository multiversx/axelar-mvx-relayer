export enum EventIdentifiers {
  CALL_CONTRACT = 'callContract',
  APPROVE_MESSAGES = 'approveMessages',
  ROTATE_SIGNERS = 'rotateSigners',
  VALIDATE_MESSAGE = 'validateMessage',
}

export enum Events {
  CONTRACT_CALL_EVENT = 'contract_call_event',
  MESSAGE_APPROVED_EVENT = 'message_approved_event',
  SIGNERS_ROTATED_EVENT = 'signers_rotated_event',
  MESSAGE_EXECUTED_EVENT = 'message_executed_event',

  GAS_PAID_FOR_CONTRACT_CALL_EVENT = 'gas_paid_for_contract_call_event',
  NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT = 'native_gas_paid_for_contract_call_event',
  GAS_ADDED_EVENT = 'gas_added_event',
  NATIVE_GAS_ADDED_EVENT = 'native_gas_added_event',
  REFUNDED_EVENT = 'refunded_event',
}
