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

## Comandos

- `npm install`
- `npm run tauri:dev`
- `npm run tauri:build`
- `npm run build:portable:win`

## Gerando o EXE portátil

Em um Windows com Rust/Tauri instalados:

```powershell
cd desktop_agent/aga-remote-assist-tauri
scripts\build_windows_portable.cmd
```

Resultado esperado:

- o script compila o agente
- copia o executável para `release/AGA-Remote-Assist.exe`
- a rota `/aga/remote/agent/download` passa a entregar o `.exe` em vez do pacote fonte
