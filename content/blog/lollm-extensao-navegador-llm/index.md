---
title: "LoLLM: extensão de navegador para usar LLM localmente"
description: "LoLLM é uma extensão cross-browser que traz ferramentas de IA (resumir, completar, melhorar e perguntar) para seu navegador sem depender de serviços centralizados — funcionando com qualquer endpoint compatível com OpenAI."
date: 2026-07-21T00:00:00-03:00
tags: ["llm", "browser-extension", "open-source", "privacy"]
categories: ["IA", "dataScience"]
author: "Rodrigo Borges"
draft: false
---

Uma das coisas que mais me incomoda no ecossistema atual de ferramentas de IA
é a dependência de serviços centralizados. Toda vez que um assistente novo
surge, a promessa é sempre a mesma — mas o controle dos dados, o modelo
utilizado e os custos ficam nas mãos de terceiros. Foi pensando nesse
problema que resolvi desenvolver o **LoLLM** (Leaf open-LLM).

## O que é o LoLLM?

LoLLM é uma extensão de navegador (funciona no **Firefox** e no **Chrome**)
que adiciona quatro ferramentas baseadas em LLM ao seu dia a dia:

- **Summarize** (Resumir): selecione qualquer texto na página, clique com o
  botão direito e escolha "Summarize" — um resumo conciso aparece em um popup.
- **Complete** (Completar): dentro de um editor (Overleaf, textarea ou
  contenteditable), selecione um texto e pressione `Alt+C` para continuar a
  escrita a partir dali.
- **Improve** (Melhorar): selecione o texto e pressione `Alt+I` — o texto
  original é comentado (com `%` no LaTeX) e uma versão melhorada é inserida
  abaixo.
- **Ask** (Perguntar): selecione uma instrução e pressione `Alt+A` para
  substituir o texto pela resposta do modelo.

## Por que isso é diferente?

A extensão não se conecta a uma API específica. Você configura três coisas:

1. **Endpoint URL** — a URL de qualquer servidor compatível com a API Chat
   Completion da OpenAI (pode ser OpenAI, vLLM, llama.cpp, Ollama, etc.).
2. **API Key** — a chave de autenticação do seu endpoint.
3. **Model** — o nome do modelo a ser usado.

Tudo fica armazenado no **storage local** do navegador. Nada sai da sua
máquina sem seu controle. O código é 100% aberto (licença MIT) e não tem
dependências externas — são três arquivos JavaScript, sem bundler, sem
transpilador, sem framework.

![Popup de configuração do LoLLM](/popup/LoLLM-screenshot.png)

## Origem e motivação

O projeto começou como um fork do
[GPT4Overleaf](https://github.com/e3ntity/gpt4overleaf), uma extensão que
integrava o modelo Gemini da Google ao editor do Overleaf. Na adaptação para
Firefox, algumas decisões importantes foram tomadas:

- Substituição do SDK da Gemini por uma chamada `fetch` direta a qualquer
  endpoint compatível com OpenAI.
- Troca do `storage.sync` pelo `storage.local` (sync exige conta Firefox e é
  instável para add-ons temporários).
- Simplificação da CSP e correção dos caminhos dos ícones.
- Adição do botão "Test connection" para descobrir automaticamente o caminho
  correto do endpoint.

## Para quem é útil

- **Pesquisadores** que escrevem em LaTeX no Overleaf e querem completar ou
  melhorar parágrafos sem sair do editor.
- **Usuários preocupados com privacidade** que preferem rodar modelos
  localmente (via Ollama, llama.cpp, LM Studio) e manter os dados sob seu
  controle.
- **Desenvolvedores** que precisam de uma extensão leve, sem dependências,
  fácil de auditar e modificar.

## Como contribuir

O repositório está em
[github.com/distintive/LoLLM](https://github.com/distintive/LoLLM). Como o
código é mínimo e sem dependências, contribuições são bem-vindas — seja
corrigindo bugs, adicionando ferramentas ou melhorando a documentação.

---

*LoLLM é um projeto open-source mantido pela
[Distintive](https://distintive.com.br) — inteligência para políticas
públicas.*
