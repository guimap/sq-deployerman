# Descrição

Essa lib faz deploy de branch especificas em ambientes ja criados

# Example
> node ./bin/index.js init -c config.json

ou 

```sh
npm install -g .
deployerman init -c config.json
```

para help digite
```sh
deployerman -h
```
# Requisitos
- Git configurado com ssh
- gcloud instalado com versão Google Cloud SDK 358.0.0 ou superior
- gcloud instalado de forma global - https://cloud.google.com/sdk/docs/install#deb
- docker instalado
- Previlégios de criar namespaces e dar apply e delete no kubernetes
- Previlegios de criar DNS cloud domain
- Baixar um `credentials.json` do seu usuario, com permissão de `storage.bucket`
- GCR configurado com o docker. Caso não saiba como fazer [siga esse tutorial](https://cloud.google.com/container-registry/docs/advanced-authentication)
```sh
gcloud auth configure-docker
```

--- 

- config.json example
- Explicando cada propriedade do config
- explicando como dar create-sandbox
- explicando como o create-sandbox funciona
- explicando como dar apply-project
- explicando como o apply-project funciona
- explicar o porque precisa da .env, o kubServiceName e o port
- explicando como dar drop-sandbox
- explicando como o drop-sandbox funciona


--- 
Precisa ter o .env que existe no lens, contando com CONTAINER_PORT GCR E TALS

Ter esse tuto completo https://cloud.google.com/container-registry/docs/advanced-authentication#gcloud
## Gerando token do github

Para fazer o download do repo é necessário gerar, primeiro accesse [Personal Access Tokens](https://github.com/settings/tokens/new) e crie uma nova token, define Expiration para _No Expiration_, selecione as seguintes permissões
- [x] repo

Gere a token e adicione no seu `.bashrc` ou `zshrc` como DEPLOYER_GITHUB_TOKEN 
```sh
  # resto do sh
  export $DEPLOYER_GITHUB_TOKEN=<MINHA-TOKNE>
```
