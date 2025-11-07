export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // Handle WebSocket upgrade
      if (request.headers.get("Upgrade") === "websocket") {
        return handleWebSocket(request);
      }
      
      // Return configuration info for root path
      if (url.pathname === '/') {
        const uuid = env.UUID || "12345678-1234-1234-1234-123456789abc";
        const host = url.hostname;
        const vlessConfig = `vless://${uuid}@${host}:443?encryption=none&security=tls&type=ws&host=${host}&path=%2F#VLESS-WS-Worker`;
        
        return new Response(`
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
2. Import it into your V2Ray client
3. Connect and enjoy!
        `, {
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

async function handleWebSocket(request) {
  const [client, server] = Object.values(new WebSocketPair());
  
  // Accept the WebSocket connection
  server.accept();
  
  // Simple echo server for now - you can modify this to forward traffic
  server.addEventListener('message', event => {
    server.send(event.data);
  });
  
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}  
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
