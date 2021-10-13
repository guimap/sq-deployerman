# Descrição

Essa lib faz deploy de branch especificas em ambientes ja criados.
Essa lib prever projetos apenas em JS, então python e Go não estão previstos aqui.

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
- Ter o comando _make_  instalado. `sudo apt-get install build-essential`
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
# Como Instalar 
- Clone o projeto
- Entre no projeto e de um `make install` para instalar o projeto de forma global e dar permissão de execução
- Após isso, crie um arquivo `config.json` usando como referência o modelo [config.example.json](./config.example.json)
- Use os comandos listado nas seção [comandos](#comandos)

# Arquivo de configuração
Para cada comando, ele sempre será acompanhado de um arquivo de configuração, que segue esse [modelo](./config.example.json)


## Propriedades config.json

| Propriedade | Tipo | Required | Descrição | Exemplo |
|-------------|------|----------|-----------|---------|
|tempory_folder | String | true | Path da pasta onde conterá os arquivos yamls | `"./sandbox-folder"` |
|sandbox.name | String | true | Nome do sandbox (Minimo 1 caracter e no máximo 3) | `"pxt"` |
|sandbox.namespace_reference | String | true | Namespace que será usado como referencias | `"stg"` ou `"dev"` |
|sandbox.credentials_path | String | true | Caminho do seu arquivo `credentials.json`, ele é necéssário pois é com ele que conseguimos criar os cloud DNS | `"./credentials.json"` | 
|sandbox.kubernetes.cluster_ip | String | true | IP do cluster | `"12.345.678.90"` |
|sandbox.frotend_repos | `Array` | false | Lista dos projetos frontend | |
|sandbox.frotend_repos.repo | String | true | Link do repositorio Github | `"https://github.com/squidit/api-spiderman"` |
|sandbox.frotend_repos.endpointFile | String | false | Caso o projeto frontend tenha um arquivo de endpoint, coloque o path dele dentro do projeto, para que ele seja reescrito | `"src/enviroments/enviroment.ts"` |
|sandbox.frotend_repos.branch | String | true | Branch que deseja copiar | `"release"` |
|sandbox.frotend_repos.envFile | String | false | Arquivo .env do projeto, caso tenha alguma .env | `".env.ironman"` |
|sandbox.frotend_repos.domainPrefix | String | true | Prefixo da URL do projeto, por exemplo, para o ironman, aqui seria _portal_, assim a URL ficaria <SANDBOX-NAME>-portal.squidit.com.br | `"portal"` |
|sandbox.frotend_repos.kubServiceName | String | true | O nome do pod dentro do kubernetes | `"ironman"`|
|sandbox.frotend_repos.node_tag | String | true | Versão do node, voce pode conferir a versão dentro do `wercker.yaml` do projeto | `"erbium"` | 
|sandbox.frotend_repos.build_commands | String | false | Caso o projeto tenha comandos a mais para serem executados, é adicionado aqui, por exemplo, o hub requer que alem de dar npm install requer o `npm run build-semantic` e `npm run build` para que a imagem seja construida, esses comandos estão localizados dentro do `package.json` | `["npm run build-semantic", "npm run build"]` |
|projects | `Array` | false | Essa lista é usado no comando `apply-project`, são os projetos backend que será adicionados no sandbox | |
|projects.repo | String | true | Link do repositorio Github | `"https://github.com/squidit/web-ironman"` |
|projects.branch | String | true | Branch que deseja copiar | `"release"` |
|projects.kubNamespace | String | true | Namespace que será usado para copiar os yamls do projeto (ingress, services e deployment) | `"staging"` |
|projects.kubServiceName | String | true | Nome do deployment no kubernetes | `"vision-stg"` |
|projects.kubContainerPort | String | true | Porta que o container esta rodando, aqui voce pode consultar qual é a porta no wercker ou no proprio kubernetes | `"6081"` |
|projects.envFile | String | true | o caminho do arquivo .env do projeto, pois ele será usado para criar as envs do deployment, é importante apontar nesse arquivo para as url novas, por exemplo, se no .env possui apontamentos para o x23, então é preciso mudar de `https://stg-x23.squidit.com.br` para `https://<SANDBOX-NAME>-x23.squidit.com.br` | |
|projects.target_namespace | String | false | O namespace que o projeto sera aplicado, o default é o namespace do sandbox | |
|google.GCR_HOST | String | true | Host do Container registry, no nosso caso é _gcr.io_ | `"gcr.io"` |
|google.GCR_PROJECT_ID | String | true | Nome do projeto no cluster | `"squid-apis"` |


## Comandos

Todos os comandos a seguir usam o arquivo `config.json`, ou seja, todos os comandos são acompanhados do arquivo de configuração.

## Criar um sandbox `> create-sandbox`
Esse comando cria um ambiente isolado com os projetos e URLs proprias, o prefixo que é usado para criar as URLS está dentro da propriedade `sandbox.name`.
Esse comando basicamente é separado em duas etapas.
- Cria o namespace
- Copia de serviços backend
- Copia de serviços frontend

### Criação do namespace
O namespace é criado a partir da propriedade `sandbox.name`. Caso o namespace ja exista, ele não será criado
> **ATENÇÃO** ESSE COMANDO FOI TESTADO PARA CLONAR YAMLS DE AMBIENTE DE STG OU DEV, NÃO FOI TESTADO PARA AMBIENTES DE PRODUCTION

---
### Serviços Backend

Para os serviços de Backend, o que é feito é uma copia dos arquivos YAML do namespace informado na propriedade `sandbox.namespace_reference`, com os yaml de referencia (que é salvo em _<TEMPORY-FOLDER>/<SANDBOX-NAME>/kub-reference_), o script usa-o como referencia para criar yaml do sandbox, ou seja, com URLS das envs modificadas (Essas URLs são urls que apontam para outros projetos dentro do eco-sistema Squid), já usando o novo namespace e a nova URL, para depois cria-los dentro do namespace do sandbox, então, dados as variáveis:
- `tempory_folde`: ./minha-pasta
- `sandbox.name`: tst


Os yamls de referencias serão salvos em _./minha-pasta/tst/kub-reference_, já os YAML que serão usados para o sandbox serão salvos em _./minha-pasta/tst/kub-sandbox/apps_ e o yaml que cria o namespace do sandbox será salvo em _./minha-pasta/tst/kub-sandbox/namespace_

---
### Serviços Frontend

Para os serviços frontend, o que é feito aqui é, o clone do projeto `sandbox.frontend_repos.repo` usando a branch desejada (`sandbox.frontend_repos.branch`), após isso, é gerado uma imagem no Registry (`google.GCR_HOST` e `google.GCR_PROJECT_ID`) com a tag _deployerman_  para diferenciar. Após a imagem ter sido criado, é gerado um YAML customizado usando a imageweb-ironmanm recem criada, com o dominio novo _<SANDBOX-PREFIX>-app.squidit.com.br_ dentro da pasta temporaria `tempory_folder`, ou seja.
O repo será salvo em <TEMPORY-FOLDER>/<SANDBOX-NAME>/<FRONTEND-NAME>, ou seja, dado as variaveis:
- TEMPORY-FOLDER: ./minha/pasta
- SANDBOX-NAME: tst
- FRONTEND-NAME: web-ironman
o repo será salvo em _./minha/pasta/tst/web-ironman_ . Ja os YAML do sandbox salvos em: _./minha/pasta/tst/kub-sandbox_ 


Exemplo
```bash
> deployerman create-sandbox -c ./config.json
```

---

## Adicionar projetos Backends no sandbox `> apply-project`

Esse comando adiciona uma branch de um projeto backend especifico em um namespace (seja staging ou um namespace de sanbox)
> Esse comando requer que o seu commit ja tenha sido executado no wercker, ou seja, precisa que a imagem já esteja criada no GCR

### Como funciona
Esse comando clona o repo (`projects.repo`) usando a branch desejada (`projects.branch`), depois clonado ele gera o YAML modificado (com env modificada, ingress modificado).

Exemplo
```bash
> deployerman apply-project -c ./config.json
```
---

## Dropar ambiente sandbox `> drop-sandbox`
> Esse comando requer que o comando [create-sandbox](#Criar-um-sandbox) tenha sido executado

Quando o sandbox já foi usado, precisamos remove-lo, e isso inclui tanto apagar os serviços dentro do cluster kubernetes (para não consumir recursos de processamento) quanto deletar os DNS gerados.

### Como funciona
Como o sandbox ja existe, para remover é simples, basta usarmos as definições de YAML que estão dentro da pasta de `apps` em : _<TEMPORY-FOLDER>/<SANDBOX-NAME>/kub-sandbox/apps_, com isso o script da um `kubectl delete -f <TEMPORY-FOLDER>/<SANDBOX-NAME>/kub-sandbox/apps` e todo o ambiente será removido, ja para remover os DNS, pegamos os ingress dos yaml de sandbox e deletamos no cloud DNS.

Exemplo
```bash
> deployerman drop-sandbox -c ./config.json
```