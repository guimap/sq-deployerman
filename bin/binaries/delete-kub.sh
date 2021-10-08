#!/bin/bash

KUB_PATH=$1

kubectl delete -f $KUB_PATH/apps --recursive