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

# create folder to save
PATH_INGRESS="$PATH_TO_SAVE/ingress"
mkdir -p $PATH_INGRESS

TOTAL_INGRES=$(kubectl get ing -n $NAMESPACE --no-headers | wc -l)

ROW=-1
while read INGRESS; do
  ((++ROW))


  SPLITED_RESULTS=($INGRESS)
  COUNT=0
  INGRESS_NAME=''
  INGRESS_HOST=''
  for word in $INGRESS; do
    if [ $COUNT -eq 0 ]
    then
      INGRESS_NAME=$word;
    fi

    if [ $COUNT -eq 1 ]
    then
      INGRESS_HOST=$word;
    fi

    if [ $COUNT -eq 2 ]
    then
      break;
    fi
    ((++COUNT))
  done
  echo "[$ROW/$TOTAL_INGRES] DOWNLOADING $INGRESS_NAME..."
  kubectl get ing $INGRESS_NAME -n $NAMESPACE -o yaml > "$PATH_INGRESS/$INGRESS_HOST.yml"

done < <(kubectl get ingress -n $NAMESPACE --no-headers | awk {'print $1" " $3'} | column -t)