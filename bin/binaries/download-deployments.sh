#!/bin/bash

NAMESPACE=$1
PATH_TO_SAVE=$2
if [ ! $NAMESPACE ]
then
  echo "SHOULD PASS NAMESPACE"
  exit 125
fi

if [ ! $PATH_TO_SAVE ]
then
  echo "SHOULD PASS A PATH TO SAVE YAML FILES"
  exit 125
fi

KUB_COMMAND="kubectl get deploy -n $NAMESPACE --no-headers --field-selector metadata.namespace=$NAMESPACE"

# create folder to save
PATH_DEPLOY="$PATH_TO_SAVE/deployments"
mkdir -p $PATH_DEPLOY

TOTAL_DEPLOYMENT=$($KUB_COMMAND | wc -l)

ROW=0
while read DEPLOY; do
  ((++ROW))
  if [[ -f "$PATH_DEPLOY/$DEPLOY.yml" ]]; then
    continue
  fi
  echo "[$ROW/$TOTAL_DEPLOYMENT] DOWNLOADING $DEPLOY..."
  kubectl get deploy $DEPLOY -n $NAMESPACE -o yaml > "$PATH_DEPLOY/$DEPLOY.yml"

done < <($KUB_COMMAND | awk {'print $1'} | column -t)