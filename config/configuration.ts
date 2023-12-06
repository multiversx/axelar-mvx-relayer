import * as process from 'process';

require("dotenv").config({
  path: process.env.NODE_ENV == 'test' ? '.env.test' : '.env',
});

// Needed here since it is used in a decorator where the ApiConfigService can not be used
export const EVENTS_NOTIFIER_QUEUE: string = process.env['EVENTS_NOTIFIER_QUEUE'] as string;

export default () => process.env;
