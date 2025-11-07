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
  const uuid = env.UUID || "9d166b44-f286-4906-8fac-5a6a7b8c6f66";
  
  // Create WebSocket pair
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  
  // Accept the WebSocket connection
  server.accept();
  
  // Handle VLESS protocol
  let isAuthenticated = false;
  let targetHost = null;
  let targetPort = null;
  
  server.addEventListener('message', async (event) => {
    try {
      const data = event.data;
      
      // First message should be VLESS header
      if (!isAuthenticated) {
        // VLESS protocol header parsing
        const buffer = new Uint8Array(data);
        const version = buffer[0];
        const uuidLength = buffer[1];
        const receivedUuid = new TextDecoder().decode(buffer.slice(2, 2 + uuidLength));
        
        // Check UUID
        if (receivedUuid !== uuid) {
          server.close(1008, "Authentication failed");
          return;
        }
        
        // Parse command and address
        let offset = 2 + uuidLength;
        const command = buffer[offset++];
        
        if (command === 1) { // TCP
          const addressType = buffer[offset++];
          
          if (addressType === 1) { // IPv4
            targetHost = `${buffer[offset++]}.${buffer[offset++]}.${buffer[offset++]}.${buffer[offset++]}`;
          } else if (addressType === 2) { // Domain
            const domainLength = buffer[offset++];
            targetHost = new TextDecoder().decode(buffer.slice(offset, offset + domainLength));
            offset += domainLength;
          } else if (addressType === 3) { // IPv6
            // IPv6 parsing would go here
            server.close(1003, "IPv6 not supported");
            return;
          }
          
          targetPort = (buffer[offset++] << 8) | buffer[offset++];
          
          isAuthenticated = true;
          
          // Connect to target using fetch for HTTP or WebSocket for WebSocket
          if (targetPort === 80 || targetPort === 443) {
            // Use fetch for HTTP/HTTPS
            const targetUrl = `http${targetPort === 443 ? 's' : ''}://${targetHost}:${targetPort}`;
            const remainingData = buffer.slice(offset);
            
            try {
              const response = await fetch(targetUrl, {
                method: "GET",
                headers: {
                  "Content-Type": "application/octet-stream",
                },
                body: remainingData.length > 0 ? remainingData : undefined,
              });
              
              const responseData = await response.arrayBuffer();
              server.send(new Uint8Array(responseData));
            } catch (error) {
              console.error("Fetch error:", error);
              server.close(1011, "Connection to target failed");
            }
          } else {
            // For non-HTTP ports, we'll simulate a connection
            // In a real implementation, you'd need to use a different approach
            server.send(new TextEncoder().encode("Connected to " + targetHost + ":" + targetPort));
          }
        } else {
          server.close(1003, "Unsupported command");
        }
      } else {
        // Forward data to target (simplified for this example)
        if (targetHost && targetPort) {
          // In a real implementation, you'd forward this data to the target
          // For now, we'll just echo it back
          server.send(data);
        }
      }
    } catch (error) {
      console.error("Message handling error:", error);
      server.close(1011, "Protocol error");
    }
  });
  
  server.addEventListener('close', () => {
    console.log("WebSocket closed");
  });
  
  server.addEventListener('error', (error) => {
    console.error("WebSocket error:", error);
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

Client Setup:
1. Copy the configuration URL above
2. Import it into your V2Ray client (v2rayN, Clash, etc.)
3. Connect and enjoy!

Note: This is a simplified implementation for demonstration purposes.
`;
}
