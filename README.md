Axelar Relayer for MultiversX blockchain

## Quick start

1. Run `npm install` in the project directory
2. Copy `.env.example` file to `.env` file and update the values
3. Run `docker-compose up -d`
4. Run `npm start` or `npm start:axelar-event-processor`

## Dependencies

1. Redis Server is required to be installed [docs](https://redis.io/).
2. PostgreSQL is required to be installed [docs](https://www.postgresql.org/).

In this repo there is a `docker-compose.yml` file providing these services so you can run them easily using `docker-compose up -d`

## Tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Regenerating gRPC Typescript interfaces from proto file

Make sure to have `protoc` installed https://grpc.io/docs/protoc-installation/.

Then you can compile the files using:
```
TS_ARGS=('lowerCaseServiceMethods=true'
    'outputEncodeMethods=false'
    'outputJsonMethods=false'
    'outputClientImpl=false'
    'snakeToCamel=true')
protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto\
    --ts_proto_out=./libs/common/src/grpc/entities\
    --proto_path=./libs/common/src/assets\
    --ts_proto_opt="$(IFS=, ; echo "${TS_ARGS[*]}")"\
    ./libs/common/src/assets/relayer.proto
```

Check out these resources for more information:
- https://github.com/stephenh/ts-proto/blob/main/NESTJS.markdown
- https://blog.stackademic.com/nestjs-grpc-typescript-codegen-9a342bbd32f9
