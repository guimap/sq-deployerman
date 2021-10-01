#!/bin/bash

KUB_PATH=$1

echo "kubectl apply -f $KUB_PATH/namespace"
kubectl apply -f $KUB_PATH/namespace
kubectl apply -f $KUB_PATH/apps --recursive