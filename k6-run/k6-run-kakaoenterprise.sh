#!/usr/bin/env bash

cd ./scripts
make
cd ../

set -o nounset -o errexit -o errtrace -o pipefail
set -o xtrace

export $(grep -v '^#' scripts/.env | xargs)

K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true
K6_PROMETHEUS_RW_TREND_STATS="min,p(25),med,p(75),p(90),p(95),p(99),max"

DOCKER_RUN="docker run --rm -it -v $(pwd):/app \
  -e K6_PROMETHEUS_RW_SERVER_URL=${K6_PROMETHEUS_RW_SERVER_URL} \
  -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=${K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM} \
  -e K6_PROMETHEUS_RW_TREND_STATS=${K6_PROMETHEUS_RW_TREND_STATS} \
  -e QUERYPIE_HOST_SCHEME=${QUERYPIE_HOST_SCHEME} \
  -e QUERYPIE_HOST=${QUERYPIE_HOST} \
  -e PROXY_HOST=${PROXY_HOST} \
  -e QUERYPIE_USER=${QUERYPIE_USER} \
  -e QUERYPIE_PASSWORD=${QUERYPIE_PASSWORD} \
  -e TEST_ROLE=${TEST_ROLE} \
  -e TEST_SERVER_GROUP=${TEST_SERVER_GROUP} \
  -e EXTERNAL_ACCESS_TOKEN=${EXTERNAL_ACCESS_TOKEN}"

${DOCKER_RUN} harbor.chequer.io/querypie/querypie-k6:1.0.1 run \
  --out experimental-prometheus-rw \
  --stage 0s:0,2m:20,\
2m:40,2m:60,2m:80,2m:100,2m:120,2m:140,2m:160,2m:180,2m:200,\
2m:180,2m:160,2m:140,2m:120,2m:100,2m:80,2m:60,2m:40,2m:20 \
scripts/sac.js
