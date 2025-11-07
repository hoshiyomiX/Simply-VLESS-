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
  const clientUUID = env.UUID || "9d166b44-f286-4906-8fac-5a6a7b8c6f66";
  
  // Create WebSocket pair
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  
  // Accept the WebSocket connection
  server.accept();
  
  // Buffer for incoming data
  let buffer = new Uint8Array();
  let authenticated = false;
  let targetSocket = null;
  
  // Handle incoming messages
  server.addEventListener('message', async (event) => {
    try {
      // Convert data to Uint8Array if it's not already
      const data = event.data instanceof Uint8Array 
        ? event.data 
        : new TextEncoder().encode(event.data);
      
      // Append to buffer
      buffer = new Uint8Array([...buffer, ...data]);
      
      // If not authenticated yet, try to authenticate
      if (!authenticated) {
        if (buffer.length < 19) return; // Not enough data for VLESS header
        
        // Check VLESS protocol version (should be 0)
        if (buffer[0] !== 0) {
          server.close();
          return;
        }
        
        // Extract UUID (16 bytes)
        const uuid = Array.from(buffer.slice(1, 17))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        // Check if UUID matches
        if (uuid !== clientUUID.replace(/-/g, '')) {
          server.close();
          return;
        }
        
        // Extract protocol version (1 byte)
        const version = buffer[17];
        
        // Extract command (1 byte)
        const command = buffer[18];
        
        // Only support TCP (command = 1)
        if (command !== 1) {
          server.close();
          return;
        }
        
        // Extract address type (1 byte)
        if (buffer.length < 20) return; // Not enough data for address type
        
        const addressType = buffer[19];
        let address, addressLength, port;
        
        // Parse address based on type
        if (addressType === 1) { // IPv4
          if (buffer.length < 24) return; // Not enough data for IPv4
          address = Array.from(buffer.slice(20, 24)).join('.');
          addressLength = 4;
        } else if (addressType === 2) { // Domain
          if (buffer.length < 21) return; // Not enough data for domain length
          const domainLength = buffer[20];
          if (buffer.length < 21 + domainLength) return; // Not enough data for domain
          address = new TextDecoder().decode(buffer.slice(21, 21 + domainLength));
          addressLength = 1 + domainLength;
        } else if (addressType === 3) { // IPv6
          if (buffer.length < 36) return; // Not enough data for IPv6
          const ipv6Parts = [];
          for (let i = 0; i < 8; i++) {
            const part = buffer.slice(20 + i * 2, 22 + i * 2);
            ipv6Parts.push(Array.from(part).map(b => b.toString(16).padStart(2, '0')).join(''));
          }
          address = ipv6Parts.join(':');
          addressLength = 16;
        } else {
          server.close();
          return;
        }
        
        // Extract port (2 bytes)
        if (buffer.length < 20 + addressLength + 2) return; // Not enough data for port
        port = (buffer[20 + addressLength] << 8) | buffer[21 + addressLength];
        
        // We're authenticated now
        authenticated = true;
        
        // Connect to target
        try {
          targetSocket = await connectToTarget(address, port);
          
          // Send any remaining data in buffer to target
          if (buffer.length > 20 + addressLength + 2) {
            const remainingData = buffer.slice(20 + addressLength + 2);
            await targetSocket.write(remainingData);
          }
          
          // Clear buffer
          buffer = new Uint8Array();
          
          // Handle data from target to client
          targetSocket.readable.pipeTo(
            new WritableStream({
              write(chunk) {
                if (server.readyState === WebSocket.OPEN) {
                  server.send(chunk);
                }
              }
            })
          );
          
          // Handle target socket close
          targetSocket.closed.then(() => {
            if (server.readyState === WebSocket.OPEN) {
              server.close();
            }
          }).catch(() => {
            if (server.readyState === WebSocket.OPEN) {
              server.close();
            }
          });
          
        } catch (error) {
          console.error('Failed to connect to target:', error);
          server.close();
        }
      } else {
        // Forward data to target
        if (targetSocket && targetSocket.writable) {
          await targetSocket.write(buffer);
          buffer = new Uint8Array();
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      server.close();
    }
  });
  
  // Handle client close
  server.addEventListener('close', () => {
    if (targetSocket) {
      targetSocket.close();
    }
  });
  
  // Handle client error
  server.addEventListener('error', (error) => {
    console.error('Client WebSocket error:', error);
    if (targetSocket) {
      targetSocket.close();
    }
  });
  
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function connectToTarget(address, port) {
  try {
    // Connect to the target server
    const socket = connect({
      hostname: address,
      port: port
    });
    
    return socket;
  } catch (error) {
    console.error('Failed to connect to target:', error);
    throw error;
  }
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

Note: Make sure to set your UUID in the worker environment variables for better security.
`;
}
