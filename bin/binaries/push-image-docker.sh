#!/bin/bash
REPO_NAME=$1
TAG=$2

echo "CONSTRUINDO IMAGEM"
#echo "docker build -t \"$REPO_NAME:$TAG\" ."
docker build -t "$REPO_NAME:$TAG" .


echo "CRIANDO TAG"
#echo "docker tag $REPO_NAME:$TAG gcr.io/squid-apis/$REPO_NAME"
docker tag $REPO_NAME:$TAG gcr.io/squid-apis/$REPO_NAME:$TAG

echo "FAZENDO PUSH DO REPOSITORIO"
# echo "docker push gcr.io/squid-apis/$REPO_NAME:$TAG"
docker push gcr.io/squid-apis/$REPO_NAME:$TAG
