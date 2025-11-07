export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // Handle WebSocket upgrade
      if (request.headers.get("Upgrade") === "websocket") {
        return handleWebSocket(request, env);
      }
      
      // Return configuration info for root path
      if (url.pathname === '/') {
        return new Response(getConfigInfo(request, env), {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      // Default response
      return new Response('VLESS WebSocket Worker', { status: 200 });
    } catch (err) {
      return new Response(err.stack, { status: 500 });
    }
  }
};

async function handleWebSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  
  // Accept the WebSocket connection
  server.accept();
  
  // Connect to target server (you can change this)
  const targetHost = "www.google.com";
  const targetPort = 443;
  
  // Create WebSocket connection to target
  const targetSocket = new WebSocket(`wss://${targetHost}:${targetPort}`, {
    headers: {
      'Host': targetHost,
    }
  });
  
  // Handle client to target
  server.addEventListener('message', (event) => {
    if (targetSocket.readyState === WebSocket.OPEN) {
      targetSocket.send(event.data);
    }
  });
  
  // Handle target to client
  targetSocket.addEventListener('message', (event) => {
    if (server.readyState === WebSocket.OPEN) {
      server.send(event.data);
    }
  });
  
  // Handle close events
  server.addEventListener('close', () => {
    targetSocket.close();
  });
  
  targetSocket.addEventListener('close', () => {
    server.close();
  });
  
  // Handle errors
  server.addEventListener('error', (error) => {
    console.error('Client WebSocket error:', error);
    targetSocket.close();
  });
  
  targetSocket.addEventListener('error', (error) => {
    console.error('Target WebSocket error:', error);
    server.close();
  });
  
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function getConfigInfo(request, env) {
  const url = new URL(request.url);
  const host = url.hostname;
  const uuid = env.UUID || crypto.randomUUID();
  
  const vlessConfig = `vless://${uuid}@${host}:443?encryption=none&security=tls&type=ws&host=${host}&path=%2F#VLESS-WS-Worker`;
  
  return `
VLESS WebSocket Worker Configuration
=====================================

Your VLESS Configuration:
 ${vlessConfig}

Configuration Details:
- Protocol: VLESS
- UUID: ${uuid}
- Host: ${host}
- Port: 443
- Security: TLS
- Type: WebSocket
- Path: /

Client Setup:
1. Copy the configuration URL above
2. Import it into your V2Ray client (v2rayN, Clash, etc.)
3. Connect and enjoy!

Note: Make sure to set your UUID in the worker environment variables for better security.
`;
}
