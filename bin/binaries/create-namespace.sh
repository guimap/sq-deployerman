#!/bin/bash

NAMESPACE_NAME=$1

if output=$(kubectl get ns sstaging | grep Active); then
  echo "Criando o namespace $NAMESPACE_NAME"
  # Não existe, cria-se um
  kubectl create namespace $NAMESPACE_NAME
else
  echo "O namespace $NAMESPACE_NAME já existe"
fi