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
  const url = new URL(request.url);
  
  // Create WebSocket pair
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  
  // Accept the WebSocket connection
  server.accept();
  
  // Define bug host
  const bugHost = "cf-vod.nimo.tv";
  
  // Create a fetch request handler for HTTP requests
  const fetchHandler = async (request) => {
    const newUrl = new URL(request.url);
    newUrl.hostname = bugHost;
    
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual'
    });
    
    // Add or modify headers for bug host
    newRequest.headers.set('Host', bugHost);
    newRequest.headers.set('Origin', `https://${bugHost}`);
    newRequest.headers.set('Referer', `https://${bugHost}/`);
    
    try {
      const response = await fetch(newRequest);
      
      // Create a new response with modified headers
      const newResponse = new Response(response.body, response);
      
      // Modify response headers if needed
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.delete('cf-ray');
      
      return newResponse;
    } catch (error) {
      console.error('Fetch error:', error);
      return new Response('Error connecting to target', { status: 502 });
    }
  };
  
  // Handle WebSocket messages by converting to HTTP requests
  server.addEventListener('message', async (event) => {
    try {
      // Convert WebSocket message to HTTP request
      const data = event.data;
      
      // Create a mock request from the WebSocket data
      const mockRequest = new Request(`https://${bugHost}/`, {
        method: 'GET',
        headers: {
          'Host': bugHost,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        }
      });
      
      // Forward the request
      const response = await fetchHandler(mockRequest);
      
      // Send response back through WebSocket
      if (server.readyState === WebSocket.OPEN) {
        server.send(await response.text());
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  // Handle close events
  server.addEventListener('close', () => {
    console.log('WebSocket closed');
  });
  
  // Handle errors
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
2. Import it into your V2Ray client (v2rayN, Clash, etc.)
3. Make sure to set the Host header to cf-vod.nimo.tv in your client
4. Connect and enjoy!

Note: This worker is configured for use with cf-vod.nimo.tv bug host.
`;
}
