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
      console.error('Worker error:', err);
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }
};

async function handleWebSocket(request, env) {
  const url = new URL(request.url);
  const uuid = env.UUID || "9d166b44-f286-4906-8fac-5a6a7b8c6f66";
  
  // Create WebSocket pair
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  
  // Accept the WebSocket connection
  server.accept();
  
  // Simple echo/proxy implementation
  server.addEventListener('message', async (event) => {
    try {
      // For now, just echo back or process data
      // You can modify this to forward to actual target
      const response = await fetch('https://cf-vod.nimo.tv', {
        method: 'GET',
        headers: {
          'Host': 'cf-vod.nimo.tv',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.ok) {
        server.send(`Connected to target: ${response.status}`);
      } else {
        server.send(`Target error: ${response.status}`);
      }
    } catch (error) {
      console.error('Proxy error:', error);
      server.send(`Error: ${error.message}`);
    }
  });
  
  // Handle close events
  server.addEventListener('close', () => {
    console.log('WebSocket closed');
  });
  
  server.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function getConfigInfo(request, env) {
  const url = new URL(request.url);
  const host = url.hostname;
  const uuid = env.UUID || "9d166b44-f286-4906-8fac-5a6a7b8c6f66";
  
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

Bug Host: cf-vod.nimo.tv

Client Setup:
1. Copy the configuration URL above
2. Import it into your V2Ray client
3. Connect and enjoy!

Status: Worker is running (Simplified Mode)
`;
}
