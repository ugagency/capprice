CAP PRICE - Plataforma de Precificação (Front-End)

Este repositório contém o front-end da aplicação CAP PRICE, uma plataforma de simulação e precificação de asfalto.

O projeto foi construído em Python (Flask + Jinja) para servir um front-end dinâmico e interativo, com lógica de cliente em JavaScript modular. O ambiente de desenvolvimento é totalmente containerizado com Docker.

🎯 Objetivo

O propósito deste front-end é fornecer a interface do usuário e toda a interatividade. Ele está pronto para ser conectado a uma API de backend que processará as simulações de preço.

✨ Features do Front-End

Autenticação: Tela de Login (atualmente com autenticação mocada em JS).

Calculadora: Formulário completo para simulação de preços (Destino, Produto, Qtd, Preço Net, Refinaria).

Painel de Resultados: Exibe a melhor opção de preço e permite comparar até 3 opções através de abas.

Gráficos Dinâmicos: Três gráficos (Preço Final, Frete, Margem) gerados com Chart.js para comparar visualmente as opções.

Chat (Mock): Interface de chat "AI Price Manager" para futuras integrações.

Arquitetura JS Modular: Os scripts são carregados por página (main.js atua como um roteador) para manter o código limpo e organizado.

🛠️ Tecnologias Utilizadas (Stack)

Python 3.10+

Flask: Micro-framework para servir os templates Jinja e os arquivos estáticos.

Jinja2: Engine de templating para renderizar o HTML (base.html, login.html, etc.).

JavaScript (ESM): Código modular (main.js, pages/, services/) para a lógica de front-end.

Tailwind CSS: Framework de CSS para toda a estilização.

Chart.js: Biblioteca para a criação dos gráficos de resultados.

Docker & Docker Compose: Para criar um ambiente de desenvolvimento consistente.

Gunicorn: Servidor WSGI da aplicação dentro do container Docker.

🚀 Como Rodar o Projeto (Desenvolvimento)

Este projeto usa Docker para simplificar o setup. Você não precisa instalar Python ou Flask localmente, apenas o Docker.

Clone o repositório:

Bash

git clone [URL_DO_SEU_REPOSITORIO]
cd CAP-PRICE-APP
Crie o arquivo de ambiente: Crie um arquivo chamado .env na raiz do projeto. (Ele é usado pelo docker-compose.yml, mas ignorado pelo Git).

Bash

# .env
# Exemplo (pode adicionar chaves de API, etc. no futuro)
FLASK_ENV=development
Construa e suba o container: Este comando irá construir a imagem Docker (baseada no Dockerfile) e iniciar o serviço (definido no docker-compose.yml).

Bash

docker-compose up --build
Acesse a aplicação: Abra seu navegador e acesse a porta que definimos: ➡️ http://localhost:5050

A aplicação Flask estará rodando dentro do container na porta 5000, e o Docker está mapeando-a para a porta 5050 da sua máquina.

🏗️ Estrutura do Projeto

CAP-PRICE-APP/
├── app/
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       ├── main.js         # Roteador JS principal (carregado pelo base.html)
│   │       ├── pages/
│   │       │   ├── login.js      # Lógica da página de login
│   │       │   └── precificar.js # Lógica da página da calculadora
│   │       └── services/
│   │           └── simulationService.js # <-- PONTO DE INTEGRAÇÃO DA API
│   ├── templates/
│   │   ├── login/
│   │   │   └── login.html
│   │   ├── pages/
│   │   │   └── precificar.html
│   │   └── base.html
│   ├── routes/
│   │   └── main.py         # Rotas Flask (para servir as páginas HTML)
│   └── __init__.py         # Fábrica da aplicação Flask
├── .dockerignore           # Ignora arquivos do build do Docker
├── .gitignore              # Ignora arquivos do Git
├── .env                    # (Local - não versionado)
├── docker-compose.yml      # Orquestra o serviço do app
├── Dockerfile              # Define a imagem do app (Python + Gunicorn)
├── requirements.txt        # Dependências Python
└── run.py                  # Ponto de entrada da aplicação

👨‍💻 Para o Desenvolvedor Backend
Sua principal responsabilidade será construir a API de backend e conectá-la a este front-end.

Ponto de Integração Chave
O front-end está pronto para consumir a API. O ponto de integração é o arquivo: app/static/js/services/simulationService.js

Dentro deste arquivo, existe uma função chamada fetchSimulacao. Atualmente, ela usa um setTimeout para simular um delay de rede e retornar dados mocados (mock).

Sua Tarefa
Construir a API: Você pode usar o app/routes/main.py ou (preferencialmente) criar um novo blueprint de API (ex: app/routes/api.py) para registrar suas rotas de backend. O Flask já está servindo o front-end, então você pode adicionar suas rotas de API a ele.

Modificar o simulationService.js: Altere a função fetchSimulacao para fazer uma chamada fetch() (ou axios) real para a sua nova API.

Remover o Mock: Exclua o setTimeout e a lógica de createMockResponse quando a API estiver pronta.

Contrato da API (O que o Front-End Espera)
O front-end (precificar.js) espera que a sua API (ex: /api/simular) retorne um array de objetos no seguinte formato:

JSON

[
  {
    "origem": "Filial SP",
    "destino": "MG",
    "quantidade": 27,
    "precoNet": 3800.00,
    "frete": 450.00,
    "impostos": 280.00,
    "difal": 0.00,
    "cmv": 4580.50,
    "margem": 5.0,
    "precoFinal": 4821.58
  },
  {
    "origem": "Filial MG",
    "destino": "MG",
    "quantidade": 27,
    "precoNet": 3800.00,
    "frete": 310.00,
    "impostos": 310.00,
    "difal": 75.00,
    "cmv": 4545.50,
    "margem": 6.5,
    "precoFinal": 4861.49
  }
]

O front-end já está programado para:

Se o array tiver 1 item, ele mostra o resultado simples.

Se o array tiver mais de 1 item, ele ativa as abas e os gráficos comparativos.