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

Caso prefira, voce pode definir um nome customizável no seu arquivo de configuração na propriedade "github.github_token_name"