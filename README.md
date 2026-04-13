# AGA Remote Assist Tauri Agent

Agente desktop temporário e leve para o MVP do AGA Remote Assist.

## Objetivo

- rodar em user-mode
- não instalar serviço persistente
- não iniciar com o Windows
- não tentar contornar políticas do sistema
- permitir consentimento explícito antes do compartilhamento

## Estado atual

Implementado:

- UI desktop mínima
- entrada por código
- claim de sessão no backend
- consentimento explícito
- captura de tela
- base do WebRTC
- base do RTCDataChannel
- chat via backend

Ainda não implementado:

- injeção de input no sistema operacional
- fallback TURN validado
- empacotamento e assinatura verificados neste ambiente

## Causa da falha no GitHub Actions

O workflow público com falha em 13 de abril de 2026 chegou até a etapa `Build Tauri app` e falhou antes do upload do artefato.

Diagnóstico da causa raiz mais provável:

- o `package.json` usava `build` para o frontend (`vite build`), enquanto o build completo do Tauri ficava em outro script
- o `tauri.conf.json` usava `bundle.targets: "all"`, o que abre espaço para tentar gerar formatos adicionais desnecessários no CI
- o `tauri.conf.json` também declarava `bundle.icon: []`, uma configuração vazia e frágil para o empacotamento
- o workflow copiava apenas um `.exe` solto, mas não coletava de forma robusta o binário portátil e o instalador gerado pelo bundle

Em conjunto, isso tornava o pipeline frágil na etapa de empacotamento Windows. A correção aplicada separa o build web do build Tauri, limita o bundle ao alvo `nsis` no CI e melhora a coleta e o debug dos artefatos.

Observação sobre logs:

- foi possível confirmar publicamente que a falha ocorreu na etapa `Build Tauri app`
- a API pública do GitHub não expôs o log bruto completo sem autenticação adicional, então a causa foi fechada por inspeção do run, da configuração do repositório e da estrutura do projeto

## Comandos

- `npm install`
- `npm run build:web`
- `npm run tauri:dev`
- `npm run tauri:build`
- `npm run build`
- `npm run build:portable:win`

## Build local

Para rodar localmente:

```bash
npm install
npm run tauri:dev
```

Para gerar build de produção:

```bash
npm install
npm run build
```

No Windows, para gerar o `.exe` portátil e o instalador NSIS:

```powershell
npm install
npm run build:portable:win
```

## Gerando o EXE portátil

Em um Windows com Rust/Tauri instalados:

```powershell
cd desktop_agent/aga-remote-assist-tauri
scripts\build_windows_portable.cmd
```

Resultado esperado:

- o script compila o agente
- copia o executável para `release/AGA-Remote-Assist.exe`
- opcionalmente copia o instalador NSIS para `release/`
- a rota `/aga/remote/agent/download` passa a entregar o `.exe` em vez do pacote fonte

## GitHub Actions

O workflow `.github/workflows/build-windows.yml` agora:

- roda em `workflow_dispatch`
- roda em `push` para `main`
- instala Node LTS
- instala Rust stable
- verifica o WebView2 sem transformar isso em ponto de falha do pipeline
- builda o frontend
- builda o app Tauri para Windows com bundle `nsis`
- publica os artefatos em `release/`

Para baixar o `.exe` via Actions:

1. abra a aba `Actions` do repositório
2. execute ou abra um run do workflow `Build Windows EXE`
3. baixe o artefato `aga-remote-assist-windows`
