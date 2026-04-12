import "./style.css";

type RemoteSession = {
  session_id: string;
  access_code: string;
  name: string;
  status: string;
  created_by: string;
  client_token: string;
  interaction_mode: string;
  capabilities: Record<string, unknown>;
  last_error?: string;
};

const state: {
  session: RemoteSession | null;
  iceServers: RTCIceServer[];
  peer: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  localStream: MediaStream | null;
  signalVersion: number;
  lastChatId: number;
  lastEventId: number;
  appliedCandidates: Set<string>;
  pollTimer: number | null;
} = {
  session: null,
  iceServers: [],
  peer: null,
  dataChannel: null,
  localStream: null,
  signalVersion: 0,
  lastChatId: 0,
  lastEventId: 0,
  appliedCandidates: new Set(),
  pollTimer: null,
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="app-shell">
    <section class="app-card">
      <div class="eyebrow">AGA Remote Assist</div>
      <h1>Agente desktop temporário</h1>
      <p>Execução em user-mode, com consentimento explícito e sessão temporária.</p>
      <div class="layout">
        <section class="panel">
          <label class="field">
            <span>URL do AGA</span>
            <input id="base-url" placeholder="https://seu-ambiente" />
          </label>
          <label class="field">
            <span>Código da sessão</span>
            <input id="access-code" maxlength="8" />
          </label>
          <label class="field">
            <span>Seu nome ou identificação</span>
            <input id="client-label" maxlength="80" />
          </label>
          <label class="field">
            <span><input id="supports-control" type="checkbox" /> Permitir interação se o ambiente suportar</span>
          </label>
          <div class="actions">
            <button id="claim-button" class="primary">Conectar</button>
            <button id="consent-button" class="primary" disabled>Permitir compartilhamento</button>
            <button id="end-button" class="danger" disabled>Encerrar sessão</button>
          </div>
          <div id="status" class="status">Aguardando dados da sessão.</div>
          <div id="banner" class="banner warning">O agente não persiste após o fim da sessão e não tenta contornar políticas do sistema.</div>
          <div id="indicator" class="session-indicator">Sessão inativa.</div>
        </section>
        <section class="panel">
          <video id="preview" class="preview" autoplay muted playsinline></video>
          <div class="chat-log" id="chat-log"></div>
          <div class="chat-compose">
            <textarea id="chat-input" rows="3" placeholder="Digite uma mensagem"></textarea>
            <button id="send-chat" class="primary" disabled>Enviar</button>
          </div>
        </section>
      </div>
    </section>
  </main>
`;

const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url")!;
const accessCodeInput = document.querySelector<HTMLInputElement>("#access-code")!;
const clientLabelInput = document.querySelector<HTMLInputElement>("#client-label")!;
const supportsControlInput = document.querySelector<HTMLInputElement>("#supports-control")!;
const claimButton = document.querySelector<HTMLButtonElement>("#claim-button")!;
const consentButton = document.querySelector<HTMLButtonElement>("#consent-button")!;
const endButton = document.querySelector<HTMLButtonElement>("#end-button")!;
const sendChatButton = document.querySelector<HTMLButtonElement>("#send-chat")!;
const preview = document.querySelector<HTMLVideoElement>("#preview")!;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const bannerEl = document.querySelector<HTMLDivElement>("#banner")!;
const indicatorEl = document.querySelector<HTMLDivElement>("#indicator")!;

function setStatus(text: string) {
  statusEl.textContent = text;
}

function setBanner(text: string) {
  bannerEl.textContent = text;
}

function setIndicator(text: string) {
  indicatorEl.textContent = text;
}

function baseUrl() {
  return (baseUrlInput.value || "").replace(/\/$/, "");
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<T>;
}

async function pollLoop() {
  if (!state.session?.client_token) {
    return;
  }
  const response = await fetch(
    `${baseUrl()}/aga/remote/session/poll?token=${encodeURIComponent(state.session.client_token)}&role=client&last_signal_id=${state.signalVersion}&last_chat_id=${state.lastChatId}&last_event_id=${state.lastEventId}`
  );
  const payload = await response.json();
  state.signalVersion = Number(payload.signal_version || state.signalVersion);
  state.session = payload.session;
  setStatus(`Sessão ${state.session?.status || "desconhecida"}.`);
  setIndicator(
    state.session?.status === "connected"
      ? `Sessão ativa: ${state.session.name}`
      : "Sessão inativa."
  );
  for (const message of payload.chat_messages || []) {
    const node = document.createElement("div");
    node.className = "chat-item";
    node.textContent = `${message.author_name || message.author_role}: ${message.body}`;
    chatLog.appendChild(node);
    state.lastChatId = Math.max(state.lastChatId, Number(message.id || 0));
  }
  if (payload.signal?.remote_description?.type && state.peer && !state.peer.currentRemoteDescription) {
    await state.peer.setRemoteDescription(payload.signal.remote_description);
    const answer = await state.peer.createAnswer();
    await state.peer.setLocalDescription(answer);
    await postJson("/aga/remote/signal/description", {
      token: state.session!.client_token,
      role: "client",
      description: state.peer.localDescription?.toJSON(),
    });
  }
  for (const candidate of payload.signal?.candidates || []) {
    const key = JSON.stringify(candidate || {});
    if (!state.peer || state.appliedCandidates.has(key)) {
      continue;
    }
    state.appliedCandidates.add(key);
    await state.peer.addIceCandidate(candidate);
  }
  state.pollTimer = window.setTimeout(pollLoop, 1000);
}

async function ensurePeer() {
  if (state.peer || !state.session?.client_token) {
    return;
  }
  state.peer = new RTCPeerConnection({ iceServers: state.iceServers });
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => state.peer?.addTrack(track, state.localStream!));
  }
  state.peer.onicecandidate = async (event) => {
    if (!event.candidate) {
      return;
    }
    await postJson("/aga/remote/signal/candidate", {
      token: state.session!.client_token,
      role: "client",
      candidate: event.candidate.toJSON(),
    });
  };
  state.peer.ondatachannel = (event) => {
    state.dataChannel = event.channel;
    state.dataChannel.onmessage = (messageEvent) => {
      const payload = JSON.parse(messageEvent.data || "{}");
      if (payload.type === "control:request") {
        setBanner("O atendente solicitou interação. O MVP não injeta mouse/teclado no sistema operacional.");
      }
      if (payload.type === "chat:message") {
        const node = document.createElement("div");
        node.className = "chat-item";
        node.textContent = `${payload.author_name || payload.author_role}: ${payload.body || ""}`;
        chatLog.appendChild(node);
      }
    };
  };
}

claimButton.addEventListener("click", async () => {
  setStatus("Validando sessão...");
  const response = await postJson<{ status: string; session?: RemoteSession; ice_servers?: RTCIceServer[]; message?: string }>(
    "/aga/remote/session/claim",
    {
      access_code: (accessCodeInput.value || "").trim().toUpperCase(),
      client_label: clientLabelInput.value || "",
      platform: "tauri-agent",
    }
  );
  if (response.status !== "ok" || !response.session) {
    setStatus(response.message || "Não foi possível validar a sessão.");
    return;
  }
  state.session = response.session;
  state.iceServers = response.ice_servers || [];
  consentButton.disabled = false;
  endButton.disabled = false;
  setStatus("Sessão validada. Aguardando consentimento.");
});

consentButton.addEventListener("click", async () => {
  try {
    state.localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (_error) {
    setStatus("A captura de tela foi bloqueada neste ambiente.");
    setBanner("O ambiente do cliente bloqueou a captura ou o recurso não está disponível.");
    return;
  }
  preview.srcObject = state.localStream;
  const response = await postJson<{ status: string; session?: RemoteSession; message?: string }>(
    "/aga/remote/session/consent",
    {
      client_token: state.session?.client_token,
      granted: true,
      interaction_mode: supportsControlInput.checked ? "interactive" : "view_only",
      capabilities: {
        supports_chat: true,
        supports_screen_share: true,
        supports_control: supportsControlInput.checked,
        platform: "tauri-agent",
      },
    }
  );
  if (response.status !== "ok" || !response.session) {
    setStatus(response.message || "Não foi possível registrar o consentimento.");
    return;
  }
  state.session = response.session;
  sendChatButton.disabled = false;
  await ensurePeer();
  await pollLoop();
});

sendChatButton.addEventListener("click", async () => {
  const body = (chatInput.value || "").trim();
  if (!body || !state.session?.client_token) {
    return;
  }
  chatInput.value = "";
  await postJson("/aga/remote/session/chat/send", {
    token: state.session.client_token,
    role: "client",
    body,
    author_name: clientLabelInput.value || "Cliente",
  });
});

endButton.addEventListener("click", async () => {
  if (!state.session?.client_token) {
    return;
  }
  await postJson("/aga/remote/session/end", {
    token: state.session.client_token,
    role: "client",
  });
  setStatus("Sessão encerrada.");
  setIndicator("Sessão inativa.");
});
