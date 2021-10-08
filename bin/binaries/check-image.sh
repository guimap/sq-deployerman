#!/bin/bash
URL=$1
TAG=$2

TAG_EXISTING="$(gcloud container images list-tags --format='get(tags)' $URL | grep $TAG)"

if [[ -z $TAG_EXISTING ]];
then
  echo 'Tag dont exists'
  exit 1
fi
echo 'Tag exists'