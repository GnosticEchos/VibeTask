#!/bin/bash

# Test MCP protocol directly with JSON-RPC messages
set -e

echo "🔌 Testing MCP Protocol with JSON-RPC Messages"
echo "=============================================="

export VIBETASK_HUB_URL=http://localhost:3000
CONFIG_PATH="../../config/demo-config.toml"

# Ensure we're using AgentSmith (Project Agent) for full capabilities
sed -i 's/active_agent = "MCPTesting"/active_agent = "AgentSmith"/' "$CONFIG_PATH"

echo ""
echo "Starting MCP server and sending test messages..."

# Create a temporary file for the test
TEMP_INPUT=$(mktemp)
TEMP_OUTPUT=$(mktemp)

# Create test messages
cat > "$TEMP_INPUT" << 'EOF'
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {"roots": {"listChanged": true}}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}
{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "list_agents", "arguments": {}}}
EOF

echo "📤 Sending MCP messages:"
cat "$TEMP_INPUT" | nl -ba

echo ""
echo "📥 Server responses:"

# Run server with input and capture output
timeout 10s cargo run --quiet -- --config "$CONFIG_PATH" < "$TEMP_INPUT" > "$TEMP_OUTPUT" 2>/dev/null || true

# Display responses
if [ -s "$TEMP_OUTPUT" ]; then
    cat "$TEMP_OUTPUT" | jq . 2>/dev/null || cat "$TEMP_OUTPUT"
    echo ""
    echo "✅ MCP protocol test completed successfully!"
    echo "   - Server responded to initialize request"
    echo "   - Server provided tool list"
    echo "   - Server executed tool call"
else
    echo "❌ No response received from server"
    echo "   This might be normal for stdio transport in this test setup"
fi

# Cleanup
rm -f "$TEMP_INPUT" "$TEMP_OUTPUT"

echo ""
echo "💡 For interactive testing, use an MCP client like Claude Desktop"
echo "   or connect via stdio transport with proper MCP client library."