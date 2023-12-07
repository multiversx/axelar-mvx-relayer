import { NotifierEvent } from '../../event-processor/types';

export interface ProcessorInterface {
  handleEvent(rawEvent: NotifierEvent): Promise<void>;
}
