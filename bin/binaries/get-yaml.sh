#!/bin/bash
POD=$1
NAMESPACE=$2
DOWNLOAD_PATH=$3
TYPE=$4
if [[ -z $POD ]]; then
  echo "NAME OF POD IS REQUIRED"
  exit 1
fi

if [[ -z $NAMESPACE ]]; then
  echo "NAMESPACE IS REQUIRED"
  exit 1
fi

if [[ -z $DOWNLOAD_PATH ]]; then
  echo "PATH TO DOWNLOAD IS REQUIRED"
  exit 1
fi
kubectl get $TYPE --field-selector=metadata.name=$POD -n $NAMESPACE -o yaml > "$DOWNLOAD_PATH/$POD-$TYPE.yaml"
