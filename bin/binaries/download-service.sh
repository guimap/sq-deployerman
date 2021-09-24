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

KUB_COMMAND="kubectl get SERVICE -n $NAMESPACE --no-headers --field-selector metadata.namespace=$NAMESPACE"

# create folder to save
PATH_SERVICE="$PATH_TO_SAVE/services"
mkdir -p $PATH_SERVICE

TOTAL_SERVICES=$($KUB_COMMAND | wc -l)

ROW=0
while read SERVICE; do
  ((++ROW))
  echo "[$ROW/$TOTAL_SERVICES] DOWNLOADING $SERVICE..."
  kubectl get svc $SERVICE -n $NAMESPACE -o yaml > "$PATH_SERVICE/$SERVICE.yml"

done < <($KUB_COMMAND | awk {'print $1'} | column -t)